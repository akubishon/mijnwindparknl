"""Reken moduleaantallen in bulk door en bewaar de uitkomsten voor de webpagina.

Elk scenario (technologie × besturing × windjaren × moduleaantallen, plus eventueel eigen
aannames) komt als JSON in scenarios/. De opsplitsingspagina toont ze onder "Opgeslagen
scenario's" zonder opnieuw te rekenen; scenarios/overzicht.csv zet alle rijen onder elkaar.

    python3 -m windprofiel.scenarios                          # alles: 3 technologieën × 3 besturingen, 1–16 modules
    python3 -m windprofiel.scenarios --modules 1-44 --technologie alkaline_hoog --strategie verdelen --jaren 2025
    python3 -m windprofiel.scenarios --aannames mijn-offerte.json --naam "Offerte X"
    python3 -m windprofiel.scenarios --lijst
    python3 -m windprofiel.scenarios --verwijder offerte-x
"""

import argparse
import csv
import json
import re
import time
from datetime import datetime
from pathlib import Path

from . import windbron
from .application import ROOT
from .knmi import KNMIError, load_env_file
from .opsplitsing import (CSV_FIELDS, LOCAL, MAX_MODULES, MODEL_VERSION, STRATEGIES, TECHNOLOGIES, available_years,
                          parse_aannames, run, shown, supply_year)

FOLDER = ROOT / "scenarios"
ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


def parse_counts(text: str) -> list[int]:
    """'1-16', '1,2,4,8' of '1-6,8,10-12' naar een gesorteerde lijst moduleaantallen."""
    counts = set()
    for part in text.replace(" ", "").split(","):
        low, _, high = part.partition("-")
        if not low.isdigit() or (high and not high.isdigit()):
            raise ValueError(f"Onbekend moduleaantal: {part!r}. Gebruik bijvoorbeeld 1-16 of 1,2,4,8.")
        counts.update(range(int(low), int(high or low) + 1))
    if not counts or min(counts) < 1 or max(counts) > MAX_MODULES:
        raise ValueError(f"Moduleaantallen van 1 tot en met {MAX_MODULES}.")
    return sorted(counts)


def slug(text: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80].strip("-")
    return out or "scenario"


def span(counts: list[int]) -> str:
    return f"{counts[0]}–{counts[-1]}" if counts == list(range(counts[0], counts[-1] + 1)) else ", ".join(map(str, counts))


def wind_method(stored: dict) -> str:
    """Windmethode van een opgeslagen scenario; vóór modelversie 11 was dat altijd de oude opsplitsing."""
    return stored["resultaat"].get("windmethode", "productie_hoogste")


def summary(stored: dict) -> dict:
    """Eén regel per scenario voor de lijst op de webpagina."""
    rows = stored["resultaat"]["rijen"]
    version = stored["resultaat"].get("model_versie")
    best = min(rows, key=lambda r: r["lcoh_eur_kg"] if r["lcoh_eur_kg"] is not None else float("inf"))
    return {"id": stored["id"], "naam": stored["naam"], "technologie": stored["technologie"],
            "strategie": stored["resultaat"]["strategie"], "jaren": stored["resultaat"]["jaren"],
            "modules": [r["modules"] for r in rows], "eigen_aannames": stored["eigen_aannames"], "gemaakt": stored["gemaakt"],
            "windmethode": wind_method(stored), "model_versie": version,
            # Berekend met een eerdere rekenwijze: opnieuw draaien met dezelfde naam geeft de huidige uitkomst.
            "verouderd": version != MODEL_VERSION,
            "beste": {"modules": best["modules"], "lcoh_eur_kg": best["lcoh_eur_kg"], "waterstof_t": best["waterstof_t"]},
            "een_module": {"lcoh_eur_kg": rows[0]["lcoh_eur_kg"], "waterstof_t": rows[0]["waterstof_t"]}}


def listing(folder: Path = FOLDER) -> list[dict]:
    items = []
    for path in sorted(folder.glob("*.json")):
        try:
            items.append(summary(json.loads(path.read_text(encoding="utf-8"))))
        except (ValueError, KeyError, TypeError):
            continue   # half geschreven of oud bestand: overslaan
    return sorted(items, key=lambda item: item["gemaakt"], reverse=True)


def load(scenario_id: str, folder: Path = FOLDER) -> dict:
    if not ID.match(scenario_id):
        raise ValueError("Onbekend scenario.")
    path = folder / f"{scenario_id}.json"
    if not path.is_file():
        raise ValueError("Onbekend scenario.")
    return json.loads(path.read_text(encoding="utf-8"))


def save(name: str, technology: str, changes: dict, result: dict, folder: Path = FOLDER) -> Path:
    scenario_id = slug(name)
    stored = {"id": scenario_id, "naam": name, "technologie": technology, "eigen_aannames": changes,
              "gemaakt": datetime.now(LOCAL).isoformat(timespec="seconds"),
              "resultaat": {key: value for key, value in result.items() if key not in ("uit_cache", "rekentijd_s")}}
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{scenario_id}.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(stored, allow_nan=False), encoding="utf-8")
    temporary.replace(path)
    return path


