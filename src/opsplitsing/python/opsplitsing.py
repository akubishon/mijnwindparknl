"""Elektrolyser opsplitsen in modules: simulatie op het eigen windprofiel.

Vraag: levert een 44 MW-elektrolyser in N modules meer waterstof en een lagere
LCOH op dan in minder, grotere modules? De voeding is hetzelfde aandeel als op
mijnwindpark.nl: 10 % van de gemodelleerde mogelijke opbrengst van Windpark Fryslân
plus die van Wynpark Beabuorren, uit KNMI-tienminutenwaarden. Station en hoogtevertaling
komen uit `windbron.py`, dezelfde methode als het dagprofiel.

Alle elektrolyser- en kostengetallen in `Aannames` zijn plaatshouders, geen
leveranciers- of literatuurwaarden. Vervang ze door datasheets en offertes;
pas dan zegt de uitkomst iets over jouw installatie.

Windaanbod per jaar en uitkomsten per set aannames worden in `.cache/opsplitsing`
bewaard, zodat KNMI alleen de eerste keer wordt bevraagd.
"""

import argparse
import csv
import hashlib
import json
import os
import random
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass, fields, replace
from datetime import date, datetime, timedelta, timezone
from math import ceil, floor
from pathlib import Path
from zoneinfo import ZoneInfo

from . import windbron
from .application import HYDROGEN_SHARE, PARKS, ROOT, load_curve, park_power_mw, parse_wind
from .knmi import KNMIClient, KNMIError, load_env_file

MODEL_VERSION = 11  # verhogen bij elke rekenwijziging; maakt oude uitkomsten in de cache ongeldig (11: windbron.py)
STEP_H = 1 / 6
FRYSLAN_SHARE = HYDROGEN_SHARE["fryslan"]
CACHE = ROOT / ".cache" / "opsplitsing"
LOCAL = ZoneInfo("Europe/Amsterdam")
FIRST_YEAR = 2022   # eerste volledige jaar met Windpark Fryslân in bedrijf
STATIONS = windbron.STATIONS
MODULE_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 11, 16]   # keuzelijst op de pagina
MAX_MODULES = 64                                     # bovengrens voor opgeslagen scenario's en aanvragen
STRATEGIES = {
    "verdelen": "Per tijdstap het aantal modules dat de meeste waterstof geeft, last gelijk verdeeld.",
    "bijschakelen": "Modules één voor één bijschakelen; hooguit één module in deellast.",
    "samen": "Alle modules tegelijk aan of uit, alsof het één grote installatie is.",
}


@dataclass(frozen=True)
class Aannames:
    """Standaard: PEM volgens de EU LCOH-tool, aangevuld met plaatshouders (zie BRONNEN)."""
    capaciteit_mw: float = 44.0
    minimumlast: float = 0.10
    systeemverbruik_vol: float = 53.3
    deellastvoordeel: float = 0.10
    faradayverlies_10: float = 0.03
    bop_vast: float = 0.03
    bop_variabel: float = 0.07
    degradatie_1000h: float = 0.0019
    min_aan_min: float = 30.0
    min_uit_min: float = 20.0
    startvertraging_min: float = 20.0
    standby: float = 0.01
    koud_na_uur: float = 2.0
    opstart_warm_min: float = 1.0
    opstart_koud_min: float = 10.0
    onderhoud_dagen: float = 7.0
    storingen_per_jaar: float = 2.0
    hersteltijd_uur: float = 48.0
    eq_uur_warme_start: float = 1.0
    eq_uur_koude_start: float = 5.0
    eq_uur_per_lastcyclus: float = 0.0
    stack_levensduur_uur: float = 60000.0
    stackwissel_weken: float = 4.0
    offerte_meur: float = 60.0
    offerte_mw: float = 50.0
    offerte_modules: float = 10.0
    vaste_kosten_module_meur: float = 1.0
    stack_aandeel: float = 0.14
    opex_aandeel: float = 0.02
    stroomprijs_eur_mwh: float = 88.91
    netkosten_eur_mwh: float = 18.20
    belasting_eur_mwh: float = 3.80
    rente: float = 0.06
    looptijd_jaar: float = 20.0
    capex_subsidie_eur_kw: float = 0.0
    waterstofpremie_eur_kg: float = 0.0
    korting_net_belasting_eur_mwh: float = 0.0
    zuurstofprijs_eur_t: float = 0.0


# Standaardwaarden per technologie. EU-waarden: Clean Hydrogen Partnership, LCOH-calculator,
# standaardinstellingen. Minimumlast en opstarttijden staan daar niet in en zijn plaatshouders.
TECHNOLOGIES = {
    "pem": ("PEM", Aannames()),
    "alkaline": ("Alkaline", replace(Aannames(), minimumlast=0.20, systeemverbruik_vol=52.4, degradatie_1000h=0.0012,
                                     koud_na_uur=4.0, opstart_warm_min=5.0, opstart_koud_min=45.0,
                                     stack_levensduur_uur=80000.0)),
}
# Scenario waarin 4 modules winnen: alkaline met een hoge minimumlast (gasvermenging bij lage last) en
# goedkope losse units (containers met gedeelde BoP). Kleine modules draaien dan veel vaker.
TECHNOLOGIES["alkaline_hoog"] = ("Alkaline, hoge minimumlast", replace(TECHNOLOGIES["alkaline"][1], minimumlast=0.40,
                                                                      vaste_kosten_module_meur=0.3))
TOELICHTING = {
    "alkaline_hoog": "Veel alkaline-stacks mogen niet onder 30 à 50 % last draaien: daaronder mengt waterstof te veel met "
                     "zuurstof. Eén module van 44 MW staat dan stil zolang er minder dan ~18 MW wind is; een module van 11 MW "
                     "draait al vanaf ~4,5 MW. Met goedkope losse units (0,3 M€ vaste kosten, bijvoorbeeld containers met "
                     "gedeelde BoP) wegen die extra draaiuren zwaarder dan de extra modules kosten.",
}
EU_TOOL = {"systeemverbruik_vol", "degradatie_1000h", "stack_levensduur_uur", "stack_aandeel",
           "opex_aandeel", "stroomprijs_eur_mwh", "netkosten_eur_mwh", "belasting_eur_mwh", "rente", "looptijd_jaar",
           "capex_subsidie_eur_kw", "waterstofpremie_eur_kg", "korting_net_belasting_eur_mwh", "zuurstofprijs_eur_t"}
OXYGEN_KG_PER_KG = 8.0   # 2 H2O → 2 H2 + O2: 32 / 4
WEBSITE = {"capaciteit_mw", "bop_vast", "bop_variabel"}
OWN = {"offerte_meur", "offerte_mw", "offerte_modules"}


def source(key: str) -> str:
    return ("EU LCOH-tool" if key in EU_TOOL else "mijnwindpark.nl" if key in WEBSITE
            else "eigen aanname" if key in OWN else "plaatshouder")


