"""KNMI-waarnemingen naar minuutprofielen met zichtbare modelaannames."""

import json
from bisect import bisect_left
from datetime import date, datetime, timedelta, timezone
from math import cos, isfinite, pi
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from .knmi import KNMIClient, KNMIError
from .profile import combined_mw, cubic_power_kw, day_minutes, power_kw, today

ROOT = Path(__file__).resolve().parent.parent
# Parkgegevens en modelaannames; bronnen en onderbouwing staan in docs/.
PARKS = {
    "fryslan": {
        "name": "Windpark Fryslân",
        "model": "Siemens Gamesa SWT-DD-130",
        "count": 89,
        "rated_kw": 4300,
        "hub_height": 115,
        # Seizoensexponent: alpha + alpha_seasonal * cos(...), zie shear_exponent.
        "alpha": 0.115,
        "alpha_seasonal": 0.065,
        "wake_deficit": 0.05,
        "station": "0-20000-0-06258",  # Houtribdijk
        "assumptions": "115 m ashoogte afgeleid uit tiphoogte en rotordiameter; seizoensexponent (circa 0,18 in de winter, "
                       "0,05 in de zomer) en station Houtribdijk zijn geijkt op productiedagen uit 2025 en 2026, geen parkmeting.",
    },
    "beabuorren": {
        "name": "Wynpark Beabuorren",
        "model": "Siemens SWT-1.3-62",
        "count": 8,
        "rated_kw": 1300,
        "hub_height": 60,
        "alpha": 0.20,
        "wake_deficit": 0.02,
        "station": "0-20000-0-06267",  # Stavoren
        "assumptions": "60 m ashoogte uit historisch lokaal nieuws, nog te bevestigen voor alle turbines; exponent 0,20 is een "
                       "land-aanname. Stavoren is het dichtstbijzijnde KNMI-station (circa 19 km), geen parkmeting.",
    },
}
FRYSLAN_SCENARIO = {
    "kind": "cubic_scenario", "model": PARKS["fryslan"]["model"],
    "rated_kw": 4300, "cut_in": 3, "rated_speed": 11.5, "cut_out": 25,
    "source": "https://windexchange.energy.gov/small-wind-guidebook",
    "status": "Benaderd kubisch scenario, geen fabrikantcurve. 3 / 11,5 / 25 m/s zijn gekozen modelaannames, "
              "geen bevestigde turbinespecificaties.",
}


def shear_exponent(park: dict, day: date) -> float:
    """Hoogte-exponent; met alpha_seasonal hoogst begin januari en laagst begin juli."""
    phase = 2 * pi * (day.timetuple().tm_yday - 1) / 365
    return park["alpha"] + park.get("alpha_seasonal", 0) * cos(phase)


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


def day_energy(power: list[float | None], timestamps: list[str], running: bool) -> tuple[float | None, str | None]:
    """Dagopbrengst in MWh; voor vandaag de opbrengst tot het laatste meetmoment.

    Alleen ontbrekende minuten aan het eind van een lopende dag worden genegeerd;
    een gat eerder op de dag maakt de opbrengst onbekend.
    """
    if None not in power:
        return sum(power) / 60, None
    known = len(power)
    while known and power[known - 1] is None:
        known -= 1
    if not running or not known or None in power[:known]:
        return None, None
    return sum(power[:known]) / 60, timestamps[known - 1]


CSV_HEADER = ["tijd_Europe_Amsterdam", "fryslan_wind_10m_ms", "beabuorren_wind_10m_ms",
              "fryslan_wind_ashoogte_ms", "beabuorren_wind_ashoogte_ms",
              "fryslan_geschat_MW", "beabuorren_geschat_MW", "gecombineerd_geschat_MW"]


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
                  wake: bool = True, alphas: dict[str, float | None] | None = None) -> dict:
    """Minuutprofielen voor beide parken; `alphas` vervangt per park de standaard hoogte-exponent."""
    moments = day_minutes(day)
    client = client or KNMIClient(ROOT / ".cache" / "knmi")
    features = client.locations().get("features", [])
    available = {f["id"]: f for f in features}
    profiles = {}
    local = ZoneInfo("Europe/Amsterdam")
    stamps = [t.astimezone(local).isoformat() for t in moments]
    running = day == today()
    for park_id, park in PARKS.items():
        station_id = (stations or {}).get(park_id) or park["station"]
        if station_id not in available:
            raise ValueError("Kies een KNMI-station uit de beschikbare stationslijst.")
        raw = client.observations(station_id, day)
        samples = parse_wind(raw, station_id)
        wind = interpolate_minutes(samples, moments)
        alpha_default = shear_exponent(park, day)
        custom = (alphas or {}).get(park_id)
        alpha = alpha_default if custom is None else custom
        hub = [None if v is None else v * (park["hub_height"] / 10) ** alpha for v in wind]
        curve = load_curve(park_id)
        power = [park_power_mw(v, park_id, curve, wake=wake) for v in hub]
        reference_points = []
        for t, value in samples:
            if moments[0] <= t < moments[-1] + timedelta(minutes=1):
                aswind = None if value is None else value * (park["hub_height"] / 10) ** alpha
                reference_points.append({"timestamp": t.astimezone(local).isoformat(), "wind_ms": value,
                                         "power_mw": park_power_mw(aswind, park_id, curve, wake=wake)})
        curve_metadata = ({k: v for k, v in curve.items() if k != "points"} if curve is not None
                          else dict(FRYSLAN_SCENARIO) if park_id == "fryslan" else None)
        profiles[park_id] = {
            **park, "alpha": alpha, "alpha_default": alpha_default, "alpha_custom": custom is not None, "station": available[station_id], "wind_ms": wind, "hub_wind_ms": hub,
            "power_mw": power, "missing_wind_minutes": wind.count(None),
            "curve": curve_metadata, "reference_points": reference_points,
            **dict(zip(("energy_mwh", "energy_until"), day_energy(power, stamps, running))),
            "observations": [{"interval_end": (t + timedelta(minutes=5)).isoformat(), "wind_ms": v} for t, v in samples],
        }
    combined = combined_mw(profiles["fryslan"]["power_mw"], profiles["beabuorren"]["power_mw"])
    references = [{p["timestamp"]: p["power_mw"] for p in profiles[key]["reference_points"]} for key in PARKS]
    combined_points = []
    for stamp in sorted(set(references[0]) | set(references[1]), key=datetime.fromisoformat):
        a, b = references[0].get(stamp), references[1].get(stamp)
        combined_points.append({"timestamp": stamp, "power_mw": None if a is None or b is None else a + b})
    method = ("KNMI-tienminutengemiddelden, geplaatst op intervalmidden en lineair geïnterpoleerd. "
              "Geen extrapolatie of overbrugging van meetgaten. Hoogtecorrectie met een exponent per park "
              "(seizoensafhankelijk voor Fryslân); geen afregeling, stilstand of luchtdichtheidcorrectie.")
    changed = [PARKS[key]["name"] for key in PARKS if profiles[key]["alpha_custom"]]
    if changed:
        method += " Eigen hoogte-exponent voor " + " en ".join(changed) + "."
    method += " " + (WAKE_STATUS if wake else "Zogverlies uitgeschakeld: alle turbines krijgen de ongestoorde wind.")
    return {"date": day.isoformat(), "timezone": "Europe/Amsterdam", "minutes": len(moments), "wake": wake,
            "timestamps": stamps, "parks": profiles,
            "combined_mw": combined, "combined_reference_points": combined_points,
            **dict(zip(("combined_energy_mwh", "combined_energy_until"), day_energy(combined, stamps, running))),
            "method": method}
