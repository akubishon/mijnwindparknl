"""Vergelijk de VBA in excel/Opsplitsing.xlsm met het Python-model van /opsplitsing.

    python3 scripts/test-opsplitsing-excel.py                 # bouwt een werkmap in een tijdelijke map en test die
    python3 scripts/test-opsplitsing-excel.py --werkmap excel/Opsplitsing.xlsm --snel

De macro's draaien in LibreOffice (headless, VBA-compatibiliteit), dat het vbaProject.bin uit de werkmap leest. Daarmee is
ook gecontroleerd dat dat bestand leesbaar is. Excel zelf is hier niet beschikbaar; Excel rekent sneller, met dezelfde
IEEE-getallen. Elke case zet de keuzes op Invoer, laadt de technologie met TechnologieLaden en draait Bereken (en bij
--volledig ook Gevoeligheid en Omslagkaart); daarna worden de werkbladen cel voor cel met dispatch() uit browser-runtime.py
vergeleken. Vereist LibreOffice (soffice met Python-UNO), Python 3.11+ en xlsxwriter.
"""

import argparse
import importlib.util
import math
import os
import random
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load("build_opsplitsing_excel", HERE / "build-opsplitsing-excel.py")
vbaproject = load("vbaproject", HERE / "vbaproject.py")

REL = 1e-9   # zelfde volgorde van bewerkingen: alleen afrondingsruis
FAILURES = []

RESULT_COLUMNS = ["modules", "module_mw", "waterstof_t", "benutting", "bedrijfsuren_gem", "productie_uur", "starts_warm_per_module",
                  "starts_koud_per_module", "standby_uur_per_module", "starts_vermeden_per_module", "stackwissel_dagen",
                  "jaren_tot_stackwissel", "capex_meur", "stack_meur_jaar", "stroom_meur_jaar", "kapitaal_meur_jaar", "kosten_meur_jaar",
                  "lcoh_eur_kg", "netto_eur_kg", "capex_break_even_meur", "vaste_kosten_break_even_meur", "opsplitsen",
                  "extra_waterstof_t", "extra_kosten_meur_jaar", "marginale_eur_kg", "stap_loont", "u:meer_waterstof",
                  "u:duurdere_installatie", "u:stroom_per_kilo", "u:stackvervanging", "kwh", "beste"]

CASES = [
    # naam, technologie, besturing, stand-by, windparken, jaren, moduleaantallen, extra aannames (getoonde eenheden)
    ("PEM, verdelen, vast", "PEM", "verdelen", "vast", "Beide", [2025], [1, 4], {}),
    ("Alkaline, bijschakelen, voorspelling", "Alkaline", "bijschakelen", "voorspelling", "Beide", [2024], [1, 3], {}),
    ("Alkaline hoog, samen, alleen Fryslân, twee jaren", "Alkaline, hoge minimumlast", "samen", "vast", "Windpark Fryslân", [2022, 2023],
     [1, 2], {"stroomprijs_eur_mwh": 60, "capex_subsidie_eur_kw": 200, "zuurstofprijs_eur_t": 50, "waterstofpremie_eur_kg": 1}),
    ("PEM, verdelen, voorspelling zonder fout, alleen Beabuorren", "PEM", "verdelen", "voorspelling", "Windpark Beabuorren", [2025], [2, 4],
     {"voorspelfout": 0, "rente": 0, "storingen_per_jaar": 0, "stackwissel_weken": 0}),
]


# Gevoeligheid en omslagkaart (--volledig): zonder stackwissels, dus één simulatie per job; voorspelling met fout, zodat ook de
# voorspelfout als gevoelige aanname meedoet.
FULL_CASE = ("Gevoeligheid en omslagkaart", "PEM", "verdelen", "voorspelling", "Beide", [2023], [1, 3], {"stackwissel_weken": 0})


def close(a, b, rel=REL):
    if a is None or b is None or a == "" or b == "":
        return (a in (None, "")) and (b in (None, ""))
    return math.isclose(float(a), float(b), rel_tol=rel, abs_tol=1e-9)


