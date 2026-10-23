"""Windbron en hoogtevertaling, gedeeld door het dagprofiel (`application.py`) en de opsplitsing.

Drie methoden:

- `onafhankelijk` (standaard): voor beide parken het gemiddelde per tien minuten van de twee
  KNMI-stations op het IJsselmeer, Houtribdijk en Stavoren (alleen als beide meten). Die keuze
  volgt uit ligging en uit hoe goed de bron de HARMONIE-wind (WINS50) op de parklocatie volgt.
  Wind op ashoogte = F × ff, met F per park en kalendermaand uit WINS50 2019–2021 (`ashoogte.py`).
  Geen productiegegevens.
- `productie_houtribdijk`: het oude dagprofiel. Houtribdijk met de seizoens-α die op productie
  van Windpark Fryslân is geijkt; Beabuorren Stavoren met α 0,20.
- `productie_hoogste`: de oude opsplitsing en `ijking.py`. Fryslân per tien minuten de hoogste
  van Houtribdijk en Stavoren (de ander als er één ontbreekt), verder als hierboven.

De oude methoden blijven bestaan om de vergelijking te kunnen herhalen; zie docs/afhankelijkheden.md.
"""

import json
from dataclasses import dataclass, replace
from datetime import datetime
from functools import lru_cache
from math import cos, log, pi
from pathlib import Path
from zoneinfo import ZoneInfo

TABLE = Path(__file__).parent / "data" / "ashoogte.json"
LOCAL = ZoneInfo("Europe/Amsterdam")
HUB_HEIGHT = {"fryslan": 115, "beabuorren": 60}
STATIONS = {"houtribdijk": ("Houtribdijk", "0-20000-0-06258"), "stavoren": ("Stavoren", "0-20000-0-06267")}


@dataclass(frozen=True)
class ParkMethod:
    """Hoe één park aan wind op ashoogte komt."""
    stations: tuple[str, ...]          # sleutels uit STATIONS (of een KNMI-station-ID)
    rule: str = "een"                  # "een": alleen dit station; "gemiddelde": alle stations moeten meten;
                                       # "hoogste": per moment de hoogste aanwezige (oude opsplitsing)
    height: str = "wins50"             # "wins50": maandfactor F; "alpha": (h/10)^α, eventueel met seizoensterm
    alpha: float = 0.0
    alpha_seasonal: float = 0.0
    factors: tuple[float, ...] | None = None   # vervangt de maandfactoren uit de tabel (gevoeligheid)
    hub_height: float | None = None            # alleen voor de α-methode; standaard HUB_HEIGHT


METHODS = {
    "onafhankelijk": {
        "fryslan": ParkMethod(("houtribdijk", "stavoren"), rule="gemiddelde"),
        "beabuorren": ParkMethod(("houtribdijk", "stavoren"), rule="gemiddelde"),
    },
    "productie_houtribdijk": {
        "fryslan": ParkMethod(("houtribdijk",), height="alpha", alpha=0.115, alpha_seasonal=0.065),
        "beabuorren": ParkMethod(("stavoren",), height="alpha", alpha=0.20),
    },
    "productie_hoogste": {
        "fryslan": ParkMethod(("houtribdijk", "stavoren"), rule="hoogste", height="alpha", alpha=0.115, alpha_seasonal=0.065),
        "beabuorren": ParkMethod(("stavoren",), height="alpha", alpha=0.20),
    },
}
DEFAULT = "onafhankelijk"
LABELS = {
    "onafhankelijk": "Productie-onafhankelijk: gemiddelde van Houtribdijk en Stavoren, hoogtevertaling uit WINS50 (HARMONIE) op de parklocatie",
    "productie_houtribdijk": "Oud dagprofiel: Houtribdijk met seizoens-α geijkt op productie van Windpark Fryslân",
    "productie_hoogste": "Oude opsplitsing: hoogste van Houtribdijk en Stavoren met seizoens-α geijkt op productie",
}