# Uitleg, eenheid en grenzen per aanname; de webpagina bouwt haar formulier hieruit.
# "schaal" zet de opgeslagen waarde om naar de getoonde (0,2 → 20 %).
AANNAMES_META = [
    ("Installatie", [
        ("capaciteit_mw", "Totaal stackvermogen", "MW", 1, 200, 1,
         "Opgesplitst over N gelijke modules. 44 MW past bij het gezamenlijke maximum na BoP op mijnwindpark.nl."),
    ]),
    ("Rendement per module", [
        ("minimumlast", "Minimumlast", "%", 0, 80, 100,
         "Onder deze last mag een module niet draaien. Grootste factor voor de winst van opsplitsen; staat in de datasheet."),
        ("systeemverbruik_vol", "Energieverbruik bij vollast", "kWh/kg", 35, 80, 1,
         "Stroom per kilo inclusief BoP, voor een nieuwe stack op nominaal vermogen. Dit is de ‘energy consumption’ uit de EU-tool."),
        ("deellastvoordeel", "Deellastvoordeel stack", "%", 0, 30, 100,
         "Hoeveel zuiniger de stack vlak boven nul last is dan op vollast, door lagere celspanning; daartussen lineair."),
        ("faradayverlies_10", "Faradayverlies bij 10 % last", "%", 0, 20, 100,
         "Gasdoorlek kost bij lage last relatief veel waterstof; het verlies schaalt met 1 / last."),
        ("bop_vast", "BoP-vast", "% van module", 0, 20, 100,
         "Pompen, koeling en besturing die draaien zodra de module aan staat, los van de last."),
        ("bop_variabel", "BoP-variabel", "% van stack", 0, 30, 100,
         "Gelijkrichter- en compressieverlies, evenredig met het stackvermogen. Vast + variabel is 10 % op vollast, net als op mijnwindpark.nl."),
        ("degradatie_1000h", "Stackdegradatie", "% per 1000 h", 0, 2, 100,
         "Extra verbruik per 1000 bedrijfsuren. Over een stackleven telt gemiddeld de helft van het eindverlies mee."),
    ]),
    ("Bedrijfsvoering", [
        ("min_aan_min", "Minimale aan-tijd", "min", 0, 240, 1, "Een gestarte module blijft minstens zo lang draaien als er genoeg wind is."),
        ("min_uit_min", "Minimale uit-tijd", "min", 0, 240, 1, "Een gestopte module mag pas na deze tijd opnieuw starten."),
        ("startvertraging_min", "Startvertraging", "min", 0, 240, 1,
         "Een extra module start pas als er al zo lang genoeg wind voor is. Voorkomt starts op korte windvlagen."),
        ("standby", "Warmhouden", "% van module", 0, 10, 100, "Verbruik van een gestopte module zolang ze warm blijft."),
        ("koud_na_uur", "Koud na", "uur", 0, 48, 1, "Na zoveel uur stilstand is een start een koude start."),
        ("opstart_warm_min", "Opstarttijd warm", "min", 0, 120, 1, "Tijd zonder productie na een warme start."),
        ("opstart_koud_min", "Opstarttijd koud", "min", 0, 240, 1, "Tijd zonder productie na een koude start."),
    ]),
    ("Beschikbaarheid", [
        ("onderhoud_dagen", "Gepland onderhoud", "dagen per module per jaar", 0, 60, 1,
         "Modules gaan na elkaar in onderhoud, in het windarme voorjaar en de zomer."),
        ("storingen_per_jaar", "Storingen", "per module per jaar", 0, 20, 1, "Willekeurig maar herhaalbaar verdeeld over het jaar."),
        ("hersteltijd_uur", "Hersteltijd per storing", "uur", 0, 720, 1, "Zolang ligt een module stil na een storing."),
    ]),
    ("Slijtage", [
        ("eq_uur_warme_start", "Slijtage per warme start", "equivalente uren", 0, 50, 1, "Extra veroudering per start, uitgedrukt in bedrijfsuren."),
        ("eq_uur_koude_start", "Slijtage per koude start", "equivalente uren", 0, 200, 1, ""),
        ("eq_uur_per_lastcyclus", "Slijtage per volledige lastzwaai", "equivalente uren", 0, 20, 1,
         "Per 0 → 100 → 0 %-zwaai; kleinere wisselingen tellen naar verhouding."),
        ("stack_levensduur_uur", "Stacklevensduur", "equivalente uren", 10000, 200000, 1, "Daarna wordt de stack vervangen."),
        ("stackwissel_weken", "Stilstand per stackwissel", "weken", 0, 26, 1,
         "Zolang staat een module stil bij vervanging. Verdeeld over het stackleven en gepland in het windarme voorjaar."),
    ]),
    ("Kosten", [
        ("offerte_meur", "Referentieofferte: prijs", "M€", 1, 2000, 1,
         "Totaalprijs van een bekende installatie. Standaard 60 M€ voor 50 MW in 10 units van 5 MW."),
        ("offerte_mw", "Referentieofferte: vermogen", "MW", 1, 500, 1, ""),
        ("offerte_modules", "Referentieofferte: aantal units", "", 1, 100, 1, ""),
        ("vaste_kosten_module_meur", "Vaste kosten per module", "M€", 0, 50, 1,
         "Gelijkrichter, transformator, besturing en leidingwerk per unit, los van de grootte. De rest van de offerte wordt een prijs "
         "per kW. Onzeker; de uitkomst toont bij welke waarde meer modules nog lonen."),
        ("stack_aandeel", "Stackvervanging", "% van module-CAPEX", 0, 100, 100, ""),
        ("opex_aandeel", "Vaste OPEX", "% van CAPEX per jaar", 0, 10, 100, ""),
        ("stroomprijs_eur_mwh", "Stroomprijs", "€/MWh", 0, 300, 1, "Voor alle verbruikte stroom, ook warmhouden."),
        ("netkosten_eur_mwh", "Netkosten", "€/MWh", 0, 100, 1, "Zet op 0 als de parken de elektrolyser direct voeden, zonder net."),
        ("belasting_eur_mwh", "Energiebelasting", "€/MWh", 0, 100, 1, ""),
        ("rente", "Rente", "%", 0, 20, 100, ""),
        ("looptijd_jaar", "Looptijd", "jaar", 5, 40, 1, ""),
    ]),
    ("Subsidies en opbrengsten", [
        ("capex_subsidie_eur_kw", "CAPEX-subsidie", "€/kW", 0, 5000, 1,
         "Eenmalig per kW geïnstalleerd vermogen; verlaagt de te financieren investering. OPEX en stackvervanging blijven op de volle CAPEX."),
        ("waterstofpremie_eur_kg", "Waterstofpremie", "€/kg", 0, 20, 1, "Vaste vergoeding of groene premie per kilo waterstof."),
        ("korting_net_belasting_eur_mwh", "Korting netkosten en belasting", "€/MWh", 0, 200, 1,
         "Verlaagt netkosten plus energiebelasting, nooit onder nul."),
        ("zuurstofprijs_eur_t", "Zuurstofprijs", "€/t", 0, 1000, 1, "Per kilo waterstof ontstaat 8 kilo zuurstof; hier aangenomen dat alles wordt verkocht."),
    ]),
]


def per_kw_eur(a: Aannames) -> float:
    """Prijs per kW uit de referentieofferte, na aftrek van de vaste kosten per unit."""
    return (a.offerte_meur - a.offerte_modules * a.vaste_kosten_module_meur) * 1e6 / (a.offerte_mw * 1000)