def write_overview(folder: Path = FOLDER) -> Path:
    """Alle opgeslagen scenario's in één CSV, één rij per scenario en moduleaantal."""
    path = folder / "overzicht.csv"
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, ["scenario", "technologie", "jaren", *CSV_FIELDS[1:]], extrasaction="ignore")
        writer.writeheader()
        for item in listing(folder):
            stored = load(item["id"], folder)
            for row in stored["resultaat"]["rijen"]:
                writer.writerow({**row, "scenario": stored["naam"], "technologie": stored["technologie"],
                                 "windmethode": wind_method(stored),
                                 "jaren": " ".join(map(str, stored["resultaat"]["jaren"]))})
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Reken alle moduleaantallen door en bewaar de uitkomsten voor de webpagina.")
    parser.add_argument("--technologie", nargs="+", choices=TECHNOLOGIES, default=list(TECHNOLOGIES))
    parser.add_argument("--strategie", nargs="+", choices=STRATEGIES, default=list(STRATEGIES))
    parser.add_argument("--jaren", type=int, nargs="+", default=available_years())
    parser.add_argument("--modules", default="1-16", help=f"Bijvoorbeeld 1-16, 1-{MAX_MODULES} of 1,2,4,8 (standaard 1-16).")
    parser.add_argument("--aannames", type=Path, help="JSON met afwijkende aannames in getoonde eenheden (minimumlast 40 = 40 %%).")
    parser.add_argument("--naam", help="Naam op de webpagina; standaard uit technologie, besturing, jaren en modules.")
    parser.add_argument("--windmethode", choices=windbron.METHODS, default=windbron.DEFAULT,
                        help="Standaard productie-onafhankelijk; de oude methoden zijn er om te vergelijken.")
    parser.add_argument("--lijst", action="store_true", help="Toon de opgeslagen scenario's.")
    parser.add_argument("--verwijder", metavar="ID", help="Verwijder een opgeslagen scenario.")
    args = parser.parse_args()

    if args.lijst:
        for item in listing():
            best = item["beste"]
            print(f'{item["id"]:50} {span(item["modules"]):>8} modules  laagste €/kg bij {best["modules"]:2} '
                  f'({best["lcoh_eur_kg"]:.2f} €/kg)  {item["gemaakt"]}  {item["windmethode"]}'
                  + ("  VEROUDERD" if item["verouderd"] else ""))
        return 0
    if args.verwijder:
        try:
            path = FOLDER / f'{load(args.verwijder)["id"]}.json'
        except ValueError as exc:
            print(str(exc))
            return 1
        path.unlink()
        write_overview()
        print(f"Verwijderd: {path.name}")
        return 0

    load_env_file(ROOT / ".env")
    try:
        counts = parse_counts(args.modules)
        changes = json.loads(args.aannames.read_text(encoding="utf-8")) if args.aannames else {}
        if not isinstance(changes, dict):
            raise ValueError("Het aannamebestand moet een JSON-object zijn.")
        if any(year not in available_years() for year in args.jaren):
            raise ValueError(f"Kies windjaren uit {available_years()}.")
        years = sorted(set(args.jaren))
        for year in years:
            supply_year(year, method=args.windmethode)   # eerst alle wind ophalen, zodat een KNMI-fout niet halverwege komt
        plans = [(tech, strategy, parse_aannames({**shown(TECHNOLOGIES[tech][1]), **changes}))
                 for tech in args.technologie for strategy in args.strategie]
    except (KNMIError, ValueError, OSError) as exc:
        print(str(exc))
        return 1

    print(f"{len(plans)} scenario's × {len(counts)} moduleaantallen × {len(years)} windjaren.")
    for index, (tech, strategy, a) in enumerate(plans, 1):
        name = args.naam or f"{TECHNOLOGIES[tech][0]} · {strategy} · {' '.join(map(str, years))} · {span(counts)} modules"
        if args.naam and len(plans) > 1:
            name = f"{args.naam} · {TECHNOLOGIES[tech][0]} · {strategy}"
        if changes and not args.naam:
            name += " · eigen aannames"
        if args.windmethode != windbron.DEFAULT:
            name += f" · {args.windmethode}"
        began = time.perf_counter()
        result = run(a, years, counts, strategy, method=args.windmethode)
        path = save(name, tech, changes, result)
        best = min(result["rijen"], key=lambda r: r["lcoh_eur_kg"] if r["lcoh_eur_kg"] is not None else float("inf"))
        print(f"[{index}/{len(plans)}] {name}: laagste kostprijs per kilo bij {best['modules']} modules, {best['lcoh_eur_kg']:.2f} €/kg "
              f"({time.perf_counter() - began:.0f} s{', uit cache' if result['uit_cache'] else ''}) → {path.relative_to(ROOT)}")
    print(f"Overzicht: {write_overview().relative_to(ROOT)}. Open http://127.0.0.1:8000/opsplitsing → Opgeslagen scenario's.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
