"""KNMI-waarnemingen naar minuutprofielen met zichtbare modelaannames."""

import json
from bisect import bisect_left
from datetime import date, datetime, time, timedelta, timezone
from math import isfinite
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from . import productie, windbron
from .knmi import KNMIClient, KNMIError
from .profile import combined_mw, cubic_power_kw, day_minutes, power_kw, today

ROOT = Path(__file__).resolve().parent.parent
# Parkgegevens en modelaannames; bronnen en onderbouwing staan in docs/. Station en hoogtevertaling
# komen uit windbron.py, zodat dagprofiel en opsplitsing dezelfde methode gebruiken.
PARKS = {
    "fryslan": {
        "name": "Windpark Fryslân",
        "model": "Siemens Gamesa SWT-DD-130",
        "count": 89,
        "rated_kw": 4300,
        "hub_height": windbron.HUB_HEIGHT["fryslan"],
        "wake_deficit": 0.05,
        "station": windbron.station_id(windbron.METHODS[windbron.DEFAULT]["fryslan"].stations[0]),
        "assumptions": "Ashoogte 115 m boven water: 180 m tiphoogte boven water (exploitant) min de halve rotordiameter van "
                       "130 m. Gedigitaliseerde fabrikantgrafiek als turbinecurve; zogverlies als scenario-aanname; 100 % beschikbaarheid, geen afregeling.",
    },
    "beabuorren": {
        "name": "Wynpark Beabuorren",
        "model": "Siemens SWT-1.3-62",
        "count": 8,
        "rated_kw": 1300,
        "hub_height": windbron.HUB_HEIGHT["beabuorren"],
        "wake_deficit": 0.02,
        "station": windbron.station_id(windbron.METHODS[windbron.DEFAULT]["beabuorren"].stations[0]),
        "assumptions": "60 m ashoogte uit historisch lokaal nieuws, nog te bevestigen voor alle turbines; secundaire "
                       "gepubliceerde curve, zogverlies als scenario; 100 % beschikbaarheid, geen afregeling.",
    },
}
# Deel van de modelopbrengst dat de waterstofsimulatie (opsplitsing) als aanbod krijgt, zoals op mijnwindpark.nl.
HYDROGEN_SHARE = {"fryslan": 0.10, "beabuorren": 1.0}
FRYSLAN_SCENARIO = {
    "kind": "cubic_scenario", "model": PARKS["fryslan"]["model"],
    "rated_kw": 4300, "cut_in": 3, "rated_speed": 11.5, "cut_out": 25,
    "source": "https://windexchange.energy.gov/small-wind-guidebook",
    "status": "Benaderd kubisch scenario, geen fabrikantcurve. 3 / 11,5 / 25 m/s zijn gekozen modelaannames, "
              "geen bevestigde turbinespecificaties.",
}


ALPHA_RANGE = (0.0, 0.6)


def parse_alpha(text: str | None) -> float | None:
    """Eigen hoogte-exponent uit de API (komma of punt); leeg betekent de standaard."""
    if text is None or not text.strip():
        return None
    value = float(text.strip().replace(",", "."))
    if not isfinite(value) or not ALPHA_RANGE[0] <= value <= ALPHA_RANGE[1]:
        raise ValueError("Hoogte-exponent moet tussen 0 en 0,6 liggen.")
    return value


WAKE_STATUS = ("Zogverlies als vaste gemiddelde snelheidsverlaging per park: 5 % voor Fryslân, 2 % voor Beabuorren. "
               "Gekozen scenario-aannames, niet gekalibreerd en zonder windrichting of turbineopstelling.")


def turbine_kw(speed: float, park_id: str, curve: dict | None) -> float | None:
    if curve is not None:
        return power_kw(speed, curve["points"], cut_out=curve["cut_out"])
    if park_id == "fryslan":
        return cubic_power_kw(speed, **{k: FRYSLAN_SCENARIO[k] for k in ("rated_kw", "cut_in", "rated_speed", "cut_out")})
    return None