def capex_eur(a: Aannames, n: int) -> float:
    """CAPEX = prijs per kW × vermogen + vaste kosten × aantal modules."""
    return per_kw_eur(a) * a.capaciteit_mw * 1000 + n * a.vaste_kosten_module_meur * 1e6


def parse_aannames(data: dict) -> Aannames:
    """Valideer opgestuurde aannames in getoonde eenheden tegen de grenzen uit AANNAMES_META."""
    values = {}
    for _, items in AANNAMES_META:
        for key, label, _, low, high, scale, _ in items:
            if key not in data:
                continue
            value = data[key]
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not low <= value <= high:
                raise ValueError(f"{label}: kies een waarde van {low} tot {high}.")
            values[key] = value / scale
    a = replace(Aannames(), **values)
    if per_kw_eur(a) <= 0:
        raise ValueError("Vaste kosten per module × aantal units moeten onder de prijs van de referentieofferte blijven.")
    return a


def shown(a: Aannames) -> dict:
    """Aannames in getoonde eenheden (minimumlast 0,2 → 20)."""
    values = asdict(a)
    return {key: round(values[key] * scale, 6) for _, items in AANNAMES_META for key, _, _, _, _, scale, _ in items}


def meta_json() -> dict:
    base = shown(Aannames())
    return {"groepen": [{"naam": name, "velden": [
        {"key": key, "label": label, "eenheid": unit, "min": low, "max": high, "schaal": scale, "uitleg": hint,
         "standaard": base[key], "bron": source(key)}
        for key, label, unit, low, high, scale, hint in items]} for name, items in AANNAMES_META],
        "technologieen": {key: {"naam": name, "waarden": shown(a), "toelichting": TOELICHTING.get(key, "")}
                          for key, (name, a) in TECHNOLOGIES.items()},
        "strategieen": STRATEGIES, "modules": MODULE_COUNTS, "jaren": available_years(),
        "windmethode": {"standaard": windbron.DEFAULT, "uitleg": windbron.LABELS, "aandeel": HYDROGEN_SHARE}}


def available_years() -> list[int]:
    return list(range(FIRST_YEAR, datetime.now(LOCAL).year))


# ---------------------------------------------------------------- windaanbod

def supply_year(year: int, client: KNMIClient | None = None, method: str = windbron.DEFAULT) -> dict:
    """Bruto toegewezen modelvermogen (MW) per tien minuten met tijdstempels; meetgaten vallen weg.

    Een moment telt alleen mee als beide parken wind hebben volgens de methode; er wordt geen station
    ingevuld voor een ander. Bewaard per jaar, methode en parkmodel, zodat een volgende run niets bij
    KNMI hoeft op te halen.
    """
    methods = windbron.method(method)
    keys = windbron.stations_needed(methods)
    heights = (hashlib.sha256(windbron.TABLE.read_bytes()).hexdigest()
               if any(pm.height == "wins50" for pm in methods.values()) else None)
    curves = {park_id: load_curve(park_id) for park_id in PARKS}
    model = hashlib.sha256(json.dumps([PARKS, {k: asdict(pm) for k, pm in methods.items()}, heights, HYDROGEN_SHARE, curves],
                                      sort_keys=True, default=str).encode()).hexdigest()[:12]
    path = CACHE / f"aanbod5-{method}-{year}-{model}.json"
    if path.exists():
        return json.loads(path.read_text())
    client = client or KNMIClient(ROOT / ".cache" / "knmi")
    start = datetime(year, 1, 1, tzinfo=LOCAL).astimezone(timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=LOCAL).astimezone(timezone.utc)
    measured = {}
    for key in keys:
        station = windbron.station_id(key)
        samples = parse_wind(client.observations_range(station, start, end), station)
        measured[key] = {moment: speed for moment, speed in samples if speed is not None and start <= moment < end}
    rows = []
    for moment in sorted(set().union(*(values.keys() for values in measured.values()))):
        values = {key: measured[key].get(moment) for key in keys}
        fryslan, source = windbron.select(methods["fryslan"], values)
        beabuorren, _ = windbron.select(methods["beabuorren"], values)
        if fryslan is not None and beabuorren is not None:
            rows.append((moment, fryslan, source, beabuorren))
    parks = {"fryslan": [park_mw("fryslan", v, t, curves["fryslan"], methods["fryslan"]) for t, v, _, _ in rows],
             "beabuorren": [park_mw("beabuorren", v, t, curves["beabuorren"], methods["beabuorren"]) for t, _, _, v in rows]}
    data = {"jaar": year, "methode": method, "t": [int(t.timestamp()) for t, _, _, _ in rows],
            "mw": [round(HYDROGEN_SHARE["fryslan"] * a + HYDROGEN_SHARE["beabuorren"] * b, 4)
                   for a, b in zip(parks["fryslan"], parks["beabuorren"])],
            "v10": {"fryslan": [v for _, v, _, _ in rows], "beabuorren": [v for _, _, _, v in rows]},
            "bron": [source for _, _, source, _ in rows],
            "stations": {key: [measured[key].get(t) for t, _, _, _ in rows] for key in keys},
            # Volledige parkopbrengst over de aanwezige momenten, om het toegewezen deel zichtbaar te maken.
            "park_mwh": {park_id: sum(values) * STEP_H for park_id, values in parks.items()}}
    CACHE.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data))
    temporary.replace(path)
    return data


def park_mw(park_id: str, speed: float, moment: datetime, curve: dict | None, pm: windbron.ParkMethod) -> float:
    """KNMI-wind op 10 m naar gemodelleerd mogelijk parkvermogen, met hetzelfde model als het dagprofiel."""
    return park_power_mw(windbron.hub_wind(park_id, pm, speed, moment), park_id, curve, wake=True)


def wind_steps(park_id: str, speed: float, stamp: int, curve: dict | None, pm: windbron.ParkMethod) -> dict:
    """Tussenwaarden van KNMI-wind tot parkvermogen, voor het rekenvoorbeeld."""
    park = PARKS[park_id]
    moment = datetime.fromtimestamp(stamp, timezone.utc)
    factor = windbron.factor(park_id, pm, moment)
    hub = speed * factor
    mw = park_power_mw(hub, park_id, curve, wake=True)
    return {"v10": speed, "factor": round(factor, 4), "alpha": round(windbron.alpha_equivalent(park_id, factor, pm), 4),
            "hoogtevertaling": pm.height, "ashoogte": park["hub_height"], "v_as": round(hub, 3),
            "zog": park["wake_deficit"], "v_turbine": round(hub * (1 - park["wake_deficit"]), 3),
            "turbines": park["count"], "turbine_kw": round(mw * 1000 / park["count"], 1), "mw": round(mw, 3),
            "aandeel": HYDROGEN_SHARE[park_id]}


# ---------------------------------------------------------------- module

def stack_sec_full(a: Aannames) -> float:
    """Stackverbruik op vollast (kWh/kg), zo gekozen dat het systeem inclusief BoP en Faradayverlies
    voor een nieuwe stack precies `systeemverbruik_vol` haalt."""
    return a.systeemverbruik_vol * (1 - a.faradayverlies_10 * 0.1) / (1 + a.bop_variabel + a.bop_vast)


