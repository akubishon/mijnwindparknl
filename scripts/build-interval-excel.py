"""Bouw excel/Interval-10-minuten.xlsx: één tijdstap van tien minuten uit /opsplitsing, met formules na te rekenen.

De werkmap volgt `stack_sec_full`, `degradation`, `stack_kg_h`, `draw_mw`, `equal_share` en `desired_count` (besturing
"verdelen") uit src/opsplitsing/python/opsplitsing.py, voor 1, 2, 3 en 4 modules. Alleen de natuurkunde van één stap:
de modules draaien al (geen opstartverlies, minimale aan-/uit-tijd, startvertraging of onderhoud).

    pip install openpyxl
    python3 scripts/build-interval-excel.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parent.parent / "excel" / "Interval-10-minuten.xlsx"
COUNTS = [1, 2, 3, 4]

FONT = "Arial"
F = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=14, bold=True)
HEAD = Font(name=FONT, size=11, bold=True, color="FFFFFF")
INPUT = Font(name=FONT, size=10, color="0000FF")
GREY = Font(name=FONT, size=9, italic=True, color="595959")
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEADFILL = PatternFill("solid", fgColor="1F4E78")
SUBFILL = PatternFill("solid", fgColor="DDEBF7")
RESULT = PatternFill("solid", fgColor="E2EFDA")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()
ws = wb.active
ws.title = "Interval"


def put(cell, value, font=F, fmt=None, fill=None, border=True, align=None):
    c = ws[cell]
    c.value = value
    c.font = font
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    if border:
        c.border = BOX
    if align:
        c.alignment = align
    return c


def section(row, text, last_col="H"):
    for col in range(1, ws[f"{last_col}1"].column + 1):
        ws.cell(row=row, column=col).fill = HEADFILL
    put(f"A{row}", text, HEAD, fill=HEADFILL, border=False)


ws["A1"].value = "Eén interval van 10 minuten: 1, 2, 3 en 4 modules"
ws["A1"].font = TITLE
ws["A2"].value = ("Narekening van één tijdstap uit /opsplitsing (src/opsplitsing/python/opsplitsing.py, besturing ‘verdelen’). "
                  "Pas alleen de gele cellen aan (blauwe tekst); al het andere zijn formules.")
ws["A2"].font = GREY
ws["A3"].value = ("Aanname voor deze narekening: de modules draaien al. Opstartverlies, minimale aan-/uit-tijd, startvertraging, "
                  "warmhouden en onderhoud spelen dus geen rol. De storingsafslag past het model alleen toe op jaartotalen, niet per stap.")
ws["A3"].font = GREY

# ------------------------------------------------------------------ A. invoer
section(5, "A. Invoer (standaard: PEM)")
put("A6", "Grootheid", BOLD, fill=SUBFILL)
put("B6", "Waarde", BOLD, fill=SUBFILL)
put("C6", "Eenheid", BOLD, fill=SUBFILL)
put("D6", "Naam in opsplitsing.py / uitleg", BOLD, fill=SUBFILL)
inputs = [
    ("aanbod", "Windaanbod in dit interval (na BoP-correctie)", 10, "MW", "0.00",
     "power: gemiddeld vermogen van de parken in deze 10 minuten. Voorbeeldwaarde; vul een eigen waarde in."),
    ("cap", "Totaal stackvermogen", 44, "MW", "0.00", "capaciteit_mw: verdeeld over N gelijke modules"),
    ("minlast", "Minimumlast per module", 0.25, "% van module", "0.0%", "minimumlast"),
    ("secvol", "Energieverbruik bij vollast (systeem)", 53.3, "kWh/kg", "0.00", "systeemverbruik_vol, incl. BoP, nieuwe stack"),
    ("deellast", "Deellastvoordeel stack", 0.10, "%", "0.0%", "deellastvoordeel"),
    ("faraday", "Faradayverlies bij 10 % last", 0.03, "%", "0.0%", "faradayverlies_10"),
    ("bopv", "BoP-vast", 0.03, "% van module", "0.0%", "bop_vast"),
    ("bopvar", "BoP-variabel", 0.07, "% van stack", "0.0%", "bop_variabel"),
    ("degj", "Stackdegradatie", 0.01, "% per jaar", "0.0%", "degradatie_jaar"),
    ("degn", "Degradatieperiode", 10, "jaar", "0", "degradatie_jaren"),
]
REF = {}
row = 7
for key, label, value, unit, fmt, note in inputs:
    put(f"A{row}", label)
    put(f"B{row}", value, INPUT, fmt, YELLOW)
    put(f"C{row}", unit)
    put(f"D{row}", note, GREY)
    REF[key] = f"$B${row}"
    row += 1
ws[REF["aanbod"]].comment = Comment("Voorbeeldwaarde, geen meting. Bij 10 MW staat 1 module van 44 MW uit; "
                                    "probeer ook 20 of 40 MW.", "Claude")

# ------------------------------------------------------------------ B. vaste afgeleiden
row += 1
section(row, "B. Afgeleid uit de invoer (voor elk moduleaantal gelijk)")
row += 1
for col, text in zip("ABCD", ["Grootheid", "Waarde", "Eenheid", "Formule in woorden"]):
    put(f"{col}{row}", text, BOLD, fill=SUBFILL)
row += 1
R = REF
derived = [
    ("stap", "Lengte tijdstap", "=10/60", "uur", "0.0000", "STEP_H = 1/6 uur"),
    ("secstack", "Stackverbruik op vollast (nieuwe stack)",
     f"={R['secvol']}*(1-{R['faraday']}*0.1)/(1+{R['bopvar']}+{R['bopv']})", "kWh/kg", "0.0000",
     "stack_sec_full = systeemverbruik × (1 − Faraday × 0,1) / (1 + BoP-variabel + BoP-vast)"),
    ("deg", "Gemiddeld extra verbruik door degradatie", f"={R['degj']}*{R['degn']}/2", "%", "0.00%",
     "degradation = degradatie per jaar × jaren / 2 (gemiddelde over de periode)"),
    ("aanbodmwh", "Aangeboden energie in dit interval", f"={R['aanbod']}*{{stap}}", "MWh", "0.0000",
     "aanbod × 1/6 uur"),
]
for key, label, formula, unit, fmt, note in derived:
    formula = formula.replace("{stap}", REF.get("stap", ""))
    put(f"A{row}", label)
    put(f"B{row}", formula, F, fmt)
    put(f"C{row}", unit)
    put(f"D{row}", note, GREY)
    REF[key] = f"$B${row}"
    row += 1

# ------------------------------------------------------------------ D. kandidaten (eerst plannen, rijen vastleggen)
# Sectie C (overzicht per moduleaantal) verwijst naar sectie D (alle mogelijke aantallen draaiende modules k).
row += 1
c_start = row
c_rows = [
    "N", "size", "minstack", "mindraw", "fulldraw", "fits", "k", "share", "x", "faradayf", "sec", "kgh1", "kgh",
    "kg", "draw", "used", "benut", "lost",
]
c_row = {key: c_start + 2 + i for i, key in enumerate(c_rows)}
d_start = c_start + 2 + len(c_rows) + 2
d_first = d_start + 2
cand_rows = {(n, k): d_first + (n - 1) * 4 + (k - 1) for n in COUNTS for k in COUNTS}

COLS = {n: get_column_letter(4 + i) for i, n in enumerate(COUNTS)}   # D..G

# ------------------------------------------------------------------ C. per moduleaantal
section(c_start, "C. Het interval per moduleaantal (besturing ‘verdelen’)")
put(f"A{c_start + 1}", "Stap", BOLD, fill=SUBFILL)
put(f"B{c_start + 1}", "Eenheid", BOLD, fill=SUBFILL)
put(f"C{c_start + 1}", "Formule in woorden", BOLD, fill=SUBFILL)
for n, col in COLS.items():
    put(f"{col}{c_start + 1}", f"{n} module{'s' if n > 1 else ''}", BOLD, fill=SUBFILL,
        align=Alignment(horizontal="center"))
put(f"H{c_start + 1}", "opsplitsing.py", BOLD, fill=SUBFILL)


def crow(key):
    return c_row[key]


def block(n, col):
    """Bereik van kolom `col` in sectie D voor moduleaantal n (k = 1..4)."""
    return f"${col}${cand_rows[(n, 1)]}:${col}${cand_rows[(n, 4)]}"


spec = [
    ("N", "1. Aantal modules N", "", "gegeven", lambda n, c: n, "0", "n"),
    ("size", "2. Vermogen per module", "MW", "totaal stackvermogen / N",
     lambda n, c: f"={R['cap']}/{c}{crow('N')}", "0.00", "size"),
    ("minstack", "3. Minimale stacklast per module", "MW", "minimumlast × modulevermogen",
     lambda n, c: f"={R['minlast']}*{c}{crow('size')}", "0.000", "a.minimumlast * size"),
    ("mindraw", "4. Minimaal stroomverbruik per module (incl. BoP)", "MW",
     "minimale stacklast × (1 + BoP-variabel) + BoP-vast × modulevermogen",
     lambda n, c: f"={c}{crow('minstack')}*(1+{R['bopvar']})+{R['bopv']}*{c}{crow('size')}", "0.000", "draw_mw(minimum)"),
    ("fulldraw", "5. Stroomverbruik per module op vollast", "MW",
     "modulevermogen × (1 + BoP-variabel) + BoP-vast × modulevermogen",
     lambda n, c: f"={c}{crow('size')}*(1+{R['bopvar']})+{R['bopv']}*{c}{crow('size')}", "0.000", "draw_mw(size)"),
    ("fits", "6. Zoveel modules passen boven hun minimum", "modules",
     "kleinste van N en ⌊aanbod / minimaal verbruik⌋",
     lambda n, c: f"=MIN({c}{crow('N')},INT({R['aanbod']}/{c}{crow('mindraw')}))", "0", "fits"),
    ("k", "7. Gekozen aantal draaiende modules k", "modules",
     "het aantal uit sectie D met de meeste waterstof (bij gelijkspel het kleinste); 0 = alles uit",
     lambda n, c: (f"=IF(MAX({block(n, 'L')})<=0,0,"
                   f"INDEX({block(n, 'B')},MATCH(MAX({block(n, 'L')}),{block(n, 'L')},0)))"), "0", "desired_count"),
    ("share", "8. Stackvermogen per draaiende module", "MW",
     "kleinste van modulevermogen en (aanbod / k − BoP-vast × modulevermogen) / (1 + BoP-variabel)",
     lambda n, c: (f"=IF({c}{crow('k')}=0,0,MIN({c}{crow('size')},"
                   f"({R['aanbod']}/{c}{crow('k')}-{R['bopv']}*{c}{crow('size')})/(1+{R['bopvar']})))"),
     "0.000", "equal_share"),
    ("x", "9. Last per module", "% van module", "stackvermogen / modulevermogen",
     lambda n, c: f"={c}{crow('share')}/{c}{crow('size')}", "0.0%", "x"),
    ("faradayf", "10. Faradayrendement", "", "1 − Faradayverlies × 0,1 / last (niet onder 0)",
     lambda n, c: f"=IF({c}{crow('x')}<=0,0,MAX(0,1-{R['faraday']}*0.1/{c}{crow('x')}))", "0.0000", "faraday"),
    ("sec", "11. Stackverbruik bij deze last", "kWh/kg",
     "stackverbruik vollast × (1 − deellastvoordeel × (1 − last)) × (1 + degradatie)",
     lambda n, c: f"={R['secstack']}*(1-{R['deellast']}*(1-{c}{crow('x')}))*(1+{R['deg']})", "0.0000", "sec"),
    ("kgh1", "12. Waterstof per draaiende module", "kg/uur",
     "stackvermogen × 1000 / stackverbruik × Faradayrendement (0 als last < minimumlast)",
     lambda n, c: (f"=IF(OR({c}{crow('x')}<=0,{c}{crow('x')}<{R['minlast']}-1E-9),0,"
                   f"{c}{crow('share')}*1000/{c}{crow('sec')}*{c}{crow('faradayf')})"), "0.00", "stack_kg_h"),
    ("kgh", "13. Waterstof alle modules samen", "kg/uur", "k × waterstof per module",
     lambda n, c: f"={c}{crow('k')}*{c}{crow('kgh1')}", "0.00", ""),
    ("kg", "14. Waterstof in dit interval van 10 minuten", "kg", "kg/uur × 1/6 uur",
     lambda n, c: f"={c}{crow('kgh')}*{R['stap']}", "0.000", "step_kg"),
    ("draw", "15. Stroomverbruik alle modules (incl. BoP)", "MW",
     "k × (stackvermogen × (1 + BoP-variabel) + BoP-vast × modulevermogen)",
     lambda n, c: (f"=IF({c}{crow('k')}=0,0,{c}{crow('k')}*({c}{crow('share')}*(1+{R['bopvar']})"
                   f"+{R['bopv']}*{c}{crow('size')}))"), "0.000", "draw_mw"),
    ("used", "16. Verbruikte energie in dit interval", "MWh", "stroomverbruik × 1/6 uur",
     lambda n, c: f"={c}{crow('draw')}*{R['stap']}", "0.0000", "used"),
    ("benut", "17. Benutting van het aanbod", "%", "verbruikte energie / aangeboden energie",
     lambda n, c: f"=IF({R['aanbodmwh']}=0,0,{c}{crow('used')}/{R['aanbodmwh']})", "0.0%", "benutting"),
    ("lost", "18. Niet benut aanbod", "MWh", "aangeboden energie − verbruikte energie",
     lambda n, c: f"={R['aanbodmwh']}-{c}{crow('used')}", "0.0000", ""),
]
assert [s[0] for s in spec] == c_rows
for key, label, unit, words, formula, fmt, py in spec:
    r = crow(key)
    highlight = RESULT if key in ("k", "kg", "benut") else None
    put(f"A{r}", label, BOLD if highlight else F, fill=highlight)
    put(f"B{r}", unit)
    put(f"C{r}", words, GREY, align=WRAP)
    for n, col in COLS.items():
        put(f"{col}{r}", formula(n, col), BOLD if highlight else F, fmt, highlight)
    put(f"H{r}", py, GREY)

# ------------------------------------------------------------------ D. kandidaten
section(d_start, "D. Hoe de besturing k kiest: elk mogelijk aantal draaiende modules uitgerekend", last_col="L")
heads = ["N", "k draaiend", "Past k? (k ≤ passen)", "Stackvermogen per module (MW)", "Last per module",
         "Boven minimumlast?", "Faradayrendement", "Stackverbruik (kWh/kg)", "Waterstof per module (kg/uur)",
         "Mogelijk?", "Toelichting", "Waterstof totaal (kg/uur)"]
for i, text in enumerate(heads):
    put(f"{get_column_letter(i + 1)}{d_start + 1}", text, BOLD, fill=SUBFILL, align=WRAP)
for (n, k), r in cand_rows.items():
    col = COLS[n]
    size, fits = f"{col}${crow('size')}", f"{col}${crow('fits')}"
    put(f"A{r}", n, F, "0")
    put(f"B{r}", k, F, "0")
    put(f"C{r}", f'=IF(B{r}<={fits},"ja","nee")')
    put(f"D{r}", f"=MIN({size},({R['aanbod']}/B{r}-{R['bopv']}*{size})/(1+{R['bopvar']}))", F, "0.000")
    put(f"E{r}", f"=D{r}/{size}", F, "0.0%")
    put(f"F{r}", f'=IF(AND(E{r}>0,E{r}>={R["minlast"]}-1E-9),"ja","nee")')
    put(f"G{r}", f"=IF(E{r}<=0,0,MAX(0,1-{R['faraday']}*0.1/E{r}))", F, "0.0000")
    put(f"H{r}", f"={R['secstack']}*(1-{R['deellast']}*(1-E{r}))*(1+{R['deg']})", F, "0.0000")
    put(f"I{r}", f'=IF(F{r}="ja",D{r}*1000/H{r}*G{r},0)', F, "0.00")
    put(f"J{r}", f'=IF(AND(B{r}<=A{r},C{r}="ja"),"ja","nee")')
    put(f"K{r}", f'=IF(B{r}>A{r},"meer dan N modules",IF(C{r}="nee","te weinig wind voor k modules",'
                 f'IF(B{r}={COLS[n]}${crow("k")},"← gekozen","")))', GREY)
    put(f"L{r}", f'=IF(J{r}="ja",B{r}*I{r},0)', BOLD, "0.00")
    if k == 4:
        for col_idx in range(1, 13):
            ws.cell(row=r, column=col_idx).border = Border(left=THIN, right=THIN, top=THIN,
                                                           bottom=Side(style="medium", color="1F4E78"))
note = d_first + 16
ws[f"A{note}"].value = ("Besturing ‘verdelen’: van alle k die passen kiest het model de k met de meeste waterstof per uur; "
                        "het aanbod wordt gelijk over de k modules verdeeld. Elke module is beperkt tot haar eigen vermogen; "
                        "wat overblijft gaat verloren (regel 18).")
ws[f"A{note}"].font = GREY

# ------------------------------------------------------------------ opmaak
widths = {"A": 46, "B": 14, "C": 44, "D": 16, "E": 16, "F": 16, "G": 16, "H": 18, "I": 16, "J": 11, "K": 26, "L": 16}
for col, w in widths.items():
    ws.column_dimensions[col].width = w
for r in range(c_start + 2, c_start + 2 + len(c_rows)):
    ws.row_dimensions[r].height = 27
ws.row_dimensions[d_start + 1].height = 40
ws.freeze_panes = "A5"
ws.sheet_view.zoomScale = 100

OUT.parent.mkdir(exist_ok=True)
wb.save(OUT)
print(OUT)
