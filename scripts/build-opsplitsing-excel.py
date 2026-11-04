"""Bouw excel/Opsplitsing.xlsm: de opsplitsingsberekening van /opsplitsing als Excel-werkmap met VBA-macro's.

    python3 scripts/build-opsplitsing-excel.py            # schrijft excel/Opsplitsing.xlsm
    python3 scripts/build-opsplitsing-excel.py --uit pad.xlsm

De werkmap bevat:
- Invoer: keuzes, de aannametabel (labels, grenzen, bron en uitleg uit opsplitsing.py) en knoppen;
- Data_Aanbod (verborgen): het windaanbod per tien minuten uit src/opsplitsing/data/<jaar>.json, voor beide parken en per park
  afgeleid met dezelfde stappen als browser-runtime.py, plus de trekkingen voor de windvoorspelling;
- de VBA-modules uit excel/vba/*.bas, die het model van src/opsplitsing/python/opsplitsing.py nadoen.

Vereist Python 3.11+ en xlsxwriter (pip install xlsxwriter). Geen Excel nodig: vbaProject.bin wordt door scripts/vbaproject.py
geschreven.
"""

import argparse
import json
import random
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import xlsxwriter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vbaproject import vba_project_bin  # noqa: E402

REPO = HERE.parent
SRC = REPO / "src" / "opsplitsing"
VBA = REPO / "excel" / "vba"
MODULES = ["OpsplitsingModel", "OpsplitsingWerkblad"]
PARK_SETS = [("fryslan", "beabuorren"), ("fryslan",), ("beabuorren",)]   # volgorde van PARKEN_BEIDE, _FRYSLAN, _BEABUORREN
PARK_LABELS = ["Beide", "Windpark Fryslân", "Windpark Beabuorren"]
COLS_PER_YEAR = 2 + 2 * len(PARK_SETS)

# Plaatsen op Invoer; gelijk aan de constanten in OpsplitsingWerkblad.bas (rijen en kolommen 0-gebaseerd voor xlsxwriter).
ROW_SETTINGS = 3          # C4 technologie .. C12 status
TABLE_FIRST_ROW = 15      # rij 16 in Excel; kopregel in rij 15
TECH_FIRST_COL = 10       # kolom K
BUTTON_COL = 13           # kolom N


def load_runtime():
    """Het browsermodel: opsplitsing.py met browser-runtime.py eromheen, met de meegeleverde jaarreeksen."""
    folder = Path(tempfile.mkdtemp(prefix="opsplitsing-"))
    (folder / "windprofiel").symlink_to(SRC / "python", target_is_directory=True)
    sys.path.insert(0, str(folder))
    code = (SRC / "browser-runtime.py").read_text(encoding="utf-8").replace("/app/data/", str(SRC / "data") + "/")
    runtime = {"__name__": "browser_runtime"}
    exec(compile(code, "browser-runtime.py", "exec"), runtime)
    runtime["model"].CACHE = folder / "cache"
    return runtime


def forecast_z(year: int, stamps: list[int]) -> list[float]:
    """z per tijdstap, zoals forecast() in opsplitsing.py: (z_dag + z_uur) / √2, alleen afhankelijk van jaar, dag en uur."""
    per_hour = {}
    out = []
    for stamp in stamps:
        hour = stamp // 3600
        if hour not in per_hour:
            per_hour[hour] = (random.Random(f"{year}-dag-{hour // 24}").gauss(0, 1)
                              + random.Random(f"{year}-uur-{hour}").gauss(0, 1)) / 2 ** 0.5
        out.append(per_hour[hour])
    return out


def supply_columns(runtime) -> tuple[list[int], list[list]]:
    model = runtime["model"]
    years = model.available_years()
    columns = []
    for year in years:
        base = json.loads((SRC / "data" / f"{year}.json").read_text())
        columns.append(base["t"])
        columns.append(forecast_z(year, base["t"]))
        for parks in PARK_SETS:
            supply = runtime["wind_supply"](base, "onafhankelijk", parks)
            if supply["t"] != base["t"]:
                raise SystemExit(f"{year} {parks}: andere tijdstappen dan de standaardreeks; de werkmap verwacht dezelfde.")
            columns.append(supply["mw"])
            columns.append([round(v, 2) for v in supply["mw"]])
    return years, columns