def stack_kg_h(stack_mw: float, size_mw: float, a: Aannames) -> float:
    """Waterstof per uur uit het stackvermogen van één module."""
    x = stack_mw / size_mw
    if x <= 0 or x < a.minimumlast - 1e-9:
        return 0.0
    faraday = max(0.0, 1 - a.faradayverlies_10 * 0.1 / x)
    ageing = a.degradatie_1000h * a.stack_levensduur_uur / 1000 / 2   # gemiddeld over een stackleven
    sec = stack_sec_full(a) * (1 - a.deellastvoordeel * (1 - x)) * (1 + ageing)
    return stack_mw * 1000 / sec * faraday


def draw_mw(stack_mw: float, size_mw: float, a: Aannames) -> float:
    """Elektrisch verbruik van een draaiende module inclusief BoP."""
    return stack_mw * (1 + a.bop_variabel) + a.bop_vast * size_mw


def equal_share(power: float, k: int, size: float, a: Aannames) -> float:
    """Stackvermogen per module als k modules het aanbod gelijk delen."""
    return min(size, (power / k - a.bop_vast * size) / (1 + a.bop_variabel))


def desired_count(power: float, n_avail: int, size: float, a: Aannames, strategy: str, memo: dict) -> int:
    minimum = draw_mw(a.minimumlast * size, size, a)
    fits = min(n_avail, floor(power / minimum)) if minimum > 0 else n_avail
    if strategy == "samen":
        return n_avail if fits >= n_avail and n_avail else 0
    if strategy == "bijschakelen":
        # Zoveel modules als nodig om het aanbod op te nemen; een kleine rest wordt herverdeeld (sequential_loads).
        return min(fits, ceil(power / draw_mw(size, size, a))) if power >= minimum else 0
    key = (round(power, 2), n_avail)
    if key not in memo:
        best, best_k = 0.0, 0
        for k in range(1, fits + 1):
            kg = k * stack_kg_h(equal_share(key[0], k, size, a), size, a)
            if kg > best + 1e-9:
                best, best_k = kg, k
        memo[key] = best_k
    return memo[key]


def sequential_loads(power: float, k: int, size: float, a: Aannames) -> list[float]:
    """Stackvermogen per module bij bijschakelen: vol op één na, de laatste krijgt de rest.

    Valt de rest onder de minimumlast, dan levert de voorlaatste module in tot de laatste precies op
    minimumlast draait. Zo gaat geen aanbod verloren dat de modules samen kunnen opnemen.
    """
    full, minimum = draw_mw(size, size, a), draw_mw(a.minimumlast * size, size, a)
    k = min(k, floor(power / minimum)) if minimum > 0 else k
    if k <= 0:
        return []
    total = min(power, k * full)
    draws = [full] * (k - 1) + [total - (k - 1) * full]
    if k > 1 and draws[-1] < minimum:
        draws[-2] -= minimum - draws[-1]
        draws[-1] = minimum
    return [max(0.0, min(size, (d - a.bop_vast * size) / (1 + a.bop_variabel))) for d in draws]


def outages(times: list[int], n: int, year: int, a: Aannames) -> list[list[bool]]:
    """Per module per tijdstap: True als de module in onderhoud of storing is.

    Onderhoud valt na elkaar vanaf half april, als het het minst waait. Storingen
    volgen een vaste trekking per jaar en module, zodat elke configuratie dezelfde pech krijgt.
    """
    year_start = datetime(year, 1, 1, tzinfo=LOCAL)
    blocks = []
    for i in range(n):
        spans = []
        if a.onderhoud_dagen > 0:
            begin = year_start + timedelta(days=105 + i * a.onderhoud_dagen % 150)
            spans.append((begin.timestamp(), (begin + timedelta(days=a.onderhoud_dagen)).timestamp()))
        if a.storingen_per_jaar > 0 and a.hersteltijd_uur > 0:
            draw = random.Random(year * 100 + i)
            moment = year_start.timestamp()
            while True:
                moment += draw.expovariate(a.storingen_per_jaar / (365 * 86400))
                if moment >= year_start.timestamp() + 365 * 86400:
                    break
                spans.append((moment, moment + a.hersteltijd_uur * 3600))
        blocks.append(spans)
    return [[any(lo <= t < hi for lo, hi in spans) for spans in blocks] for t in times]