def park_power_mw(speed: float | None, park_id: str, curve: dict | None, *, wake: bool = False) -> float | None:
    """Parkvermogen; met zogverlies krijgt elke turbine de parkgemiddelde verlaagde wind.

    Uitschakeling volgt de ongestoorde wind: is die buiten bereik, dan blijft het vermogen nul.
    """
    if speed is None:
        return None
    park = PARKS[park_id]
    kw = turbine_kw(speed, park_id, curve)
    if kw is None:
        return None
    if wake and kw > 0:
        kw = turbine_kw(speed * (1 - park["wake_deficit"]), park_id, curve)
    return kw * park["count"] / 1000


def parse_wind(payload: dict, station: str) -> list[tuple[datetime, float | None]]:
    if payload.get("type") != "CoverageCollection" or len(payload.get("coverages", [])) != 1:
        raise KNMIError("Verwacht één KNMI PointSeries voor het gekozen station.")
    coverage = payload["coverages"][0]
    if coverage.get("eumetnet:locationId") != station:
        raise KNMIError("KNMI-antwoord hoort bij een ander station.")
    parameter = payload.get("parameters", {}).get("ff", {})
    if parameter.get("unit", {}).get("symbol", {}).get("value") != "m/s":
        raise KNMIError("KNMI-windeenheid is geen m/s.")
    if parameter.get("measurementType") != {"method": "mean", "duration": "-PT10M"}:
        raise KNMIError("KNMI-wind is geen tienminutengemiddelde.")
    try:
        domain = coverage["domain"]
        if domain.get("domainType") != "PointSeries":
            raise ValueError("domain")
        stamps = domain["axes"]["t"]["values"]
        wind = coverage["ranges"]["ff"]
        axes, shape, values = wind["axisNames"], wind["shape"], wind["values"]
        if "t" not in axes or len(axes) != len(shape) or len(values) != len(stamps):
            raise ValueError("shape")
        if any(size != (len(stamps) if axis == "t" else 1) for axis, size in zip(axes, shape)):
            raise ValueError("shape")
        result = []
        for stamp, value in zip(stamps, values):
            moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
            if moment.tzinfo is None:
                raise ValueError("timezone")
            # Plaats het gemiddelde bij het midden van het oorspronkelijke interval.
            moment = moment.astimezone(timezone.utc) - timedelta(minutes=5)
            valid = isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and value >= 0
            result.append((moment, float(value) if valid else None))
        if any(a[0] >= b[0] for a, b in zip(result, result[1:])):
            raise ValueError("order")
        return result
    except (KeyError, TypeError, ValueError):
        raise KNMIError("Onverwachte structuur of tijdas in KNMI CoverageJSON.") from None


def interpolate_minutes(samples: list[tuple[datetime, float | None]], moments: list[datetime]) -> list[float | None]:
    times = [t for t, _ in samples]
    result = []
    for moment in moments:
        index = bisect_left(times, moment)
        if index < len(times) and times[index] == moment:
            result.append(samples[index][1])
        elif index == 0 or index == len(times):
            result.append(None)
        else:
            t0, v0 = samples[index - 1]
            t1, v1 = samples[index]
            if v0 is None or v1 is None or t1 - t0 > timedelta(minutes=10):
                result.append(None)
            else:
                ratio = (moment - t0) / (t1 - t0)
                result.append(v0 + ratio * (v1 - v0))
    return result