def check(label, got, want, rel=REL):
    if not close(got, want, rel):
        FAILURES.append(f"{label}: Excel {got!r} ≠ Python {want!r}")


class Office:
    def __init__(self):
        import uno
        from com.sun.star.beans import PropertyValue
        self.uno, self.PropertyValue = uno, PropertyValue
        with socket.socket() as s:
            s.bind(("localhost", 0))
            port = s.getsockname()[1]
        self.profile = tempfile.mkdtemp(prefix="lo-profile-")
        self.proc = subprocess.Popen(["soffice", "--headless", "--norestore", "--nologo", "--nodefault",
                                      f"-env:UserInstallation=file://{self.profile}",
                                      f"--accept=socket,host=localhost,port={port};urp;"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        for _ in range(120):
            try:
                self.ctx = resolver.resolve(f"uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise SystemExit("LibreOffice start niet.")
        self.desktop = self.ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", self.ctx)

    def prop(self, name, value):
        p = self.PropertyValue()
        p.Name, p.Value = name, value
        return p

    def open(self, path: Path):
        for _ in range(10):   # vlak na het starten geeft LibreOffice soms nog niets terug
            doc = self.desktop.loadComponentFromURL(path.resolve().as_uri(), "_blank", 0,
                                                    (self.prop("Hidden", True), self.prop("MacroExecutionMode", 4)))
            if doc is not None:
                return doc
            time.sleep(2)
        raise SystemExit(f"LibreOffice opent {path} niet.")

    def close(self):
        try:
            self.desktop.terminate()
        except Exception:
            pass
        self.proc.terminate()


def run_macro(doc, name):
    started = time.time()
    script = doc.getScriptProvider().getScript(f"vnd.sun.star.script:VBAProject.OpsplitsingWerkblad.{name}?language=Basic&location=document")
    script.invoke((), (), ())
    status = doc.Sheets.getByName("Invoer").getCellRangeByName("C12").getString()
    if "mislukt" in status:
        raise AssertionError(f"{name}: {status}")
    return time.time() - started


def cell(sheet, col, row):
    c = sheet.getCellByPosition(col, row)
    kind = c.getType().value
    if kind == "EMPTY":
        return None
    if kind == "VALUE":
        return c.getValue()
    return c.getString()


def serial_to_date(value: float) -> date:
    return date(1899, 12, 30) + timedelta(days=int(value))


def set_inputs(doc, tech, strategy, standby, parks, years, counts, changes, meta):
    invoer = doc.Sheets.getByName("Invoer")
    invoer.getCellRangeByName("C4").setString(tech)
    run_macro(doc, "TechnologieLaden")
    invoer.getCellRangeByName("C5").setString(strategy)
    invoer.getCellRangeByName("C6").setString(standby)
    invoer.getCellRangeByName("C7").setString(parks)
    invoer.getCellRangeByName("C8").setString(", ".join(map(str, years)))
    invoer.getCellRangeByName("C9").setString(", ".join(map(str, counts)))
    invoer.getCellRangeByName("C10").setValue(counts[-1])
    invoer.getCellRangeByName("C11").setString("")
    rows = {cell(invoer, 8, builder.TABLE_FIRST_ROW + i): builder.TABLE_FIRST_ROW + i for i in range(60)}
    for key, value in changes.items():
        invoer.getCellByPosition(2, rows[key]).setValue(value)
    shown = {}
    for key, row in rows.items():
        if key:
            shown[key] = cell(invoer, 2, row)
    return shown


def body(shown, strategy, standby, parks, years, counts):
    park_ids = {"Beide": ["fryslan", "beabuorren"], "Windpark Fryslân": ["fryslan"], "Windpark Beabuorren": ["beabuorren"]}[parks]
    return {"aannames": shown, "strategie": strategy, "standby": standby, "modules": counts, "jaren": years,
            "windprofiel": "onafhankelijk", "parken": park_ids}


def compare_results(doc, ref, name):
    sheet = doc.Sheets.getByName("Resultaten")
    rows = ref["rijen"]
    for r, want in enumerate(rows):
        for c, key in enumerate(RESULT_COLUMNS):
            got = cell(sheet, c, 5 + r)
            label = f"{name} · {want['modules']} modules · {key}"
            if key == "opsplitsen":
                expect = {"loont": "loont", "loont_niet": "loont niet", None: "basis"}[want["opsplitsen"]]
                if got != expect:
                    FAILURES.append(f"{label}: {got!r} ≠ {expect!r}")
            elif key == "stap_loont":
                expect = "" if r == 0 else ("ja" if want["stap_loont"] else "nee")
                if (got or "") != expect:
                    FAILURES.append(f"{label}: {got!r} ≠ {expect!r}")
            elif key == "beste":
                if (got == "laagste") != want["beste"]:
                    FAILURES.append(f"{label}: {got!r}, Python beste={want['beste']}")
            elif key.startswith("u:"):
                check(label, got, want["uitsplitsing"][key[2:]] if want["uitsplitsing"] else None)
            elif key == "kwh":
                check(label, got, want["uitsplitsing"]["kwh_per_kg"][1] if want["uitsplitsing"]
                      else (want["verbruik_mwh"] + want["standby_mwh"]) * 1000 / (want["waterstof_t"] * 1000))
            elif key in ("extra_waterstof_t", "extra_kosten_meur_jaar", "marginale_eur_kg"):
                check(label, got, want.get(key))
            else:
                check(label, got, want[key])
    # Per windjaar.
    start = 5 + len(rows) + 4
    for r, want in enumerate(rows):
        for y, year in enumerate(ref["jaren"]):
            per = want["jaren"][year]
            check(f"{name} · {want['modules']} modules · {year} waterstof", cell(sheet, 1 + 3 * y, start + r), per["waterstof_t"])
            check(f"{name} · {want['modules']} modules · {year} lcoh", cell(sheet, 2 + 3 * y, start + r), per["lcoh_eur_kg"])
            check(f"{name} · {want['modules']} modules · {year} netto", cell(sheet, 3 + 3 * y, start + r), per["netto_eur_kg"])
    # Aanbod en voorbeelddag.
    found = None
    for row in range(start, start + 40):
        if cell(sheet, 0, row) == "Windjaar":
            for y, year in enumerate(ref["jaren"]):
                check(f"{name} · aanbod {year}", cell(sheet, 1, row + 1 + y), ref["aanbod"][year]["mwh"])
        if cell(sheet, 0, row) == "Voorbeelddag":
            found = serial_to_date(cell(sheet, 1, row)).isoformat()
    if found != ref["voorbeelddag"]:
        FAILURES.append(f"{name} · voorbeelddag: Excel {found} ≠ Python {ref['voorbeelddag']}")
    return ref["voorbeelddag"]


def compare_day(doc, ref, name, predict):
    sheet = doc.Sheets.getByName("Dagverloop")
    row = 4
    for n, conf in ref["configuraties"].items():
        steps = conf["stappen"]
        title = cell(sheet, 0, row)
        if not title or not title.startswith(f"{n} module"):
            FAILURES.append(f"{name} · dagverloop: verwacht blok voor {n} modules in rij {row + 1}, staat er {title!r}")
            return
        row += 2
        for s, step in enumerate(steps):
            label = f"{name} · dag {ref['datum']} · {n} modules · stap {s}"
            check(label + " aanbod", cell(sheet, 1, row + s), step["aanbod"])
            check(label + " verbruik", cell(sheet, 2, row + s), step["verbruik"])
            check(label + " gewenst", cell(sheet, 3, row + s), step["gewenst"])
            check(label + " passen", cell(sheet, 4, row + s), step["passen"])
            for i in range(n):
                check(label + f" stack {i + 1}", cell(sheet, 5 + i, row + s), step["stack"][i])
                check(label + f" kg {i + 1}", cell(sheet, 5 + n + i, row + s), step["kg"][i])
                check(label + f" opstart {i + 1}", cell(sheet, 5 + 2 * n + i, row + s), step["opstart_min"][i])
                if (cell(sheet, 5 + 3 * n + i, row + s) == "ja") != step["uit"][i]:
                    FAILURES.append(label + f" onderhoud {i + 1}")
            j = 5 + 4 * n
            if predict:
                check(label + " voorspelling", cell(sheet, j, row + s), step["voorspelling"])
                check(label + " voorspeld gewenst", cell(sheet, j + 1, row + s), step["voorspeld_gewenst"])
                for i in range(n):
                    check(label + f" warmte {i + 1}", cell(sheet, j + 2 + i, row + s), step["warmte"][i])
                    if (cell(sheet, j + 2 + n + i, row + s) or "") != step["toestand"][i]:
                        FAILURES.append(label + f" toestand {i + 1}: {cell(sheet, j + 2 + n + i, row + s)!r} ≠ {step['toestand'][i]!r}")
                j += 2 + 2 * n
            if (cell(sheet, j, row + s) or "") != "; ".join(step["redenen"]):
                FAILURES.append(label + f" redenen: {cell(sheet, j, row + s)!r} ≠ {'; '.join(step['redenen'])!r}")
        row += len(steps) + 2


def compare_sensitivity(doc, ref, name):
    sheet = doc.Sheets.getByName("Gevoeligheid")
    check(f"{name} · gevoeligheid voordeel", cell(sheet, 3, 2), ref["voordeel"])
    for i, item in enumerate(ref["aannames"]):
        label = f"{name} · gevoeligheid {item['key']}"
        if cell(sheet, 0, 6 + i) != item["label"]:
            FAILURES.append(f"{label}: rij {7 + i} is {cell(sheet, 0, 6 + i)!r}")
            continue
        check(label + " nu", cell(sheet, 3, 6 + i), item["nu"])
        check(label + " laag", cell(sheet, 4, 6 + i), item["laag"]["waarde"])
        check(label + " voordeel laag", cell(sheet, 5, 6 + i), item["laag"]["voordeel"])
        check(label + " hoog", cell(sheet, 6, 6 + i), item["hoog"]["waarde"])
        check(label + " voordeel hoog", cell(sheet, 7, 6 + i), item["hoog"]["voordeel"])
    if cell(sheet, 0, 6 + len(ref["aannames"])) is not None:
        FAILURES.append(f"{name} · gevoeligheid: meer regels dan in Python")


def compare_omslag(doc, ref, name):
    sheet = doc.Sheets.getByName("Omslagkaart")
    for i, line in enumerate(ref["cellen"]):
        for f, item in enumerate(line):
            label = f"{name} · omslagkaart {ref['minimumlast'][i]} % / {ref['vaste_kosten_meur'][f]} M€"
            if item is None:
                if cell(sheet, 1 + f, 5 + 3 * i) != "–":
                    FAILURES.append(label + ": verwacht leeg")
                continue
            check(label + " beste", cell(sheet, 1 + f, 5 + 3 * i), item["beste"])
            check(label + " lcoh", cell(sheet, 1 + f, 6 + 3 * i), item["lcoh_eur_kg"])
            check(label + " lcoh een", cell(sheet, 1 + f, 7 + 3 * i), item["lcoh_een_eur_kg"])


def unit_checks():
    rng = random.Random(1)
    for size in (0, 1, 100, 4096, 4097, 20000):
        text = bytes(rng.choice(b"Dim x As Long\r\n ' opmerking ") for _ in range(size))
        assert vbaproject.decompress(vbaproject.compress(text)) == text, size
    for data in (b"\x00\x00\x00\x00", b"\x00", b"\xff"):
        assert vbaproject.decrypt("{ID}", vbaproject.encrypt("{ID}", data, rng)) == data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--werkmap", type=Path, help="bestaande werkmap; standaard wordt er een gebouwd")
    parser.add_argument("--snel", action="store_true", help="alleen de eerste twee cases, zonder dagverloop")
    parser.add_argument("--volledig", action="store_true", help="ook gevoeligheid en omslagkaart (duurt in LibreOffice minuten)")
    parser.add_argument("--alleen-volledig", action="store_true", help="alleen gevoeligheid en omslagkaart")
    args = parser.parse_args()
    unit_checks()
    workbook = args.werkmap
    if workbook is not None:
        # Een kopie: LibreOffice zet een slotbestand naast de werkmap en laat dat staan als het wordt afgebroken.
        copy = Path(tempfile.mkdtemp(prefix="opsplitsing-xlsm-")) / workbook.name
        shutil.copyfile(workbook, copy)
        workbook = copy
    else:
        workbook = Path(tempfile.mkdtemp(prefix="opsplitsing-xlsm-")) / "Opsplitsing.xlsm"
        builder.build(workbook)
    runtime = builder.load_runtime()
    dispatch = runtime["dispatch"]
    meta = dispatch("/aannames", {})
    office = Office()
    try:
        doc = office.open(workbook)
        if not doc.BasicLibraries.hasByName("VBAProject"):
            raise SystemExit("LibreOffice vindt geen VBA-project in de werkmap.")
        cases = [] if args.alleen_volledig else CASES[:2] if args.snel else CASES
        for name, tech, strategy, standby, parks, years, counts, changes in cases:
            shown = set_inputs(doc, tech, strategy, standby, parks, years, counts, changes, meta)
            request = body(shown, strategy, standby, parks, years, counts)
            seconds = run_macro(doc, "Bereken")
            day = compare_results(doc, dispatch("/bereken", request), name)
            print(f"{name}: Bereken {seconds:.0f} s, {len(FAILURES)} verschillen tot nu toe", flush=True)
            if not args.snel and day:
                seconds = run_macro(doc, "BerekenDagverloop")
                compare_day(doc, dispatch("/dag", {**request, "datum": day}), name, standby == "voorspelling")
                print(f"{name}: Dagverloop {day} {seconds:.0f} s, {len(FAILURES)} verschillen tot nu toe", flush=True)
        if args.volledig or args.alleen_volledig:
            name, tech, strategy, standby, parks, years, counts, changes = FULL_CASE
            shown = set_inputs(doc, tech, strategy, standby, parks, years, counts, changes, meta)
            request = body(shown, strategy, standby, parks, years, counts)
            seconds = run_macro(doc, "BerekenGevoeligheid")
            compare_sensitivity(doc, dispatch("/gevoeligheid", {**request, "n": counts[-1]}), name)
            print(f"{name}: Gevoeligheid {seconds:.0f} s, {len(FAILURES)} verschillen tot nu toe", flush=True)
            seconds = run_macro(doc, "BerekenOmslagkaart")
            compare_omslag(doc, dispatch("/omslagkaart", request), name)
            print(f"{name}: Omslagkaart {seconds:.0f} s, {len(FAILURES)} verschillen tot nu toe", flush=True)
        # Alleen Beabuorren (10,4 MW) haalt nooit de minimumlast van één module van 44 MW: zelfde melding als de website.
        set_inputs(doc, "PEM", "verdelen", "vast", "Windpark Beabuorren", [2025], [1, 2], {}, meta)
        try:
            run_macro(doc, "Bereken")
            FAILURES.append("geen waterstof: Bereken gaf geen foutmelding")
        except AssertionError as exc:
            try:
                dispatch("/bereken", body({}, "verdelen", "vast", "Windpark Beabuorren", [2025], [1, 2]))
                FAILURES.append("geen waterstof: Python gaf geen foutmelding")
            except ValueError as python_error:
                if str(python_error) not in str(exc):
                    FAILURES.append(f"geen waterstof: Excel {exc} ≠ Python {python_error}")
        print(f"Geen waterstof: {len(FAILURES)} verschillen tot nu toe", flush=True)
        doc.close(True)
    finally:
        office.close()
    for line in FAILURES[:40]:
        print("VERSCHIL", line)
    if FAILURES:
        print(f"{len(FAILURES)} verschillen")
        return 1
    print("Excel-werkmap gelijk aan het Python-model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