def simulate(supply: dict, n: int, a: Aannames, strategy: str, trace: range | None = None) -> dict:
    times, mw = supply["t"], supply["mw"]
    size = a.capaciteit_mw / n
    min_on, min_off, delay = a.min_aan_min / 60, a.min_uit_min / 60, a.startvertraging_min / 60
    minimum = draw_mw(a.minimumlast * size, size, a)
    want_h = 0.0    # hoe lang er al wind is voor meer modules dan er draaien
    down = outages(times, n, supply["jaar"], a)
    on = [False] * n
    on_h = [0.0] * n
    off_h = [a.koud_na_uur + min_off] * n   # het jaar begint koud
    startup = [0.0] * n
    stack = [0.0] * n
    eq = [0.0] * n
    hours = [0.0] * n
    warm = [0] * n
    cold = [0] * n
    kg = used = standby = lost_outage = producing = 0.0
    daily: dict[str, list[float]] = {}
    steps = []
    memo = {}
    for step, (stamp, power) in enumerate(zip(times, mw)):
        avail = [i for i in range(n) if not down[step][i]]
        running = [i for i in avail if on[i]]
        must = [i for i in running if on_h[i] < min_on]
        starters = [i for i in avail if not on[i] and off_h[i] >= min_off]
        fits = min(len(avail), floor(power / minimum)) if minimum > 0 else len(avail)
        k = desired_count(power, len(avail), size, a, strategy, memo)
        wanted = k
        resting = [i for i in avail if not on[i] and off_h[i] < min_off]
        want_h = want_h + STEP_H if k > len(running) else 0.0
        waiting = bool(starters) and want_h < delay - 1e-9
        if waiting:
            starters = []
        k = max(min(k, len(running) + len(starters)), min(len(must), fits))
        k = min(k, fits, len(running) + len(starters))
        # Lopende modules eerst (verplichte vooraan), bij starten de minst versleten.
        keep = sorted(running, key=lambda i: (i not in must, eq[i]))[:k]
        chosen = keep + sorted(starters, key=lambda i: eq[i])[:k - len(keep)]
        loads = [0.0] * n
        if strategy == "bijschakelen":
            for i, x in zip(chosen, sequential_loads(power, len(chosen), size, a)):
                loads[i] = x
        elif chosen:
            share = equal_share(power, len(chosen), size, a)
            for i in chosen:
                loads[i] = share
        step_kg = 0.0
        module_kg = [0.0] * n
        starting = [0.0] * n
        for i in range(n):
            x = loads[i]
            if x >= a.minimumlast * size - 1e-9 and x > 0:
                if not on[i]:
                    if off_h[i] >= a.koud_na_uur:
                        cold[i] += 1; eq[i] += a.eq_uur_koude_start; startup[i] = a.opstart_koud_min
                    else:
                        warm[i] += 1; eq[i] += a.eq_uur_warme_start; startup[i] = a.opstart_warm_min
                    on[i], on_h[i] = True, 0.0
                productive = max(0.0, 10 - startup[i]) / 10
                starting[i] = min(10.0, startup[i])
                startup[i] = max(0.0, startup[i] - 10)
                module_kg[i] = stack_kg_h(x, size, a) * STEP_H * productive
                step_kg += module_kg[i]
                used += draw_mw(x, size, a) * STEP_H
                eq[i] += STEP_H + abs(x - stack[i]) / size / 2 * a.eq_uur_per_lastcyclus
                hours[i] += STEP_H
                on_h[i] += STEP_H
                stack[i] = x
            else:
                if on[i]:
                    on[i], off_h[i] = False, 0.0
                if down[step][i]:
                    lost_outage += size * STEP_H
                elif off_h[i] < a.koud_na_uur:
                    standby += a.standby * size * STEP_H
                off_h[i] += STEP_H
                stack[i] = 0.0
        kg += step_kg
        producing += STEP_H if step_kg > 0 else 0.0
        day = datetime.fromtimestamp(stamp, LOCAL).date().isoformat()
        entry = daily.setdefault(day, [0.0, 0.0])
        entry[0] += step_kg
        entry[1] = max(entry[1], float(len(avail) < n))
        if trace is not None and step in trace:
            reasons = []
            if waiting and wanted > len(running):
                reasons.append(f"startvertraging: al {round(want_h * 60)} van {round(a.startvertraging_min)} min genoeg wind")
            if resting and wanted > len(running) + len(starters):
                reasons.append(f"{len(resting)} net gestopt, minimale uit-tijd")
            if len(must) > wanted and k > wanted:
                reasons.append(f"{len(must)} houden minimale aan-tijd vast")
            if len(avail) < n:
                reasons.append(f"{n - len(avail)} in onderhoud of storing")
            steps.append({"t": stamp, "aanbod": power, "stack": [round(v, 3) for v in loads],
                          "verbruik": round(sum(draw_mw(v, size, a) for v in loads if v > 0), 3),
                          "uit": [down[step][i] for i in range(n)], "kg": [round(v, 3) for v in module_kg],
                          "opstart_min": starting, "gewenst": wanted, "passen": fits, "redenen": reasons})
    scale = 8760 / (len(mw) * STEP_H) if mw else 0   # meetgaten: herschalen naar een vol jaar
    supply_mwh = sum(mw) * STEP_H
    return {
        "modules": n, "module_mw": size, "strategie": strategy, "jaar": supply["jaar"],
        "waterstof_t": kg * scale / 1000, "verbruik_mwh": used * scale, "standby_mwh": standby * scale,
        "aanbod_mwh": supply_mwh * scale,
        "benutting": used / supply_mwh if supply_mwh else 0.0,
        "bedrijfsuren_gem": sum(hours) / n * scale, "productie_uur": producing * scale,
        "starts_warm_per_module": sum(warm) / n * scale, "starts_koud_per_module": sum(cold) / n * scale,
        "eq_uren_per_module": [e * scale for e in eq],
        "dekking_uur": len(mw) * STEP_H,
        "dagen": {d: [round(v[0], 1), v[1]] for d, v in daily.items()},
        "stappen": steps,
    }


# ---------------------------------------------------------------- kosten

def power_price(a: Aannames) -> float:
    levies = max(0.0, a.netkosten_eur_mwh + a.belasting_eur_mwh - a.korting_net_belasting_eur_mwh)
    return a.stroomprijs_eur_mwh + levies


def subsidy_eur(a: Aannames) -> float:
    return a.capex_subsidie_eur_kw * a.capaciteit_mw * 1000


def revenue_eur_kg(a: Aannames) -> float:
    """Opbrengsten per kilo waterstof: premie en verkochte zuurstof."""
    return a.waterstofpremie_eur_kg + a.zuurstofprijs_eur_t * OXYGEN_KG_PER_KG / 1000


def crf(a: Aannames) -> float:
    return a.rente / (1 - (1 + a.rente) ** -a.looptijd_jaar) if a.rente else 1 / a.looptijd_jaar


def economics(result: dict, a: Aannames) -> dict:
    n = result["modules"]
    capex = capex_eur(a, n)
    module_capex = capex / n
    # Continue benadering: elk equivalent bedrijfsuur verbruikt een deel van een stack.
    stack = sum(a.stack_aandeel * module_capex * e / a.stack_levensduur_uur for e in result["eq_uren_per_module"])
    power = (result["verbruik_mwh"] + result["standby_mwh"]) * power_price(a)
    annual = (capex - subsidy_eur(a)) * crf(a) + a.opex_aandeel * capex + stack + power
    kg = result["waterstof_t"] * 1000
    wear = [e for e in result["eq_uren_per_module"] if e]
    return {"capex_meur": capex / 1e6, "stack_meur_jaar": stack / 1e6, "kosten_meur_jaar": annual / 1e6,
            "stroom_meur_jaar": power / 1e6,
            "kapitaal_meur_jaar": ((capex - subsidy_eur(a)) * crf(a) + a.opex_aandeel * capex) / 1e6,
            "lcoh_eur_kg": annual / kg if kg else None,
            "netto_eur_kg": annual / kg - revenue_eur_kg(a) if kg else None,
            "jaren_tot_stackwissel": a.stack_levensduur_uur / max(wear) if wear else None,
            "prijs_per_kw": per_kw_eur(a)}


def summarise(per_year: list[dict], a: Aannames) -> dict:
    """Gemiddelde over windjaren, plus de spreiding tussen jaren voor waterstof en LCOH."""
    out = {key: value for key, value in per_year[0].items() if key not in ("dagen", "stappen", "jaar")}
    for key, value in out.items():
        if key == "eq_uren_per_module":
            out[key] = [sum(r[key][i] for r in per_year) / len(per_year) for i in range(len(value))]
        elif isinstance(value, float):
            out[key] = sum(r[key] for r in per_year) / len(per_year)
    out.update(economics(out, a))
    costs = [economics(r, a) for r in per_year]
    out["jaren"] = {r["jaar"]: {"waterstof_t": r["waterstof_t"], "lcoh_eur_kg": c["lcoh_eur_kg"], "netto_eur_kg": c["netto_eur_kg"]}
                    for r, c in zip(per_year, costs)}
    return out