def validate_curve(data: dict, park_id: str) -> dict:
    park = PARKS[park_id]
    try:
        if not isinstance(data, dict) or not isinstance(data.get("source"), str):
            raise ValueError("Een curve-object met een bron-URL als tekst is vereist.")
        if data.get("status") is not None and (not isinstance(data["status"], str) or len(data["status"]) > 2000):
            raise ValueError("Curvestatus moet tekst zijn van maximaal 2.000 tekens.")
        if data["model"] != park["model"]:
            raise ValueError("Turbinemodel komt niet overeen met dit park.")
        source = urlsplit(data["source"])
        if source.scheme != "https" or not source.hostname or source.username or source.password:
            raise ValueError("Een bron-URL via HTTPS zonder credentials is vereist.")
        if not isinstance(data.get("points"), list) or len(data["points"]) > 1000:
            raise ValueError("Een lijst van maximaal 1.000 curvepunten is vereist.")
        points = [(float(v), float(p)) for v, p in data["points"]]
        cut_out = float(data["cut_out"])
        power_kw(0, points, cut_out=cut_out)
        if len(points) > 1000 or max(p for _, p in points) > park["rated_kw"]:
            raise ValueError("Curve bevat te veel punten of overschrijdt nominaal vermogen.")
        if max(p for _, p in points) < park["rated_kw"] * 0.95:
            raise ValueError("Curve bereikt het nominale vermogen niet; controleer model en eenheden (kW).")
        if points[-1][0] > cut_out - 0.01:
            raise ValueError("Laatste curvepunt moet onder cut-out liggen.")
        return {"model": park["model"], "source": data["source"], "cut_out": cut_out, "points": points,
                "status": data.get("status") or "Aangeleverde curve; herkomst niet onafhankelijk gecertificeerd."}
    except (KeyError, TypeError, OverflowError) as exc:
        raise ValueError("Curve vereist model, source, cut_out en points in m/s en kW.") from exc


def load_curve(park_id: str) -> dict | None:
    path = ROOT / ".cache" / "curves" / f"{park_id}.json"
    if not path.exists():
        path = Path(__file__).parent / "data" / f"{park_id}.json"
    return validate_curve(json.loads(path.read_text()), park_id) if path.exists() else None


def day_energy(power: list[float | None], timestamps: list[str], running: bool,
               per_hour: int = 60) -> tuple[float | None, str | None]:
    """Opbrengst in MWh uit vermogens van `per_hour` gelijke stappen per uur; voor vandaag tot het laatste meetmoment.

    Alleen ontbrekende stappen aan het eind van een lopende dag worden genegeerd;
    een gat eerder op de dag maakt de opbrengst onbekend.
    """
    if None not in power:
        return sum(power) / per_hour, None
    known = len(power)
    while known and power[known - 1] is None:
        known -= 1
    if not running or not known or None in power[:known]:
        return None, None
    return sum(power[:known]) / per_hour, timestamps[known - 1]