@lru_cache(maxsize=4)
def table(path: Path = TABLE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def station_key(station_id: str) -> str | None:
    return next((key for key, (_, sid) in STATIONS.items() if sid == station_id), None)


def method(name: str) -> dict[str, ParkMethod]:
    if name not in METHODS:
        raise ValueError(f"Onbekende windmethode {name!r}; kies uit {', '.join(METHODS)}.")
    return METHODS[name]


def with_station(pm: ParkMethod, station_id: str) -> ParkMethod:
    """Zelfde hoogtevertaling met een ander, door de gebruiker gekozen station (één station, geen terugval)."""
    key = station_key(station_id) or station_id
    return replace(pm, stations=(key,), rule="een")


def station_id(key: str) -> str:
    return STATIONS[key][1] if key in STATIONS else key


def select(pm: ParkMethod, values: dict[str, float | None]) -> tuple[float | None, str | None]:
    """Stationswind op 10 m voor één moment, met de bron. Ontbreekt de meting, dan None: geen invulling."""
    if pm.rule == "een":
        key = pm.stations[0]
        return values.get(key), (key if values.get(key) is not None else None)
    if pm.rule == "gemiddelde":
        found = [values.get(key) for key in pm.stations]
        return (None, None) if None in found else (sum(found) / len(found), "gemiddelde")
    present = [(values[key], key) for key in pm.stations if values.get(key) is not None]
    return max(present) if present else (None, None)


def month_factors(park_id: str, pm: ParkMethod) -> tuple[list[float], str]:
    """Maandfactoren voor de gekozen stationsbron, met een korte herkomst.

    Een station waarvoor geen factor is afgeleid krijgt alleen de hoogtetoename op de parklocatie
    uit WINS50 (v_as / v_10 boven het park); de stationsligging is dan niet gecorrigeerd.
    """
    if pm.factors is not None:
        return list(pm.factors), "opgegeven factoren"
    entry = table()["parken"][park_id]
    stations = sorted(station_id(key) for key in pm.stations)
    if pm.rule == entry["regel"] and stations == sorted(entry["stations"]):
        return entry["factor"], f"WINS50 voor {entry['bron']}"
    for item in entry["bronvergelijking"]:
        if pm.rule == ("een" if len(item["stations"]) == 1 else "gemiddelde") and stations == sorted(item["stations"]):
            return item["factor"], f"WINS50 voor {item['naam']}"
    return entry["schering"], "WINS50-hoogtetoename op de parklocatie; stationsligging niet gecorrigeerd"


def seasonal_alpha(pm: ParkMethod, moment: datetime) -> float:
    day = moment.astimezone(LOCAL).date()
    return pm.alpha + pm.alpha_seasonal * cos(2 * pi * (day.timetuple().tm_yday - 1) / 365)


def factor(park_id: str, pm: ParkMethod, moment: datetime, alpha: float | None = None) -> float:
    """v_as / ff op dit moment. `alpha` is een eigen exponent van de gebruiker en gaat altijd voor."""
    height = pm.hub_height or HUB_HEIGHT[park_id]
    if alpha is not None:
        return (height / 10) ** alpha
    if pm.height == "alpha":
        return (height / 10) ** seasonal_alpha(pm, moment)
    return month_factors(park_id, pm)[0][moment.astimezone(LOCAL).month - 1]


def alpha_equivalent(park_id: str, value: float, pm: ParkMethod | None = None) -> float:
    """Factor uitgedrukt als exponent vanaf 10 m, om met de oude α te vergelijken."""
    height = (pm.hub_height if pm else None) or HUB_HEIGHT[park_id]
    return log(value) / log(height / 10)


def hub_wind(park_id: str, pm: ParkMethod, speed: float | None, moment: datetime, alpha: float | None = None) -> float | None:
    return None if speed is None else speed * factor(park_id, pm, moment, alpha)


def nl(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def describe(park_id: str, pm: ParkMethod, moment: datetime, alpha: float | None = None) -> str:
    """Eén zin over station en hoogtevertaling voor de pagina en de export."""
    names = " en ".join(STATIONS[k][0] if k in STATIONS else k for k in pm.stations)
    source = (f"KNMI {names}" + (" (per tien minuten de hoogste)" if pm.rule == "hoogste" else "")
              + (" (gemiddelde per tien minuten, alleen als beide meten)" if pm.rule == "gemiddelde" else ""))
    height = pm.hub_height or HUB_HEIGHT[park_id]
    if alpha is not None:
        return f"{source}; eigen hoogte-exponent α = {nl(alpha)} van 10 naar {height:g} m (aanname)."
    if pm.height == "alpha":
        kind = "seizoens-α geijkt op productie" if pm.alpha_seasonal else "vaste α (aanname)"
        return f"{source}; {kind}, deze dag α = {nl(seasonal_alpha(pm, moment))} van 10 naar {height:g} m."
    value = factor(park_id, pm, moment)
    origin = month_factors(park_id, pm)[1]
    return (f"{source}; hoogtevertaling F = {nl(value)} voor deze maand ({origin}), "
            f"gelijk aan α ≈ {nl(alpha_equivalent(park_id, value))} van 10 naar {height:g} m. Aanname zonder meting op ashoogte.")


def stations_needed(methods: dict[str, ParkMethod]) -> list[str]:
    return sorted({key for pm in methods.values() for key in pm.stations})