def break_even(rows: list[dict], a: Aannames) -> None:
    """Hoogste CAPEX waarbij elke configuratie dezelfde LCOH haalt als één module.

    Het getal waaraan offertes te toetsen zijn, los van de aangenomen kostenschaal.
    """
    single = rows[0]
    previous = None
    for row in rows:
        wear = sum(row["eq_uren_per_module"]) / row["modules"] / a.stack_levensduur_uur
        power = (row["verbruik_mwh"] + row["standby_mwh"]) * power_price(a)
        target = (single["lcoh_eur_kg"] or 0) * row["waterstof_t"] * 1000
        # Bruto CAPEX; de subsidie is per kW en dus voor elke configuratie even groot.
        row["capex_break_even_meur"] = ((target - power + subsidy_eur(a) * crf(a))
                                        / (crf(a) + a.opex_aandeel + a.stack_aandeel * wear) / 1e6)
        limit = fixed_cost_break_even(single, row, a)
        row["vaste_kosten_break_even_meur"] = limit
        # Onder een halve ton is het verschil afrondingsruis: dan loont opsplitsen niet, ook niet gratis.
        row["opsplitsen"] = None if row is single else "loont" if limit is not None and limit >= 0.005 else "loont_niet"
        row["uitsplitsing"] = None if row is single else decompose(single, row)
        if previous:
            row["extra_waterstof_t"] = row["waterstof_t"] - previous["waterstof_t"]
            row["extra_kosten_meur_jaar"] = row["kosten_meur_jaar"] - previous["kosten_meur_jaar"]
            row["extra_productie_uur"] = row["productie_uur"] - previous["productie_uur"]
            # Wat de extra kilo's van deze stap kosten. Lager dan de LCOH van de vorige stap: de stap verlaagt de LCOH.
            extra_kg = row["extra_waterstof_t"] * 1000
            row["marginale_eur_kg"] = row["extra_kosten_meur_jaar"] * 1e6 / extra_kg if extra_kg > 0 else None
            row["stap_loont"] = row["lcoh_eur_kg"] < previous["lcoh_eur_kg"]
        previous = row
    best = min(rows, key=lambda r: r["lcoh_eur_kg"] if r["lcoh_eur_kg"] is not None else float("inf"))
    for row in rows:
        row["beste"] = row is best


def fixed_cost_break_even(single: dict, row: dict, a: Aannames) -> float | None:
    """Vaste kosten per module (M€) waarbij deze configuratie even duur per kilo is als de eerste.

    De kosten per kilo zijn lineair in de vaste kosten; twee punten geven het snijpunt.
    """
    if row is single:
        return None
    gap = lambda f: (economics(row, replace(a, vaste_kosten_module_meur=f))["lcoh_eur_kg"]
                     - economics(single, replace(a, vaste_kosten_module_meur=f))["lcoh_eur_kg"])
    slope = gap(1.0) - gap(0.0)
    return -gap(0.0) / slope if slope > 1e-12 else None


def decompose(single: dict, row: dict) -> dict:
    """Verschil in kosten per kilo met de eerste configuratie, exact in vier delen (€/kg).

    K = kapitaal + vaste OPEX, S = stackvervanging, E = stroom, H = kilo's per jaar.
    """
    h1, hn = single["waterstof_t"] * 1000, row["waterstof_t"] * 1000
    k1, kn = single["kapitaal_meur_jaar"] * 1e6, row["kapitaal_meur_jaar"] * 1e6
    s1, sn = single["stack_meur_jaar"] * 1e6, row["stack_meur_jaar"] * 1e6
    e1, en = single["stroom_meur_jaar"] * 1e6, row["stroom_meur_jaar"] * 1e6
    kwh = lambda r: (r["verbruik_mwh"] + r["standby_mwh"]) * 1000 / (r["waterstof_t"] * 1000)
    return {"meer_waterstof": (k1 + s1) * (1 / hn - 1 / h1), "duurdere_installatie": (kn - k1) / hn,
            "stroom_per_kilo": en / hn - e1 / h1, "stackvervanging": (sn - s1) / hn,
            "kwh_per_kg": [kwh(single), kwh(row)]}


def replacement_days(result: dict, a: Aannames) -> float:
    """Gemiddelde stilstand per module per jaar door stackwissels, uit de gemeten slijtage."""
    wear = sum(result["eq_uren_per_module"]) / result["modules"]
    return a.stackwissel_weken * 7 * wear / a.stack_levensduur_uur


def simulate_with_replacements(supply: dict, n: int, a: Aannames, strategy: str, trace: range | None = None) -> dict:
    """Eerst de slijtage meten, dan opnieuw rekenen met de bijbehorende stilstand voor stackwissels."""
    first = simulate(supply, n, a, strategy)
    days = replacement_days(first, a) if a.stackwissel_weken else 0.0
    if not days and trace is None:
        return {**first, "stackwissel_dagen": 0.0}
    result = simulate(supply, n, replace(a, onderhoud_dagen=a.onderhoud_dagen + days), strategy, trace)
    return {**result, "stackwissel_dagen": days}


def _job(args):
    supply, n, a, strategy = args
    return simulate_with_replacements(supply, n, a, strategy)


def supply_key(supplies: dict) -> list:
    """Wat van het aanbod in een cachesleutel hoort: methode, lengte en een controlesom van de reeks."""
    return [[s.get("methode"), len(s["t"]), hashlib.sha256(json.dumps(s["mw"]).encode()).hexdigest()[:16]]
            for s in supplies.values()]


def supply_summary(supplies: dict) -> dict:
    """Aanbod per jaar, herschaald naar 8.760 uur, met het deel dat elk park levert."""
    out = {}
    for year, s in supplies.items():
        hours = len(s["mw"]) * STEP_H
        scale = 8760 / hours if hours else 0.0
        parks = s.get("park_mwh", {})
        out[year] = {"mwh": sum(s["mw"]) * STEP_H * scale, "dekking_uur": hours, "methode": s.get("methode"),
                     "parken": {park_id: {"park_mwh": value * scale, "aandeel": HYDROGEN_SHARE[park_id],
                                          "naar_waterstof_mwh": value * scale * HYDROGEN_SHARE[park_id]}
                                for park_id, value in parks.items()}}
    return out


def run(a: Aannames, years: list[int], counts: list[int], strategy: str, workers: int | None = None,
        method: str = windbron.DEFAULT) -> dict:
    """Alle configuraties over alle windjaren; uitkomst bewaard per set invoer."""
    if strategy not in STRATEGIES or not years or not counts:
        raise ValueError("Kies een besturing, minstens één windjaar en minstens één moduleaantal.")
    counts = sorted(set(counts))
    supplies = {year: supply_year(year, method=method) for year in years}
    key = hashlib.sha256(json.dumps([MODEL_VERSION, asdict(a), years, counts, strategy,
                                     supply_key(supplies)]).encode()).hexdigest()[:20]
    path = CACHE / f"uitkomst-{key}.json"
    began = time.perf_counter()
    steps = sum(len(s["t"]) for s in supplies.values())
    if path.exists():
        data = json.loads(path.read_text())
        return {**data, "uit_cache": True, "rekentijd_s": time.perf_counter() - began}
    jobs = [(supplies[y], n, a, strategy) for n in counts for y in years]
    with ProcessPoolExecutor(workers) as pool:
        results = list(pool.map(_job, jobs))
    rows = []
    for index, n in enumerate(counts):
        rows.append(summarise(results[index * len(years):(index + 1) * len(years)], a))
    break_even(rows, a)
    example = example_day(results, counts, years)
    data = {"sleutel": key, "aannames": asdict(a), "strategie": strategy, "jaren": years, "rijen": rows,
            "voorbeelddag": example, "windmethode": method, "windmethode_uitleg": windbron.LABELS[method],
            "model_versie": MODEL_VERSION, "aanbod": supply_summary(supplies),
            "omvang": {"tijdstappen": steps, "configuraties": len(counts), "modules": sum(counts),
                       "modulestappen": steps * sum(counts), "processen": workers or os.cpu_count()}}
    data["eerste_rekentijd_s"] = time.perf_counter() - began
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return {**data, "uit_cache": False, "rekentijd_s": data["eerste_rekentijd_s"]}