def day_intervals(day: date) -> list[datetime]:
    """Midden (UTC) van elk KNMI-tienminuteninterval van de Nederlandse kalenderdag: 144, of 138/150 bij de klokwissel."""
    minutes = day_minutes(day)
    return [minutes[0] + timedelta(minutes=5 + 10 * i) for i in range(len(minutes) // 10)]


def station_samples(pm: windbron.ParkMethod, raws: dict[str, list[tuple[datetime, float | None]]]
                    ) -> list[tuple[datetime, float | None, str | None]]:
    """Per tienminutenmoment de stationswind volgens de methode, met het gebruikte station."""
    lookup = {key: dict(samples) for key, samples in raws.items()}
    moments = sorted({t for samples in raws.values() for t, _ in samples})
    return [(t, *windbron.select(pm, {key: values.get(t) for key, values in lookup.items()})) for t in moments]


CSV_HEADER = ["tijd_Europe_Amsterdam", "fryslan_stationswind_10m_ms", "beabuorren_stationswind_10m_ms",
              "fryslan_wind_ashoogte_ms", "beabuorren_wind_ashoogte_ms",
              "fryslan_model_mogelijk_MW", "beabuorren_model_mogelijk_MW", "gecombineerd_model_mogelijk_MW"]


def nl_time(timestamp: str, repeated_hour: bool = False) -> str:
    """dd-mm-jjjj uu:mm; in het dubbele uur bij de wintertijdwissel met zomer- of wintertijd."""
    text = f"{timestamp[8:10]}-{timestamp[5:7]}-{timestamp[0:4]} {timestamp[11:16]}"
    if repeated_hour and timestamp[11:13] == "02":
        text += " zomertijd" if timestamp.endswith("+02:00") else " wintertijd"
    return text


def nl_number(value: float | None) -> str:
    """Zes decimalen, zonder overbodige nullen en met decimale komma."""
    return "" if value is None else (f"{value:.6f}".rstrip("0").rstrip(".") or "0").replace(".", ",")


def csv_rows(profile: dict) -> list[list[str]]:
    """CSV in Nederlandse notatie: datum dd-mm-jjjj en decimale komma (scheidingsteken ;)."""
    a, b = profile["parks"]["fryslan"], profile["parks"]["beabuorren"]
    repeated = profile["minutes"] > 1440
    rows = [CSV_HEADER]
    for i, timestamp in enumerate(profile["timestamps"]):
        values = (a["wind_ms"][i], b["wind_ms"][i], a["hub_wind_ms"][i], b["hub_wind_ms"][i],
                  a["power_mw"][i], b["power_mw"][i], profile["combined_mw"][i])
        rows.append([nl_time(timestamp, repeated)] + [nl_number(v) for v in values])
    return rows




def build_profile(day: date, stations: dict[str, str] | None = None, client: KNMIClient | None = None,
                  wake: bool = True, alphas: dict[str, float | None] | None = None,
                  method: str = windbron.DEFAULT) -> dict:
    """Minuutprofielen voor beide parken; `alphas` vervangt per park de standaard hoogtevertaling.

    Drie grootheden blijven gescheiden: wind op ashoogte (m/s), gemodelleerde mogelijke elektrische
    opbrengst (MW, MWh) en, voor Fryslân op dagen in het archief, de gemeten dagproductie.
    De dagopbrengst komt uit de oorspronkelijke tienminutenwaarden; de minuutlijn is alleen voor de grafiek.
    """
    moments = day_minutes(day)
    client = client or KNMIClient(ROOT / ".cache" / "knmi")
    features = client.locations().get("features", [])
    available = {f["id"]: f for f in features}
    methods = windbron.method(method)
    profiles = {}
    local = ZoneInfo("Europe/Amsterdam")
    stamps = [t.astimezone(local).isoformat() for t in moments]
    noon = datetime.combine(day, time(12), local)
    running = day == today()
    slots = day_intervals(day)
    slot_ends = [(t + timedelta(minutes=5)).astimezone(local).isoformat() for t in slots]
    fetched = {}
    for park_id, park in PARKS.items():
        pm = methods[park_id]
        chosen = (stations or {}).get(park_id)
        if chosen:
            pm = windbron.with_station(pm, chosen)
        ids = [windbron.station_id(key) for key in pm.stations]
        if any(station_id not in available for station_id in ids):
            raise ValueError("Kies een KNMI-station uit de beschikbare stationslijst.")
        for station_id in ids:
            if station_id not in fetched:
                fetched[station_id] = parse_wind(client.observations(station_id, day), station_id)
        samples = station_samples(pm, {key: fetched[sid] for key, sid in zip(pm.stations, ids)})
        wind = interpolate_minutes([(t, v) for t, v, _ in samples], moments)
        custom = (alphas or {}).get(park_id)
        factor = windbron.factor(park_id, pm, noon, custom)
        factor_default = windbron.factor(park_id, pm, noon)
        hub = [None if v is None else v * factor for v in wind]
        curve = load_curve(park_id)
        power = [park_power_mw(v, park_id, curve, wake=wake) for v in hub]
        by_slot = {t: v for t, v, _ in samples}
        interval_power = [park_power_mw(None if by_slot.get(t) is None else by_slot[t] * factor, park_id, curve, wake=wake)
                          for t in slots]
        reference_points = []
        for t, value, source in samples:
            if moments[0] <= t < moments[-1] + timedelta(minutes=1):
                aswind = None if value is None else value * factor
                reference_points.append({"timestamp": t.astimezone(local).isoformat(), "wind_ms": value, "hub_wind_ms": aswind,
                                         "power_mw": park_power_mw(aswind, park_id, curve, wake=wake), "station": source})
        curve_metadata = ({k: v for k, v in curve.items() if k != "points"} if curve is not None
                          else dict(FRYSLAN_SCENARIO) if park_id == "fryslan" else None)
        energy, until = day_energy(interval_power, slot_ends, running, per_hour=6)
        profiles[park_id] = {
            **park, "station": available[ids[0]], "stations": [available[i] for i in ids], "station_rule": pm.rule,
            "height_method": windbron.describe(park_id, pm, noon, custom),
            "factor": factor, "factor_default": factor_default,
            "alpha": custom if custom is not None else windbron.alpha_equivalent(park_id, factor, pm),
            "alpha_default": windbron.alpha_equivalent(park_id, factor_default, pm), "alpha_custom": custom is not None,
            "wind_ms": wind, "hub_wind_ms": hub, "power_mw": power, "missing_wind_minutes": wind.count(None),
            "interval_power_mw": interval_power, "missing_intervals": interval_power.count(None),
            "curve": curve_metadata, "reference_points": reference_points, "energy_mwh": energy, "energy_until": until,
            "observations": [{"interval_end": (t + timedelta(minutes=5)).isoformat(), "wind_ms": v, "station": source}
                             for t, v, source in samples],
        }
    combined = combined_mw(profiles["fryslan"]["power_mw"], profiles["beabuorren"]["power_mw"])
    combined_intervals = combined_mw(profiles["fryslan"]["interval_power_mw"], profiles["beabuorren"]["interval_power_mw"])
    references = [{p["timestamp"]: p["power_mw"] for p in profiles[key]["reference_points"]} for key in PARKS]
    combined_points = []
    for stamp in sorted(set(references[0]) | set(references[1]), key=datetime.fromisoformat):
        a, b = references[0].get(stamp), references[1].get(stamp)
        combined_points.append({"timestamp": stamp, "power_mw": None if a is None or b is None else a + b})
    combined_energy, combined_until = day_energy(combined_intervals, slot_ends, running, per_hour=6)
    method_text = (windbron.LABELS[method] + ". KNMI-tienminutengemiddelden op het intervalmidden; de dagopbrengst is de som "
                   "van de oorspronkelijke tienminutenwaarden, de minuutlijn is lineair geïnterpoleerd voor de grafiek. "
                   "Meetgaten worden niet overbrugd. Gemodelleerde mogelijke opbrengst: turbinecurve, zogverlies en 100 % "
                   "beschikbaarheid; geen afregeling, stilstand, netbeperking of luchtdichtheidcorrectie.")
    changed = [PARKS[key]["name"] for key in PARKS if profiles[key]["alpha_custom"]]
    if changed:
        method_text += " Eigen hoogte-exponent voor " + " en ".join(changed) + "."
    method_text += " " + (WAKE_STATUS if wake else "Zogverlies uitgeschakeld: alle turbines krijgen de ongestoorde wind.")
    return {"date": day.isoformat(), "timezone": "Europe/Amsterdam", "minutes": len(moments), "intervals": len(slots),
            "wake": wake, "wind_method": method, "timestamps": stamps, "parks": profiles,
            "combined_mw": combined, "combined_reference_points": combined_points,
            "combined_energy_mwh": combined_energy, "combined_energy_until": combined_until,
            "measured": measured_day(day, profiles["fryslan"]["energy_mwh"], running),
            "hydrogen": hydrogen_share({key: profiles[key]["energy_mwh"] for key in PARKS}),
            "method": method_text}


def measured_day(day: date, model_mwh: float | None, running: bool) -> dict | None:
    """Gemeten dagproductie van Fryslân naast het model; het verschil krijgt geen oorzaak toegeschreven."""
    measured = productie.load().get(day)
    if measured is None:
        return None
    difference = None if model_mwh is None or running else model_mwh - measured
    return {"park": "fryslan", "energy_mwh": measured, "source": productie.SOURCE,
            "model_minus_measured_mwh": difference,
            "note": "Dagtotaal. Verschil tussen model en gemeten productie; het model kent geen afregeling, "
                    "stilstand of netbeperking, maar een verschil is daarmee niet verklaard."}


def hydrogen_share(energies: dict[str, float | None]) -> dict:
    """Welk deel van de modelopbrengst de waterstofsimulatie als bruto aanbod krijgt (vóór BoP)."""
    parts = {key: None if value is None else value * HYDROGEN_SHARE[key] for key, value in energies.items()}
    total = None if None in parts.values() else sum(parts.values())
    return {"share": HYDROGEN_SHARE, "energy_mwh": parts, "total_mwh": total}