def build(out: Path) -> None:
    runtime = load_runtime()
    model = runtime["model"]
    meta = runtime["dispatch"]("/aannames", {})
    years, columns = supply_columns(runtime)
    techs = list(meta["technologieen"].items())

    workbook = xlsxwriter.Workbook(str(out))
    workbook.set_properties({"title": "Elektrolyser opsplitsen", "subject": "Opsplitsing in modules (mijnwindpark.nl)",
                             "comments": f"Modelversie {model.MODEL_VERSION}; gebouwd met scripts/build-opsplitsing-excel.py",
                             "created": datetime(2026, 1, 1)})   # vaste datum: dezelfde bron geeft hetzelfde bestand
    bold = workbook.add_format({"bold": True, "valign": "top"})
    title = workbook.add_format({"bold": True, "font_size": 16})
    wrap = workbook.add_format({"text_wrap": True, "valign": "top"})
    head = workbook.add_format({"bold": True, "bg_color": "#DDE7EE", "border": 1, "text_wrap": True, "valign": "top"})
    group = workbook.add_format({"bold": True, "valign": "top"})
    cell = workbook.add_format({"valign": "top"})
    note = workbook.add_format({"italic": True, "font_color": "#555555", "text_wrap": True, "valign": "top"})
    choice = workbook.add_format({"bg_color": "#FFF2CC", "border": 1, "locked": False, "valign": "top"})
    choice_date = workbook.add_format({"bg_color": "#FFF2CC", "border": 1, "locked": False, "num_format": "yyyy-mm-dd"})
    value = workbook.add_format({"bg_color": "#FFF2CC", "border": 1, "locked": False, "valign": "top"})
    muted = workbook.add_format({"font_color": "#777777", "valign": "top"})

    # ---------------------------------------------------------------- Invoer
    ws = workbook.add_worksheet("Invoer")
    ws.set_column("A:A", 24)
    ws.set_column("B:B", 34)
    ws.set_column("C:C", 30)
    ws.set_column("D:D", 22)
    ws.set_column("E:F", 7)
    ws.set_column("G:G", 16)
    ws.set_column("H:H", 90)
    ws.set_column("I:J", 10, None, {"hidden": True})
    ws.set_column("K:M", 13)
    ws.write(0, 0, "Elektrolyser opsplitsen: één grote elektrolyser of meerdere kleine modules?", title)
    ws.set_row(1, 32)
    ws.merge_range(1, 0, 1, 7, "Kies de besturing en pas de gele cellen aan. Bereken vergelijkt de moduleaantallen op de gekozen windjaren; "
                   "Gevoeligheid, Omslagkaart en Dagverloop rekenen elk een eigen werkblad. Zelfde model als mijnwindpark.nl/opsplitsing "
                   f"(modelversie {model.MODEL_VERSION}).", note)
    strategies = "  ".join(f"{k}: {v}" for k, v in meta["strategieen"].items())
    standby = "  ".join(f"{k}: {v}" for k, v in meta["standbybeleid"].items())
    shares = meta["windkeuze"]["parken"]
    settings = [
        ("Technologie", techs[0][1]["naam"], "Kies en klik ‘Technologie laden’ om de standaardwaarden in de kolom Waarde te zetten."),
        ("Besturing", "verdelen", strategies),
        ("Stand-by", "vast", standby),
        ("Windparken", PARK_LABELS[0], "Aanbod: " + ", ".join(f"{v['naam']} {round(v['aandeel'] * 100)} % (tot {str(v['mw']).replace('.', ',')} MW)"
                                                            for v in shares.values()) + ". Windprofiel: productie-onafhankelijk (standaard)."),
        ("Windjaren", ", ".join(map(str, years)), "Komma's of reeksen, bijvoorbeeld 2022-2025 of 2024, 2025."),
        ("Aantal modules", ", ".join(map(str, meta["modules"])), f"1 tot en met {model.MAX_MODULES}, bijvoorbeeld 1-12 of 1, 2, 4, 8. "
                                                                  "De eerste is de basis voor vergelijkingen."),
        ("Gevoeligheid: aantal modules", 4, "Het aantal modules dat de gevoeligheid tegen 1 module afzet (2 tot en met 12)."),
        ("Dag voor dagverloop", None, "Leeg: de voorbeelddag van de laatste Bereken. Anders een datum in een van de windjaren."),
        ("Status", "", ""),
    ]
    for i, (label, default, hint) in enumerate(settings):
        row = ROW_SETTINGS + i
        ws.set_row(row, 75 if label in ("Besturing", "Stand-by") else 24)
        ws.merge_range(row, 0, row, 1, label, bold)
        if label == "Status":
            ws.write(row, 2, "", muted)
        elif label == "Dag voor dagverloop":
            ws.write_blank(row, 2, None, choice_date)
        else:
            ws.write(row, 2, default, choice)
        ws.merge_range(row, 3, row, 7, hint, note)
    tech_range = f"=$K${TABLE_FIRST_ROW}:${chr(ord('K') + len(techs) - 1)}${TABLE_FIRST_ROW}"
    ws.data_validation(ROW_SETTINGS, 2, ROW_SETTINGS, 2, {"validate": "list", "source": tech_range})
    ws.data_validation(ROW_SETTINGS + 1, 2, ROW_SETTINGS + 1, 2, {"validate": "list", "source": list(meta["strategieen"])})
    ws.data_validation(ROW_SETTINGS + 2, 2, ROW_SETTINGS + 2, 2, {"validate": "list", "source": list(meta["standbybeleid"])})
    ws.data_validation(ROW_SETTINGS + 3, 2, ROW_SETTINGS + 3, 2, {"validate": "list", "source": PARK_LABELS})
    ws.data_validation(ROW_SETTINGS + 6, 2, ROW_SETTINGS + 6, 2, {"validate": "integer", "criteria": "between", "minimum": 2,
                                                                  "maximum": model.MAX_MODULES})

    buttons = [("Bereken", "Bereken"), ("BerekenGevoeligheid", "Gevoeligheid"), ("BerekenOmslagkaart", "Omslagkaart"),
               ("BerekenDagverloop", "Dagverloop"), ("BerekenAlles", "Alles berekenen"), ("TechnologieLaden", "Technologie laden"),
               ("CacheLegen", "Geheugen legen")]
    ws.set_column(BUTTON_COL, BUTTON_COL, 24)
    for i, (macro, caption) in enumerate(buttons):
        ws.insert_button(ROW_SETTINGS + i + (1 if i >= 1 else 0) + (1 if i >= 2 else 0), BUTTON_COL,
                         {"macro": macro, "caption": caption, "width": 165, "height": 22, "x_offset": 4, "y_offset": 1})

    headers = ["Groep", "Aanname", "Waarde", "Eenheid", "Min", "Max", "Bron", "Uitleg", "Sleutel", "Schaal"] + [t["naam"] for _, t in techs]
    for c, text in enumerate(headers):
        ws.write(TABLE_FIRST_ROW - 1, c, text, head)
    ws.set_row(TABLE_FIRST_ROW - 1, 30)
    row = TABLE_FIRST_ROW
    for grp in meta["groepen"]:
        for i, f in enumerate(grp["velden"]):
            ws.write(row, 0, grp["naam"] if i == 0 else "", group)
            ws.write(row, 1, f["label"], cell)
            ws.write_number(row, 2, f["standaard"], value)
            ws.write(row, 3, f["eenheid"], cell)
            ws.write_number(row, 4, f["min"], cell)
            ws.write_number(row, 5, f["max"], cell)
            ws.write(row, 6, f["bron"], cell)
            ws.write(row, 7, f["uitleg"], wrap)
            ws.write(row, 8, f["key"], muted)
            ws.write_number(row, 9, f["schaal"], muted)
            for t, (_, tech) in enumerate(techs):
                ws.write_number(row, TECH_FIRST_COL + t, tech["waarden"][f["key"]], cell)
            ws.data_validation(row, 2, row, 2, {"validate": "decimal", "criteria": "between", "minimum": f["min"], "maximum": f["max"],
                                                "error_title": f["label"], "error_message": f"Kies een waarde van {f['min']} tot {f['max']}."})
            row += 1
    ws.freeze_panes(TABLE_FIRST_ROW, 3)
    ws.activate()

    # ---------------------------------------------------------------- uitkomstbladen (de macro's vullen ze)
    for name, text in [("Resultaten", "Klik op Invoer op ‘Bereken’."), ("Gevoeligheid", "Klik op Invoer op ‘Gevoeligheid’."),
                       ("Omslagkaart", "Klik op Invoer op ‘Omslagkaart’."), ("Dagverloop", "Klik op Invoer op ‘Dagverloop’.")]:
        sheet = workbook.add_worksheet(name)
        sheet.write(0, 0, name, title)
        sheet.write(1, 0, text, note)

    # ---------------------------------------------------------------- Toelichting
    info = workbook.add_worksheet("Toelichting")
    info.set_column("A:A", 26)
    info.set_column("B:B", 120)
    lines = [
        ("Wat", "Simulatie van een elektrolyser in N gelijke modules op vier echte windjaren, per tien minuten. Zelfde rekenmodel als "
                "mijnwindpark.nl/opsplitsing: src/opsplitsing/python/opsplitsing.py, naar VBA overgezet in excel/vba/."),
        ("Aanbod", "10 % van de gemodelleerde mogelijke opbrengst van Windpark Fryslân plus Windpark Beabuorren, uit KNMI-tienminutenwind "
                   "(gemiddelde van Houtribdijk en Stavoren, hoogtevertaling WINS50). Meetgaten vallen weg; jaartotalen worden herschaald "
                   "naar 8.760 uur. Alleen het standaardwindprofiel; de oude windprofielen van de website zitten niet in deze werkmap."),
        ("Aannames", "Alle elektrolyser- en kostengetallen zijn plaatshouders of standaardwaarden van de EU LCOH-tool (Clean Hydrogen "
                     "Partnership), geen leveranciersgegevens. De kolom Bron zegt per aanname waar de waarde vandaan komt."),
    ]
    lines += [(f"Besturing: {k}", v) for k, v in meta["strategieen"].items()]
    lines += [(f"Stand-by: {k}", v) for k, v in meta["standbybeleid"].items()]
    lines += [(f"Technologie: {t['naam']}", t["toelichting"]) for _, t in techs if t["toelichting"]]
    lines += [
        ("Gevoeligheid", "Elke aanname 25 % omlaag en omhoog binnen de grenzen van het veld. Kostenaannames rekenen opnieuw zonder "
                         "simulatie; bedrijfsvoering met een nieuwe simulatie. Het voordeel is LCOH(1 module) − LCOH(N modules)."),
        ("Omslagkaart", "Het goedkoopste aantal modules bij minimumlast 20, 25, 30, 40 en 50 % en vaste kosten per module 0 tot 2 M€."),
        ("Rekentijd", "Elke simulatie is één windjaar met één moduleaantal (ongeveer 52.000 tijdstappen). Uitkomsten blijven in het "
                      "geheugen zolang de werkmap open is; alleen kostenaannames wijzigen kost dan vrijwel geen rekentijd. "
                      "‘Geheugen legen’ vergeet ze."),
        ("Bijwerken", "De werkmap wordt gebouwd met python3 scripts/build-opsplitsing-excel.py; scripts/test-opsplitsing-excel.py "
                      "vergelijkt de VBA-uitkomsten met het Python-model. Pas de VBA aan in excel/vba/*.bas, niet alleen in Excel."),
    ]
    for i, (label, text) in enumerate(lines):
        info.write(i, 0, label, group)
        info.write(i, 1, text, wrap)

    # ---------------------------------------------------------------- Data_Aanbod
    data = workbook.add_worksheet("Data_Aanbod")
    names = []
    for year in years:
        names += [f"t {year}", f"z {year}"]
        for label in ["beide", "fryslan", "beabuorren"]:
            names += [f"mw {label} {year}", f"mw2 {label} {year}"]
    data.write_row(0, 0, names)
    data.write_row(1, 0, [len(col) for col in columns])
    longest = max(len(col) for col in columns)
    for i in range(longest):
        data.write_row(2 + i, 0, [col[i] if i < len(col) else None for col in columns])
    data.hide()
    assert len(names) == COLS_PER_YEAR * len(years)

    # ---------------------------------------------------------------- VBA
    sheets = ["ThisWorkbook"] + [f"Sheet{i + 1}" for i in range(len(workbook.worksheets()))]
    sources = [(name, (VBA / f"{name}.bas").read_text(encoding="utf-8")) for name in MODULES]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "vbaProject.bin"
        path.write_bytes(vba_project_bin(sources, sheets))
        workbook.add_vba_project(str(path))
        workbook.set_vba_name("ThisWorkbook")
        for i, sheet in enumerate(workbook.worksheets()):
            sheet.set_vba_name(f"Sheet{i + 1}")
        workbook.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--uit", type=Path, default=REPO / "excel" / "Opsplitsing.xlsm")
    args = parser.parse_args()
    args.uit.parent.mkdir(parents=True, exist_ok=True)
    build(args.uit)
    print(f"{args.uit} ({args.uit.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