# Aannames voor de gevoeligheid. Kosten rekenen opnieuw zonder simulatie; bedrijfsvoering vraagt een nieuwe simulatie.
SENSITIVE_COSTS = ["offerte_meur", "vaste_kosten_module_meur", "stroomprijs_eur_mwh", "netkosten_eur_mwh", "rente",
                   "looptijd_jaar", "stack_aandeel", "opex_aandeel"]
SENSITIVE_OPERATION = ["minimumlast", "bop_vast", "deellastvoordeel", "standby", "opstart_koud_min", "startvertraging_min",
                       "onderhoud_dagen", "stackwissel_weken"]
SENSITIVITY_STEP = 0.25


def variants(a: Aannames, key: str) -> list[tuple[float, Aannames]]:
    """De aanname 25 % omlaag en omhoog, binnen de grenzen van het veld; ongeldige combinaties vallen weg."""
    meta = {k: (low, high, scale) for _, items in AANNAMES_META for k, _, _, low, high, scale, _ in items}
    low, high, scale = meta[key]
    value = getattr(a, key)
    out = []
    for factor in (1 - SENSITIVITY_STEP, 1 + SENSITIVITY_STEP):
        shown_value = min(max(value * scale * factor, low), high)
        changed = replace(a, **{key: shown_value / scale})
        if value and per_kw_eur(changed) > 0:
            out.append((shown_value, changed))
    return out


def sensitivity(a: Aannames, years: list[int], n: int, strategy: str, workers: int | None = None,
                method: str = windbron.DEFAULT) -> dict:
    """Hoe het voordeel van n modules boven één module (€/kg) verschuift als elke aanname 25 % verandert."""
    if not 1 < n <= MAX_MODULES or strategy not in STRATEGIES or not years:
        raise ValueError("Kies een aantal modules groter dan 1, een besturing en minstens één windjaar.")
    supplies = {year: supply_year(year, method=method) for year in years}
    key = hashlib.sha256(json.dumps([MODEL_VERSION, "gevoeligheid", asdict(a), years, n, strategy, SENSITIVITY_STEP,
                                     supply_key(supplies)]).encode()).hexdigest()[:20]
    path = CACHE / f"gevoeligheid-{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    cases = [("basis", a)] + [(f"{k}:{i}", v) for k in SENSITIVE_OPERATION for i, (_, v) in enumerate(variants(a, k))]
    jobs = [(supplies[y], count, case, strategy) for _, case in cases for count in (1, n) for y in years]
    with ProcessPoolExecutor(workers) as pool:
        results = list(pool.map(_job, jobs))
    size = len(years)
    runs = {name: (results[2 * i * size:(2 * i + 1) * size], results[(2 * i + 1) * size:(2 * i + 2) * size])
            for i, (name, _) in enumerate(cases)}

    def advantage(name: str, variant: Aannames) -> float:
        one, many = runs[name]
        return summarise(one, variant)["lcoh_eur_kg"] - summarise(many, variant)["lcoh_eur_kg"]

    base = advantage("basis", a)
    labels = {k: (label, unit, scale) for _, items in AANNAMES_META for k, label, unit, _, _, scale, _ in items}
    items = []
    for k in SENSITIVE_COSTS + SENSITIVE_OPERATION:
        label, unit, scale = labels[k]
        ends = [{"waarde": shown_value, "voordeel": advantage("basis" if k in SENSITIVE_COSTS else f"{k}:{i}", variant)}
                for i, (shown_value, variant) in enumerate(variants(a, k))]
        if len(ends) == 2:
            items.append({"key": k, "label": label, "eenheid": unit, "nu": getattr(a, k) * scale,
                          "soort": "kosten" if k in SENSITIVE_COSTS else "bedrijfsvoering", "laag": ends[0], "hoog": ends[1],
                          "bereik": abs(ends[1]["voordeel"] - ends[0]["voordeel"])})
    items.sort(key=lambda item: item["bereik"], reverse=True)
    data = {"modules": n, "voordeel": base, "stap": SENSITIVITY_STEP, "aannames": items}
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data


OMSLAG_MINIMUMLAST = [0.10, 0.20, 0.30, 0.40, 0.50]
OMSLAG_VASTE_KOSTEN = [0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5]


def omslagkaart(a: Aannames, years: list[int], counts: list[int], strategy: str, workers: int | None = None,
                method: str = windbron.DEFAULT) -> dict:
    """Het goedkoopste aantal modules per combinatie van minimumlast en vaste kosten per module.

    De minimumlast vraagt een nieuwe simulatie; de vaste kosten alleen een nieuwe kostenberekening.
    """
    counts = sorted(set(counts))
    if len(counts) < 2 or strategy not in STRATEGIES or not years:
        raise ValueError("Kies minstens twee moduleaantallen, een besturing en minstens één windjaar.")
    supplies = {year: supply_year(year, method=method) for year in years}
    key = hashlib.sha256(json.dumps([MODEL_VERSION, "omslag", asdict(a), years, counts, strategy, OMSLAG_MINIMUMLAST,
                                     OMSLAG_VASTE_KOSTEN, supply_key(supplies)]).encode()).hexdigest()[:20]
    path = CACHE / f"omslag-{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    cases = [replace(a, minimumlast=m) for m in OMSLAG_MINIMUMLAST]
    jobs = [(supplies[y], n, case, strategy) for case in cases for n in counts for y in years]
    with ProcessPoolExecutor(workers) as pool:
        results = list(pool.map(_job, jobs))
    size = len(years)
    grid = []
    for i, case in enumerate(cases):
        line = []
        for f in OMSLAG_VASTE_KOSTEN:
            variant = replace(case, vaste_kosten_module_meur=f)
            if per_kw_eur(variant) <= 0:
                line.append(None)
                continue
            lcoh = []
            for j, n in enumerate(counts):
                start = (i * len(counts) + j) * size
                lcoh.append(summarise(results[start:start + size], variant)["lcoh_eur_kg"])
            best = min(range(len(counts)), key=lambda j: lcoh[j] if lcoh[j] is not None else float("inf"))
            line.append({"beste": counts[best], "lcoh_eur_kg": lcoh[best], "lcoh_een_eur_kg": lcoh[0]})
        grid.append(line)
    data = {"minimumlast": [m * 100 for m in OMSLAG_MINIMUMLAST], "vaste_kosten_meur": OMSLAG_VASTE_KOSTEN,
            "modules": counts, "cellen": grid, "nu": {"minimumlast": a.minimumlast * 100,
                                                     "vaste_kosten_meur": a.vaste_kosten_module_meur}}
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data


def example_day(results: list[dict], counts: list[int], years: list[int]) -> str | None:
    """Een representatieve dag waarop opsplitsen (4 modules, of het dichtstbijzijnde aantal) helpt.

    Niet de uitschieter: die valt vaak op een stormdag waarop Fryslân rond cut-out aan en uit gaat.
    Wel het 75e percentiel van de dagwinst, op dagen zonder onderhoud of storing.
    """
    if len(counts) < 2:
        return None
    other = min(counts[1:], key=lambda n: abs(n - 4))
    by = {(r["modules"], r["jaar"]): r["dagen"] for r in results}
    gains = []
    for year in years:
        one, many = by[(counts[0], year)], by[(other, year)]
        for day, (kg, outage) in many.items():
            if day in one and not outage and not one[day][1] and kg > one[day][0]:
                gains.append((kg - one[day][0], day))
    return sorted(gains)[int(len(gains) * .75)][1] if gains else None


def day_trace(a: Aannames, day: date, counts: list[int], strategy: str, method: str = windbron.DEFAULT) -> dict:
    """Tijdstappen van één dag per configuratie; de simulatie start twee dagen eerder om warm te lopen."""
    supply = supply_year(day.year, method=method)
    methods = windbron.method(method)
    start = datetime.combine(day, datetime.min.time(), LOCAL)
    lo = (start - timedelta(days=2)).timestamp()
    first, end = start.timestamp(), (start + timedelta(days=1)).timestamp()
    picked = [i for i, t in enumerate(supply["t"]) if lo <= t < end]
    if not picked:
        raise ValueError("Geen windgegevens voor deze dag.")
    window = {"jaar": supply["jaar"], "t": [supply["t"][i] for i in picked], "mw": [supply["mw"][i] for i in picked]}
    visible = range(next(i for i, t in enumerate(window["t"]) if t >= first), len(picked))
    out = {}
    for n in sorted(set(counts)):
        # Stilstand voor stackwissels volgt uit de slijtage over het hele jaar, niet uit dit venster.
        extra = replacement_days(simulate(supply, n, a, strategy), a) if a.stackwissel_weken else 0.0
        result = simulate(window, n, replace(a, onderhoud_dagen=a.onderhoud_dagen + extra), strategy, trace=visible)
        out[n] = {"module_mw": result["module_mw"], "stappen": result["stappen"],
                  "waterstof_kg": result["dagen"].get(day.isoformat(), [0])[0],
                  "drempel_mw": draw_mw(a.minimumlast * result["module_mw"], result["module_mw"], a)}
    curves = {park_id: load_curve(park_id) for park_id in PARKS}
    wind = [{**{park_id: wind_steps(park_id, supply["v10"][park_id][picked[i]], window["t"][i], curves[park_id], methods[park_id])
                for park_id in PARKS},
             "knmi": {key: supply["stations"][key][picked[i]] for key in supply["stations"]}, "gekozen": supply["bron"][picked[i]]}
            for i in visible]
    return {"datum": day.isoformat(), "configuraties": out, "wind": wind, "aandeel_fryslan": FRYSLAN_SHARE,
            "aandeel": HYDROGEN_SHARE, "windmethode": method, "windmethode_uitleg": windbron.LABELS[method],
            "stations": {key: STATIONS[key][0] for key in supply["stations"]},
            "station_per_park": {park_id: [STATIONS[k][0] for k in pm.stations] for park_id, pm in methods.items()},
            "regel_fryslan": methods["fryslan"].rule, "regel_per_park": {park_id: pm.rule for park_id, pm in methods.items()},
            "hoogtevertaling": {park_id: windbron.describe(park_id, pm, datetime.combine(day, datetime.min.time(), LOCAL))
                                for park_id, pm in methods.items()},
            "parken": {park_id: park["name"] for park_id, park in PARKS.items()}}


# ---------------------------------------------------------------- opdrachtregel

CSV_FIELDS = ["scenario", "windmethode", "strategie", "modules", "module_mw", "waterstof_t", "benutting", "bedrijfsuren_gem", "productie_uur",
              "starts_warm_per_module", "starts_koud_per_module", "jaren_tot_stackwissel", "capex_meur",
              "stack_meur_jaar", "kosten_meur_jaar", "lcoh_eur_kg", "netto_eur_kg", "capex_break_even_meur", "vaste_kosten_break_even_meur", "extra_waterstof_t",
              "extra_kosten_meur_jaar", "marginale_eur_kg", "beste"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Simuleer een elektrolyser in N modules op het windprofiel.")
    parser.add_argument("--jaren", type=int, nargs="+", default=available_years())
    parser.add_argument("--modules", type=int, nargs="+", default=MODULE_COUNTS)
    parser.add_argument("--technologie", choices=TECHNOLOGIES, default="pem")
    parser.add_argument("--aannames", type=Path, help="JSON-bestand met afwijkende aannames, in getoonde eenheden (minimumlast 20 = 20 %).")
    parser.add_argument("--uit", type=Path, default=ROOT / "uitvoer" / "opsplitsing")
    parser.add_argument("--windmethode", choices=windbron.METHODS, default=windbron.DEFAULT,
                        help="Standaard productie-onafhankelijk; de oude methoden zijn er om te vergelijken.")
    args = parser.parse_args()
    load_env_file(ROOT / ".env")
    try:
        preset = shown(TECHNOLOGIES[args.technologie][1])
        base = parse_aannames({**preset, **(json.loads(args.aannames.read_text()) if args.aannames else {})})
        for year in args.jaren:
            supply_year(year, method=args.windmethode)
    except (KNMIError, ValueError) as exc:
        print(str(exc))
        return 1
    scenarios = {"basis": ({}, list(STRATEGIES)),
                 "minimumlast 10 %": ({"minimumlast": 0.10}, ["verdelen"]),
                 "minimumlast 40 %": ({"minimumlast": 0.40}, ["verdelen"]),
                 "offerte -25 %": ({"offerte_meur": base.offerte_meur * 0.75}, ["verdelen"]),
                 "offerte +25 %": ({"offerte_meur": base.offerte_meur * 1.25}, ["verdelen"]),
                 "vaste kosten 0,5 M€": ({"vaste_kosten_module_meur": 0.5}, ["verdelen"]),
                 "vaste kosten 2 M€": ({"vaste_kosten_module_meur": 2.0}, ["verdelen"])}
    scenarios.update({f"windjaar {y}": ({}, ["verdelen"]) for y in args.jaren})
    rows = []
    for name, (changes, strategies) in scenarios.items():
        years = [int(name[-4:])] if name.startswith("windjaar") else args.jaren
        for strategy in strategies:
            for row in run(replace(base, **changes), years, args.modules, strategy, method=args.windmethode)["rijen"]:
                rows.append({"scenario": name, "windmethode": args.windmethode, **row})
    args.uit.mkdir(parents=True, exist_ok=True)
    with (args.uit / "resultaten.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    for row in rows:
        if row["scenario"] == "basis" or row["modules"] in (1, 4, 11):
            print(f'{row["scenario"]:18} {row["strategie"]:12} N={row["modules"]:2} '
                  f'H2 {row["waterstof_t"]:7.1f} t  LCOH {row["lcoh_eur_kg"]:5.2f} €/kg  '
                  f'starts/mod {row["starts_warm_per_module"] + row["starts_koud_per_module"]:5.0f}  '
                  f'CAPEX {row["capex_meur"]:5.1f} (max {row["capex_break_even_meur"]:5.1f}) M€  '
                  f'stackwissel {row["jaren_tot_stackwissel"]:4.1f} j')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
