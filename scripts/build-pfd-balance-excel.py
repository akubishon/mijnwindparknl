"""Build excel/PFD-massa-energiebalans-Sunfire-4x10MW.xlsx.

Starting point for a PFD and mass & energy balance of 4 x Sunfire HyLink Alkaline 22 (4 x 10 MW DC = 40 MW) at the
mijnwindparknl site, derived from the MTSA GROHW WP3 PEM design (1900601R-008 / PFD 1900601R-009 / MB 1900601R-010).

Sheets:
  MTSA components  every MTSA component in process order, with streams and order checks
  MTSA check       the MTSA 1 MW BOL mass balance recomputed with formulas (validates the method)
  Alkaline PFD     equipment list for 4 x HyLink Alkaline 22, in process order, mapped to MTSA
  Inputs           all assumptions (blue = editable), with source
  Balance          mass & energy balance per module and for the plant, all formulas
  Streams          stream table for the alkaline PFD (tags match docs/pfd-sunfire-hylink-4x10mw.md)

    pip install openpyxl
    python3 scripts/build-pfd-balance-excel.py
"""
import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.defined_name import DefinedName

OUT = Path(__file__).resolve().parent.parent / "excel" / "PFD-massa-energiebalans-Sunfire-4x10MW.xlsx"

FONT = "Arial"
F = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=14, bold=True)
HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
INPUT = Font(name=FONT, size=10, color="0000FF")
GREY = Font(name=FONT, size=9, italic=True, color="595959")
RED = Font(name=FONT, size=10, bold=True, color="C00000")
HEADFILL = PatternFill("solid", fgColor="1F4E78")
SUBFILL = PatternFill("solid", fgColor="DDEBF7")
INFILL = PatternFill("solid", fgColor="FFF2CC")
RESULT = PatternFill("solid", fgColor="E2EFDA")
WARN = PatternFill("solid", fgColor="FCE4D6")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()


def put(ws, ref, value, font=F, fmt=None, fill=None, border=True, wrap=False):
    c = ws[ref]
    c.value = value
    c.font = font
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = fill
    if border:
        c.border = BOX
    if wrap:
        c.alignment = WRAP
    return c


def header(ws, row, labels, widths=None):
    for i, lab in enumerate(labels):
        col = chr(ord("A") + i)
        put(ws, f"{col}{row}", lab, HEAD, fill=HEADFILL, wrap=True)
        if widths:
            ws.column_dimensions[col].width = widths[i]


def table(ws, row, rows, wrap_cols=()):
    for r in rows:
        if isinstance(r, str):  # section line
            put(ws, f"A{row}", r, BOLD, fill=SUBFILL)
            for col in "BCDEFGH"[: ws.max_column - 1]:
                put(ws, f"{col}{row}", None, fill=SUBFILL)
            row += 1
            continue
        for i, v in enumerate(r):
            col = chr(ord("A") + i)
            put(ws, f"{col}{row}", v, wrap=col in wrap_cols or i >= 2)
        row += 1
    return row


# ---------------------------------------------------------------- MTSA components, in process order
ws = wb.active
ws.title = "MTSA components"
put(ws, "A1", "MTSA GROHW WP3 (PEM, 1–2 MW): components in process order", TITLE, border=False)
put(ws, "A2", "Source: MTSA 1900601R-008 rev 2 (text), schematic 1900601R-007, PFD 1900601R-009 rev 1, mass balance "
    "1900601R-010 rev 0, W+B appendices VIII–X. Tags as on PFD 009 (the text still uses the older tags of schematic 007).",
    GREY, border=False)
header(ws, 4, ["Step", "Tag (PFD 009)", "Component", "Function", "Stream in", "Stream out", "Order check / remark"],
       [6, 14, 30, 48, 18, 18, 70])
rows = [
    "1. Feed water treatment (drinking water to UPW, 0.055 µS/cm)",
    (1, "—", "Potable water inlet", "Drinking water from grid, 0.5 barg, 15 °C, ~500 µS/cm", "OSBL", "101", "OK: first battery-limit item."),
    (2, "V-111", "Water softener", "Removes hardness (Ca/Mg) so RO does not scale", "101", "111; 131 waste", "OK: softening must come before RO. 4 % to drain (9.29 of 232.27 kg/h)."),
    (3, "T-121", "Break tank (raw)", "Atmospheric buffer between softener and RO pump", "111", "to P-122", "OK."),
    (4, "P-122", "RO feed pump", "Raises water to 3 barg for RO", "T-121", "121", "OK: pump after break tank."),
    (5, "S-123", "Reverse osmosis", "Removes ~98 % of salts (500 → 8 µS/cm)", "121", "122; 132 reject", "OK. 80 % recovery (178.39 of 222.98 kg/h)."),
    (6, "S-124", "EDI cell (electro-deionisation)", "Polishes RO permeate to UPW 0.055 µS/cm", "122", "141; 133 reject", "OK: EDI always after RO. 90 % recovery. Text calls the whole train S-101."),
    (7, "T-151", "UPW break tank", "Collects make-up UPW (141), O2-cooler condensate (143) and side-stream for polishing (142)", "141, 142, 143", "to P-152", "OK. Text calls it V-151. Vent via S-152 filter and CO2 lock keeps CO2 out of UPW."),
    (8, "S-152", "Filter and CO2 lock", "Breather on T-151 so air/CO2 do not raise conductivity", "air", "—", "OK."),
    (9, "P-152", "UPW feed pump", "Lifts UPW from atmospheric tank to V-201 (4.2 barg)", "T-151", "151", "OK."),
    (10, "S-161", "Demi cartridges (2 × mixed-bed ion exchange)", "Polishes make-up + side-stream before it enters the loop", "151", "161", "Changed vs text: text puts ion exchange S-221 inside the circulation loop; PFD 009 moved it to this side-stream (V-201 → T-151 → S-161 → V-201). Both are valid; side-stream keeps resin away from 60 °C full flow."),
    "2. UPW circulation and O2 production (anode loop)",
    (11, "V-201", "O2 gas–liquid separation vessel", "Separates O2 from returning UPW; reservoir for the loop; its pressure (4.2 barg) sets O2 pressure", "161, 213, 311", "171 (O2), 211 (UPW), 142", "OK."),
    (12, "P-211", "UPW circulation pump", "Circulates ~57 t/h UPW over the stacks (mainly for cooling)", "V-201", "211", "OK."),
    (13, "E-212", "Stack heat exchanger (cooling cycle 1)", "Keeps stack inlet at 60 °C; cooling water 55 → 60 °C (heat recovery possible)", "211; 221 CW in", "→ S-213; 222 CW out", "OK: cooler before filter before stack."),
    (14, "S-213", "Filter", "Last particle filter before the stacks", "from E-212", "212", "OK: filter directly upstream of stack is correct."),
    (15, "A-231 / A-251", "PEM electrolyser stacks (1 MW each)", "H2O → H2 (cathode, 40 barg) + O2 (anode, 4.2 barg)", "212; DC power; N2 purge", "213 (UPW+O2), 301 (H2+water)", "OK. 1 MW = 1 stack, 2 MW = 2 stacks."),
    (16, "E-202", "O2 cooler (heat exchanger)", "Cools O2 from ~64–70 °C to 25 °C to recover water", "171; glycol 353", "172; 143 condensate; 354", "OK. Condensate to T-151 (UPW quality). Mass balance labels 354 'From E-301' – typo, should be E-202."),
    (17, "PCV (O2)", "Back-pressure valve O2", "Holds V-201 at pressure; O2 to user or vent", "172", "O2 to user / vent", "OK. O2 use is outside MTSA scope."),
    "3. Hydrogen production and treatment (cathode side)",
    (18, "V-301", "H2 gas–liquid separation vessel", "Separates water dragged through the membrane from H2", "301", "312 (H2), 311 (water)", "OK. 311 (1.1 t/h at 40 barg) is let down to V-201 at 4.2 barg: dissolved H2 flashes into the O2 vessel – check H2-in-O2 in HAZOP; level control valve not drawn."),
    (19, "A-321 (option C)", "De-oxo and dryer", "Removes O2 (catalytic) and water to 5 ppm: ISO 14687-2 Grade D (fuel station A1)", "312; glycol 355", "321; 322 water; 356", "OK: de-oxo must be before the dryer (de-oxo makes water)."),
    (20, "A-331 (option B)", "No treatment", "Bypass when H2 quality is not critical", "312", "331", "OK."),
    (21, "A-341 (option A)", "H2 cooler + gas–liquid separator", "Cools to 15 °C and knocks out water so no condensation at −15 °C in pipe (AND furnaces)", "312; glycol 357", "341; 342 water; 358", "OK."),
    (22, "PCV (H2)", "Pressure control valve", "Keeps electrolyser at constant 40 barg regardless of buffer pressure", "321/331/341", "to V-401", "OK: must sit between treatment and buffer."),
    "4. Compression and storage",
    (23, "V-401", "Low-pressure buffer vessel", "Absorbs production fluctuations at 35–37 barg so the compressor does not cycle", "PCV", "401", "OK: buffer before compressor is the right order."),
    (24, "A-411 (optional)", "Compressor", "Compresses to 350/500 barg for the fuel station", "401", "411", "OK. Only if end user needs > ~35 bar."),
    (25, "V-421 (optional)", "High-pressure storage", "Bottles / cylinders", "411", "421", "OK."),
    (26, "PCV", "Pressure control to end user", "", "421", "H2 to end user", "OK."),
    (27, "—", "Blow-off header", "Relief from V-401, V-421 and vents to safe height", "PSVs", "Blow-off", "OK."),
    "5. Utilities",
    (28, "E-351", "Cooling unit (chiller)", "Glycol (10 %) 10 → 25 °C for E-202, A-321, A-341 (cooling cycle 2)", "352 return", "351 supply", "OK."),
    (29, "P-411", "Glycol circulation pump", "Circulates the glycol loop", "E-351", "351", "Tag inconsistent: 400-series is storage; P-351 would match its loop."),
    (30, "—", "Nitrogen supply", "Purging the H2 side (start-up, shut-down, emergency)", "OSBL", "to stacks (G/H)", "OK."),
    (31, "—", "Cooling water (cycle 1)", "Stack cooling 55/60 °C via E-212; cooling back is outside MTSA scope (W+B: coolers / district heating)", "OSBL", "221 / 222", "OK."),
    (32, "—", "Transformer + rectifier", "10 kV grid → DC for the stacks (1.1 / 2.2 MVA per module)", "OSBL", "DC", "OK. W+B 11.510 / MTSA 11.150."),
    (33, "—", "Instrument air, control system", "Pneumatic valves; autonomous PLC", "OSBL", "—", "OK."),
]
end = table(ws, 5, rows)
put(ws, f"A{end + 1}", "Conclusion: the sequence is physically correct. The items flagged above are labelling inconsistencies "
    "between text, schematic 007, PFD 009 and the mass balance, plus one safety point (311 letdown into V-201).",
    BOLD, border=False)
ws.freeze_panes = "A5"

# ---------------------------------------------------------------- MTSA check (1 MW BOL)
wc = wb.create_sheet("MTSA check")
put(wc, "A1", "MTSA 1 MW BOL mass balance, recomputed", TITLE, border=False)
put(wc, "A2", "Values from MTSA 1900601R-010 (situation 1 MW, 1 stack, BOL) and W+B appendix VIII. Formulas show the method "
    "used on the Balance sheet reproduces MTSA.", GREY, border=False)
header(wc, 4, ["Quantity", "MTSA value", "Unit", "Recomputed", "Deviation", "How"], [44, 14, 12, 14, 12, 60])
chk = [
    ("DC power", 943.31, "kW", None, ""),
    ("H2 production (stream 301 H2)", 17.80, "kg/h", None, ""),
    ("Tap water in (101)", 232.27, "kg/h", None, ""),
    ("Softened water (111)", 222.98, "kg/h", "=B7*B19", "tap × softener recovery"),
    ("RO permeate (122)", 178.39, "kg/h", "=E8*B20", "softened × RO recovery"),
    ("EDI product = UPW make-up (141)", 160.55, "kg/h", "=E9*B21", "permeate × EDI recovery"),
    ("O2 produced (171 O2)", 141.29, "kg/h", "=B6*31.998/2.016/2", "Faraday: ½ mol O2 per mol H2"),
    ("Water split", None, "kg/h", "=B6*18.015/2.016", "1 mol H2O per mol H2"),
    ("Specific energy, DC", 52.99, "kWh/kg", "=B5/B6", ""),
    ("Water use per kg H2 (incl. rejects)", 13.06, "kg/kg", "=B7/B6", "MTSA: 13.06 L/kg"),
    ("Stack heat to cooling water (221→222)", None, "kW", "=48754.47*4.18*(60-55)/3600", "m·cp·ΔT of stream 221/222"),
    ("Stack heat, P_DC − H2·HHV", None, "kW", "=B5-B6*39.41", "thermoneutral method (Balance sheet)"),
    ("", None, "", None, ""),
]
r = 5
for name, val, unit, f, how in chk:
    put(wc, f"A{r}", name)
    put(wc, f"B{r}", val, fmt="#,##0.00")
    put(wc, f"C{r}", unit)
    put(wc, f"D{r}", f, fmt="#,##0.00", fill=RESULT if f else None)
    put(wc, f"E{r}", f"=IF(AND(ISNUMBER(B{r}),ISNUMBER(D{r})),D{r}/B{r}-1,\"\")" if f and val else None, fmt="0.0%")
    put(wc, f"F{r}", how, wrap=True)
    r += 1
# recoveries (derived from MTSA)
put(wc, "A18", "Recoveries derived from MTSA", BOLD, border=False)
for rr, (lab, f) in enumerate([("Softener (111/101)", "=222.98/232.27"), ("RO (122/111)", "=178.39/222.98"),
                               ("EDI (141/122)", "=160.55/178.39")], start=19):
    put(wc, f"A{rr}", lab)
    put(wc, f"B{rr}", f, fmt="0.0%")
# 'Recomputed' for rows that start from MTSA inputs: show the input itself
for rr in (5, 6, 7):
    wc[f"D{rr}"].value = f"=B{rr}"
# Softened water starts from tap: recompute E column references
wc["D8"].value = "=B7*B19"
wc["D9"].value = "=D8*B20"
wc["D10"].value = "=D9*B21"
put(wc, "A23", "Reading: 232 kg/h tap water gives 160.6 kg/h UPW (69 % overall recovery); 159.1 kg/h is split into H2/O2 (the remaining ~1.5 kg/h leaves as vapour with the gases). "
    "Stack heat via m·cp·ΔT (283 kW) and via P_DC − H2·HHV (242 kW) agree within the extra heat from feed-water heating "
    "and electro-osmotic drag that MTSA includes. The Balance sheet uses the same method.", GREY, border=False)

# ---------------------------------------------------------------- Inputs
wi = wb.create_sheet("Inputs")
put(wi, "A1", "Inputs: 4 × Sunfire HyLink Alkaline 22 at mijnwindparknl", TITLE, border=False)
put(wi, "A2", "Blue values on yellow are editable. 'Datasheet' = Sunfire HyLink Alkaline 22 (elektrolyser-atlas "
    "AlkalineElectroLysis/Sunfire_10MW.pdf p. 1–3). 'Assumption' = to be confirmed with Sunfire.", GREY, border=False)
header(wi, 4, ["Input", "Value", "Unit", "Name", "Source / remark"], [46, 12, 12, 16, 80])
inputs = [
    "Plant",
    ("Number of modules", 4, "-", "N_mod", "User: 4 × HyLink Alkaline 22"),
    ("DC power per module", 10, "MW", "P_DC", "Datasheet: 10 MW DC module (2 × 5 MW stacks)"),
    ("H2 production per module at full load", 200, "kg/h", "mH2_mod", "Datasheet: 200 kg/h. Assumed to be stack (gross) output before gas cleaning"),
    ("Total power consumption AC at full load", 52.2, "kWh/kg", "SEC_AC", "Datasheet range 46.4–52.2 kWh/kg AC; upper end taken for full load (assumption)"),
    ("Transformer + rectifier efficiency", 0.975, "-", "eta_PSU", "Assumption (Power Supply Unit is in Sunfire scope)"),
    ("Wind supply available (10 % WP Fryslân + Beabuorren)", 48.7, "MW", "P_supply", "mijnwindparknl README: up to 38.3 + 10.4 MW"),
    "Process conditions",
    ("H2 outlet pressure", 30, "barg", "p_out", "Datasheet: 30 bar(g); separators assumed at the same pressure"),
    ("Stack / lye temperature", 80, "°C", "T_stack", "Assumption: typical for pressurised alkaline; not on datasheet"),
    ("Gas cooler outlet temperature (H2 and O2)", 25, "°C", "T_cool", "Assumption: gas skid 'gas cooling'"),
    ("Feed water temperature", 15, "°C", "T_feed", "As MTSA"),
    ("KOH concentration of lye", 0.30, "wt", "w_KOH", "Assumption: 25–30 wt% typical"),
    ("Lye cp", 3.2, "kJ/kg·K", "cp_lye", "Approx. for 30 wt% KOH at 80 °C"),
    ("Lye temperature rise over stack", 10, "K", "dT_lye", "Assumption; sets circulation flow"),
    "Gas purity",
    ("O2 in H2 before gas cleaning (mol, dry)", 0.002, "mol/mol", "x_O2inH2", "Datasheet 99.8 % dry; conservatively all 0.2 % taken as O2"),
    ("H2 in O2 (mol, dry)", 0.005, "mol/mol", "x_H2inO2", "Assumption; alarm typically at 1–2 % (LEL 4 %)"),
    ("Dryer regeneration loss (fraction of H2)", 0.01, "-", "f_regen", "Assumption; 0 if closed-loop regeneration"),
    "Water treatment (recoveries from MTSA, see MTSA check)",
    ("Softener recovery", "='MTSA check'!B19", "-", "r_soft", "MTSA 1900601R-010"),
    ("RO recovery", "='MTSA check'!B20", "-", "r_RO", "MTSA 1900601R-010"),
    ("EDI recovery", "='MTSA check'!B21", "-", "r_EDI", "MTSA. Alkaline feed water is usually < 1–5 µS/cm: EDI may be optional – check Sunfire spec"),
    "Cooling",
    ("Cooling water ΔT (lye coolers)", 10, "K", "dT_CW", "Assumption, e.g. 25 → 35 °C; or 60 → 70 °C for district heating"),
    ("Chilled glycol ΔT (gas coolers)", 15, "K", "dT_gly", "As MTSA (10 → 25 °C)"),
    ("Heat loss to ambient (fraction of stack heat)", 0.0, "-", "f_amb", "Assumption"),
    "Compression (optional)",
    ("Buffer pressure", 28, "barg", "p_buf", "Assumption: 30 barg minus ~2 bar over de-oxo/dryer and PCV"),
    ("End-user pressure", 28, "barg", "p_end", "Set > buffer pressure to size a compressor (e.g. 350 for trailers)"),
    ("Compressor stages", 3, "-", "n_stages", "Assumption"),
    ("Isentropic efficiency", 0.75, "-", "eta_comp", "Assumption"),
    ("Suction temperature", 25, "°C", "T_suc", "Assumption"),
    "Constants",
    ("M H2", 2.016, "kg/kmol", "MW_H2", ""),
    ("M O2", 31.998, "kg/kmol", "MW_O2", ""),
    ("M H2O", 18.015, "kg/kmol", "MW_H2O", ""),
    ("LHV H2", 33.33, "kWh/kg", "LHV", ""),
    ("HHV H2", 39.41, "kWh/kg", "HHV", ""),
    ("cp water", 4.18, "kJ/kg·K", "cp_w", ""),
    ("cp H2", 14.3, "kJ/kg·K", "cp_H2", ""),
    ("cp O2", 0.92, "kJ/kg·K", "cp_O2", ""),
    ("Latent heat of water (avg 25–80 °C)", 2370, "kJ/kg", "h_fg", ""),
    ("Reaction heat H2 + ½O2 → H2O(g)", 241800, "kJ/kmol", "dH_deoxo", "De-oxo exotherm"),
    ("Heat capacity ratio H2", 1.41, "-", "k_H2", ""),
]
r = 5
for item in inputs:
    if isinstance(item, str):
        put(wi, f"A{r}", item, BOLD, fill=SUBFILL)
        for col in "BCDE":
            put(wi, f"{col}{r}", None, fill=SUBFILL)
        r += 1
        continue
    lab, val, unit, name, src = item
    put(wi, f"A{r}", lab)
    is_const = r > 0 and name in {"MW_H2", "MW_O2", "MW_H2O", "LHV", "HHV", "cp_w", "cp_H2", "cp_O2", "h_fg", "dH_deoxo", "k_H2"}
    put(wi, f"B{r}", val, INPUT if not is_const else F, fill=INFILL if not is_const else None,
        fmt="0.0%" if unit in ("-", "wt", "mol/mol") and isinstance(val, float) and val < 1 or str(val).startswith("='MTSA") else "#,##0.###")
    put(wi, f"C{r}", unit)
    put(wi, f"D{r}", name, GREY)
    put(wi, f"E{r}", src, wrap=True)
    wb.defined_names[name] = DefinedName(name, attr_text=f"Inputs!$B${r}")
    r += 1
wi.freeze_panes = "A5"

# ---------------------------------------------------------------- Balance
wbal = wb.create_sheet("Balance")
put(wbal, "A1", "Mass & energy balance: Sunfire HyLink Alkaline 22, full load, BOL", TITLE, border=False)
put(wbal, "A2", "Per module and for the plant (× N_mod). All cells are formulas on the Inputs sheet. Stream numbers refer to "
    "the Streams sheet and docs/pfd-sunfire-hylink-4x10mw.md.", GREY, border=False)
header(wbal, 4, ["Quantity", "Per module", "Plant", "Unit", "Stream", "Formula / remark"], [52, 14, 14, 10, 9, 70])
P = "(p_out+1.01325)"  # bar abs


def psat(t):  # Antoine, water 1–100 °C, bar
    return f"(10^(8.07131-1730.63/(233.426+{t}))*0.00133322)"


bal = [
    "Electrical",
    ("ac", "AC power drawn", "=mH2_mod*SEC_AC/1000", "MW", "", "H2 × specific energy AC", True),
    ("dc", "DC power to stacks", "=P_DC", "MW", "", "", True),
    ("psu", "Transformer + rectifier losses", "=P_DC/eta_PSU-P_DC", "MW", "", "", True),
    ("bop", "Balance of plant (pumps, coolers, control, gas skid)", "={ac}-{dc}-{psu}", "MW", "", "remainder of the AC figure; check with Sunfire", True),
    ("secdc", "Specific energy DC", "=P_DC*1000/mH2_mod", "kWh/kg", "", "", False),
    ("effdc", "Efficiency DC (LHV)", "=LHV/{secdc}", "-", "", "datasheet: 67 % LHV DC", False),
    ("effac", "Efficiency AC (LHV)", "=LHV/SEC_AC", "-", "", "", False),
    ("margin", "Wind supply margin at full load (plant)", "=P_supply-{ac}*N_mod", "MW", "", "negative = plant cannot reach full load on wind alone", False),
    "Molar flows (stack, gross)",
    ("nh2", "H2 produced (Faraday)", "=mH2_mod/MW_H2", "kmol/h", "", "", True),
    ("no2", "O2 produced", "={nh2}/2", "kmol/h", "", "", True),
    ("nw", "Water split", "={nh2}", "kmol/h", "", "1 mol H2O per mol H2", True),
    ("a", "a = x_O2/(1−x_O2)", "=x_O2inH2/(1-x_O2inH2)", "-", "", "helper", False),
    ("b", "b = x_H2/(1−x_H2)", "=x_H2inO2/(1-x_H2inO2)", "-", "", "helper", False),
    ("h", "H2 leaving in H2 stream", "={nh2}*(1-{b}/2)/(1-{a}*{b})", "kmol/h", "301", "solves cross-over both ways", True),
    ("o2h", "O2 impurity in H2 stream", "={a}*{h}", "kmol/h", "301", "", True),
    ("o", "O2 leaving in O2 stream", "={no2}-{o2h}", "kmol/h", "401", "", True),
    ("h2o", "H2 impurity in O2 stream", "={b}*{o}", "kmol/h", "401", "lost to O2 vent", True),
    "Water vapour in the gases",
    ("psh", "Saturation pressure at stack temperature", "=" + psat("T_stack"), "bar", "", "Antoine", False),
    ("psc", "Saturation pressure at gas cooler outlet", "=" + psat("T_cool"), "bar", "", "", False),
    ("wh_hot", "Water in H2 at stack temperature", "={psh}/" + P + "/(1-{psh}/" + P + ")*({h}+{o2h})", "kmol/h", "301", "saturated", True),
    ("wh_c", "Water in H2 after gas cooler", "={psc}/" + P + "/(1-{psc}/" + P + ")*({h}+{o2h})", "kmol/h", "302", "", True),
    ("wo_hot", "Water in O2 at stack temperature", "={psh}/" + P + "/(1-{psh}/" + P + ")*({o}+{h2o})", "kmol/h", "401", "", True),
    ("wo_c", "Water in O2 after gas cooler", "={psc}/" + P + "/(1-{psc}/" + P + ")*({o}+{h2o})", "kmol/h", "402", "", True),
    ("ch", "Condensate H2 cooler → lye", "=({wh_hot}-{wh_c})*MW_H2O", "kg/h", "303", "returned to lye system (contains KOH)", True),
    ("co", "Condensate O2 cooler → lye", "=({wo_hot}-{wo_c})*MW_H2O", "kg/h", "403", "returned to lye system (contains KOH)", True),
    "Gas cleaning (de-oxo + dryer)",
    ("dxh", "H2 consumed in de-oxo", "=2*{o2h}*MW_H2", "kg/h", "", "2 H2 + O2 → 2 H2O", True),
    ("dxw", "Water formed in de-oxo", "=2*{o2h}*MW_H2O", "kg/h", "", "", True),
    ("dryw", "Water removed in de-oxo knock-out + dryer", "={dxw}+{wh_c}*MW_H2O", "kg/h", "305", "to drain", True),
    ("regen", "H2 lost in dryer regeneration", "=({h}*MW_H2-{dxh})*f_regen", "kg/h", "307", "", True),
    ("net", "Net dry H2 to buffer", "={h}*MW_H2-{dxh}-{regen}", "kg/h", "306", "Grade D-capable (< 5 ppm H2O)", True),
    ("netd", "Net dry H2 per day", "={net}*24/1000", "t/d", "", "", True),
    ("secnet", "Net specific energy AC", "={ac}*1000/{net}", "kWh/kg", "", "incl. gas-cleaning losses", False),
    "Water",
    ("mk", "Demin water make-up to lye", "=({nw}+{wh_c}+{wo_c})*MW_H2O", "kg/h", "108", "split + vapour leaving after the coolers", True),
    ("tap", "Tap water needed", "={mk}/(r_soft*r_RO*r_EDI)", "kg/h", "101", "", True),
    ("waste", "Waste water (softener + RO + EDI rejects)", "={tap}-{mk}", "kg/h", "103+105+107", "to sewer", True),
    ("tapkg", "Tap water per kg net H2", "={tap}/{net}", "kg/kg", "", "MTSA PEM: 13.06", False),
    ("tapy", "Tap water per year at 4,000 full-load hours (plant)", "={tap}*N_mod*4000/1000", "m³/y", "", "", False),
    "Mass balance check (lye system boundary)",
    ("min", "In: demin make-up", "={mk}", "kg/h", "", "", True),
    ("mouth", "Out: net H2 + regen loss + dryer water", "={net}+{regen}+{dryw}", "kg/h", "", "de-oxo O2 leaves as water in 305", True),
    ("mouto", "Out: O2 stream (O2 + H2 + water)", "={o}*MW_O2+{h2o}*MW_H2+{wo_c}*MW_H2O", "kg/h", "402", "", True),
    ("mclos", "Closure (in − out)", "={min}-{mouth}-{mouto}", "kg/h", "", "should be 0", True),
    "Heat",
    ("hhv", "H2 chemical energy (HHV, gross)", "=mH2_mod*HHV/1000", "MW", "", "", True),
    ("lhvnet", "H2 chemical energy (LHV, net product)", "={net}*LHV/1000", "MW", "", "", True),
    ("qst", "Stack heat (P_DC − H2·HHV)", "=P_DC-{hhv}", "MW", "", "thermoneutral method, as MTSA check", True),
    ("qfeed", "Feed-water heating to stack temperature", "={mk}*cp_w*(T_stack-T_feed)/3.6e6", "MW", "", "taken up by the lye", True),
    ("qevap", "Evaporation into the gases", "=({wh_hot}+{wo_hot})*MW_H2O*h_fg/3.6e6", "MW", "", "leaves via the gas coolers", True),
    ("qsens", "Sensible heat of gases 25 °C → stack T", "=({h}*MW_H2*cp_H2+{o}*MW_O2*cp_O2)*(T_stack-25)/3.6e6", "MW", "", "", True),
    ("qamb", "Heat loss to ambient", "={qst}*f_amb", "MW", "", "", True),
    ("qlye", "Lye cooler duty (cooling water)", "={qst}-{qfeed}-{qevap}-{qsens}-{qamb}", "MW", "501/502", "main heat sink; ~80 °C lye → heat recovery possible", True),
    ("qh2c", "H2 gas cooler duty", "=({h}*MW_H2*cp_H2*(T_stack-T_cool)+({wh_hot}-{wh_c})*MW_H2O*h_fg)/3.6e6", "MW", "503/504", "chilled glycol", True),
    ("qo2c", "O2 gas cooler duty", "=({o}*MW_O2*cp_O2*(T_stack-T_cool)+({wo_hot}-{wo_c})*MW_H2O*h_fg)/3.6e6", "MW", "503/504", "", True),
    ("qdx", "De-oxo reaction heat", "=2*{o2h}*dH_deoxo/3.6e6", "MW", "", "removed in de-oxo cooler E-311", True),
    ("qpsu", "Transformer + rectifier heat", "={psu}", "MW", "505", "air or water cooled", True),
    ("qtot", "Total heat rejection", "={qlye}+{qh2c}+{qo2c}+{qdx}+{qpsu}", "MW", "", "excl. BoP motor heat", True),
    "Cooling flows",
    ("fcw", "Cooling water, lye coolers", "={qlye}*1000/(cp_w*dT_CW)*3.6", "t/h", "501", "", True),
    ("fgly", "Chilled glycol, gas coolers + de-oxo", "=({qh2c}+{qo2c}+{qdx})*1000/(cp_w*0.95*dT_gly)*3.6", "t/h", "503", "10 % glycol ≈ 0.95 cp water", True),
    ("flye", "Lye circulation (sets stack ΔT)", "=({qst}-{qamb})*1000/(cp_lye*dT_lye)*3.6", "t/h", "201", "approx.", True),
    "Compression (optional)",
    ("wcomp", "Compressor shaft power", "=IF(p_end>p_buf,({net}/MW_H2/3600)*8.314*(T_suc+273.15)*k_H2/(k_H2-1)*n_stages*(((p_end+1.01325)/(p_buf+1.01325))^((k_H2-1)/(k_H2*n_stages))-1)/eta_comp,0)/1000", "MW", "601", "ideal gas, equal stage ratios", True),
    ("seccomp", "Compressor specific energy", "={wcomp}*1000/{net}", "kWh/kg", "", "", False),
]
ROW = {}
r = 5
for item in bal:
    if not isinstance(item, str):
        ROW[item[0]] = r
    r += 1


def ref(formula, col="B"):
    return re.sub(r"\{(\w+)\}", lambda m: f"{col}{ROW[m.group(1)]}", formula)


r = 5
for item in bal:
    if isinstance(item, str):
        put(wbal, f"A{r}", item, BOLD, fill=SUBFILL)
        for col in "BCDEF":
            put(wbal, f"{col}{r}", None, fill=SUBFILL)
        r += 1
        continue
    key, lab, f, unit, stream, note, scales = item
    fmt = "0.0%" if key in ("effdc", "effac") else ("0.0000" if unit in ("kmol/h", "bar", "-") else "#,##0.00")
    put(wbal, f"A{r}", lab)
    put(wbal, f"B{r}", ref(f), fmt=fmt, fill=RESULT)
    put(wbal, f"C{r}", f"=B{r}*N_mod" if scales else None, fmt=fmt, fill=RESULT if scales else None)
    put(wbal, f"D{r}", unit)
    put(wbal, f"E{r}", stream)
    put(wbal, f"F{r}", note, wrap=True)
    if key == "mclos":
        wbal[f"B{r}"].fill = WARN
    r += 1
put(wbal, f"A{r + 1}", "Notes", BOLD, border=False)
notes = [
    "• Full load, begin of life. At part load the DC specific energy drops but gas impurity (H2-in-O2) rises; at end of life "
    "the cell voltage rises (MTSA 2 MW EOL: 59.8 vs 53.0 kWh/kg) and with it the stack heat – size coolers on EOL.",
    "• The datasheet gives no stack temperature, lye flow, separator pressure, feed-water spec or BoP split: all are "
    "assumptions on the Inputs sheet. Replace them with Sunfire's process data when available.",
    "• Condensates from the gas coolers contain KOH and return to the lye loop – unlike MTSA, where O2-cooler condensate "
    "went back to the UPW break tank.",
    "• Energy: P_DC = H2·HHV + stack heat. Stack heat leaves via the lye cooler, gas coolers (evaporation + sensible), "
    "feed-water heating and ambient loss.",
]
for i, n in enumerate(notes):
    put(wbal, f"A{r + 2 + i}", n, GREY, border=False)
wbal.freeze_panes = "B5"


def B(key):  # plant value on Balance
    return f"Balance!C{ROW[key]}"


# ---------------------------------------------------------------- Streams
wst = wb.create_sheet("Streams")
put(wst, "A1", "Stream table, plant total (all modules), full load BOL", TITLE, border=False)
put(wst, "A2", "Mass flows in kg/h, linked to Balance. Streams 3xx/4xx per module = plant ÷ N_mod (water treatment, "
    "gas cleaning and storage are shared).", GREY, border=False)
header(wst, 4, ["Stream", "Description", "From", "To", "H2O kg/h", "H2 kg/h", "O2 kg/h", "Total kg/h", "T °C", "p barg"],
       [8, 40, 22, 26, 12, 12, 12, 12, 8, 8])
streams = [
    ("101", "Tap water in", "OSBL", "V-101 softener", f"={B('tap')}", 0, 0, "T_feed", 0.5),
    ("103+105+107", "Waste water (rejects)", "V-101 / S-103 / S-104", "Sewer", f"={B('waste')}", 0, 0, "T_feed", 0),
    ("108", "Demin make-up to modules", "T-105 / P-106", "Lye system (each module)", f"={B('mk')}", 0, 0, "T_feed", "=p_out+1"),
    ("301", "H2 + vapour from H2 separator", "V-2x1 H2 separator", "E-3x1 H2 cooler", f"={B('wh_hot')}*MW_H2O", f"={B('h')}*MW_H2", f"={B('o2h')}*MW_O2", "T_stack", "=p_out"),
    ("302", "H2 after cooler / knock-out", "V-3x2 knock-out", "Common header → R-310 de-oxo", f"={B('wh_c')}*MW_H2O", f"={B('h')}*MW_H2", f"={B('o2h')}*MW_O2", "T_cool", "=p_out"),
    ("303", "Condensate H2 cooler", "V-3x2", "Lye system", f"={B('ch')}", 0, 0, "T_cool", "=p_out"),
    ("304", "H2 after de-oxo", "R-310 de-oxo", "E-311 / V-312 / A-320 dryer", f"={B('wh_c')}*MW_H2O+{B('dxw')}", f"={B('h')}*MW_H2-{B('dxh')}", 0, "T_cool", "=p_out-1"),
    ("305", "Water removed (de-oxo KO + dryer)", "V-312 / A-320", "Drain", f"={B('dryw')}", 0, 0, "T_cool", 0),
    ("306", "Dry H2 to buffer", "A-320 TSA dryer → PCV-330", "V-401 buffer", 0, f"={B('net')}", 0, "T_cool", "=p_buf"),
    ("307", "Regeneration loss", "A-320", "Vent / recycle", 0, f"={B('regen')}", 0, "T_cool", 0),
    ("401", "O2 + vapour from O2 separator", "V-2x2 O2 separator", "E-4x1 O2 cooler", f"={B('wo_hot')}*MW_H2O", f"={B('h2o')}*MW_H2", f"={B('o')}*MW_O2", "T_stack", "=p_out"),
    ("402", "O2 after cooler (to vent / user)", "V-4x2 knock-out → PCV-430", "Vent stack or O2 user", f"={B('wo_c')}*MW_H2O", f"={B('h2o')}*MW_H2", f"={B('o')}*MW_O2", "T_cool", "=p_out"),
    ("403", "Condensate O2 cooler", "V-4x2", "Lye system", f"={B('co')}", 0, 0, "T_cool", "=p_out"),
]
r = 5
for sid, desc, frm, to, w, h, o, t, p in streams:
    put(wst, f"A{r}", sid, BOLD)
    put(wst, f"B{r}", desc)
    put(wst, f"C{r}", frm)
    put(wst, f"D{r}", to)
    for col, v in zip("EFG", (w, h, o)):
        put(wst, f"{col}{r}", v, fmt="#,##0.0", fill=RESULT)
    put(wst, f"H{r}", f"=E{r}+F{r}+G{r}", fmt="#,##0.0", fill=RESULT)
    put(wst, f"I{r}", f"={t}", fmt="0")
    put(wst, f"J{r}", p, fmt="0.0")
    r += 1
r += 1
header(wst, r, ["Stream", "Heat / cooling", "", "", "Flow", "Unit", "Duty", "Unit"])
r += 1
heat = [
    ("501/502", "Cooling water, lye coolers E-2x3", f"={B('fcw')}", "t/h", f"={B('qlye')}"),
    ("503/504", "Chilled glycol, gas coolers + de-oxo", f"={B('fgly')}", "t/h", f"={B('qh2c')}+{B('qo2c')}+{B('qdx')}"),
    ("505", "Transformer + rectifier cooling", None, "", f"={B('qpsu')}"),
    ("601", "Compressor shaft power (optional)", None, "", f"={B('wcomp')}"),
]
for sid, desc, flow, fu, duty in heat:
    put(wst, f"A{r}", sid, BOLD)
    put(wst, f"B{r}", desc)
    put(wst, f"E{r}", flow, fmt="#,##0.0", fill=RESULT if flow else None)
    put(wst, f"F{r}", fu)
    put(wst, f"G{r}", duty, fmt="#,##0.00", fill=RESULT)
    put(wst, f"H{r}", "MW")
    r += 1

# ---------------------------------------------------------------- Alkaline PFD equipment list
wa = wb.create_sheet("Alkaline PFD", 2)
put(wa, "A1", "Equipment list in process order: 4 × Sunfire HyLink Alkaline 22 (40 MW DC)", TITLE, border=False)
put(wa, "A2", "x = module number 1–4 (e.g. V-211 is the H2 separator of module 1). Scope: Sunfire = inside the 10 MW module "
    "per datasheet p. 2 (Power Supply Unit, Core Electrolysis Unit, Liquid & Gas skid, Fleet Control). BoP = your design.",
    GREY, border=False)
header(wa, 4, ["Step", "Tag", "Component", "Scope", "MTSA equivalent", "Change vs MTSA (PEM → pressurised alkaline)"],
       [6, 12, 40, 12, 22, 80])
alk = [
    "1. Power",
    (1, "TR-001", "MV grid / wind connection + main transformer(s)", "BoP", "W+B 11.510", "40 MW DC ≈ 41.8 MW AC: one 33 kV or 20 kV intake; size the transformer on AC power incl. BoP."),
    (2, "PSU-x", "Power Supply Unit (AC/DC rectifier) per module", "Sunfire", "MTSA 11.150", "Same function; 4 units, one per module."),
    "2. Feed water treatment (shared)",
    (3, "V-101", "Water softener", "BoP", "V-111", "Same."),
    (4, "T-102 / P-102", "Break tank + RO feed pump", "BoP", "T-121 / P-122", "Same."),
    (5, "S-103", "Reverse osmosis", "BoP", "S-123", "Same."),
    (6, "S-104", "EDI (optional)", "BoP", "S-124", "Alkaline needs demin water (typ. < 1–5 µS/cm), not 0.055 µS/cm UPW: EDI may be replaced by mixed bed or dropped – confirm Sunfire feed-water spec."),
    (7, "T-105 / P-106", "Demin water tank + make-up pumps (to 30+ barg)", "BoP", "T-151 / P-152", "Make-up must be pumped into a 30 barg lye system (MTSA only to 4.2 barg). No UPW polishing loop (S-161/S-221 dropped): KOH lye is not ion-exchanged."),
    "3. Electrolysis (per module, ×4)",
    (8, "T-107 / P-107", "KOH storage, lye make-up and drain tank", "BoP / Sunfire", "—", "New: 30 wt% KOH inventory for filling, top-up and draining the modules. Corrosive: bunded area."),
    (9, "A-2x0", "Core Electrolysis Unit: 2 × 5 MW pressurised alkaline stacks", "Sunfire", "A-231 / A-251", "Liquid electrolyte (KOH) on both sides instead of UPW on anode only. Both H2 and O2 leave at ~30 barg with entrained lye."),
    (10, "V-2x1", "H2 / lye separator", "Sunfire", "V-301", "Separates lye from H2. Lye returns to the common lye loop (not to an O2 vessel)."),
    (11, "V-2x2", "O2 / lye separator", "Sunfire", "V-201", "Separates lye from O2. Level balance between V-2x1 and V-2x2 is critical (gas cross-over) – Sunfire control."),
    (12, "P-2x3", "Lye circulation pump(s)", "Sunfire (liquid skid)", "P-211", "Circulates lye, mixed or separated anolyte/catholyte as per Sunfire."),
    (13, "E-2x3", "Lye cooler (temperature management)", "Sunfire (liquid skid)", "E-212", "Main heat sink, ~2 MW per module at BOL. Lye at ~80 °C: good for heat recovery / district heating."),
    (14, "S-2x4", "Lye filter", "Sunfire (liquid skid)", "S-213", "Same position: last before the stack."),
    "4. Hydrogen (per module, then common)",
    (15, "E-3x1 / V-3x2", "H2 gas cooler + knock-out / demister (lye mist)", "Sunfire (gas skid)", "A-341", "Now always needed (not optional): removes water and KOH mist. Condensate back to lye."),
    (16, "AT-3x3", "Gas quality analysis (O2 in H2, H2 in O2)", "Sunfire (gas skid)", "—", "New explicit item: safety interlock on H2-in-O2."),
    (17, "—", "Common H2 header (4 modules)", "BoP", "—", "Each module 30 barg → one header. Isolation + N2 purge per module."),
    (18, "R-310 / E-311 / V-312", "De-oxo reactor + cooler + knock-out", "BoP or Sunfire option", "A-321 (part)", "Needed for 99.998 % purity; datasheet says gas cleaning is optional/load dependent. One common unit for 800 kg/h or one per module."),
    (19, "A-320", "TSA dryer (2-bed)", "BoP or Sunfire option", "A-321 (part)", "After de-oxo. Order de-oxo → dryer is mandatory (de-oxo makes water)."),
    (20, "PCV-330", "Back-pressure control valve", "BoP", "PCV (H2)", "Keeps modules at 30 barg independent of buffer pressure."),
    "5. Storage and compression (depends on offtake)",
    (21, "V-401", "LP buffer vessel (~28 barg)", "BoP", "V-401", "Same function; lower pressure (28 vs 35–37 barg) → larger volume per kg."),
    (22, "K-411", "Compressor (optional)", "BoP", "A-411", "Only if offtake > 28 barg (tube trailers 300–500 bar, pipeline > 30 bar)."),
    (23, "V-421", "HP storage (optional)", "BoP", "V-421", "Same."),
    (24, "—", "H2 export metering + odorisation/pipeline (if any)", "BoP", "—", "Depends on mijnwindparknl offtake."),
    "6. Oxygen",
    (25, "E-4x1 / V-4x2", "O2 gas cooler + knock-out", "Sunfire (gas skid)", "E-202", "O2 now at 30 barg (MTSA 4 barg): valuable if sold; condensate (KOH) back to lye, not to feed-water tank."),
    (26, "PCV-430", "O2 back-pressure valve → vent stack / O2 user", "BoP", "PCV (O2)", "Same; vent far from H2 vent."),
    "7. Utilities",
    (27, "E-501 / P-501", "Cooling water system (dry coolers / cooling tower / heat pump)", "BoP", "OSBL cycle 1", "~8 MW heat rejection for 4 modules at BOL (see Balance)."),
    (28, "E-503 / P-503", "Chiller / glycol loop for gas coolers", "BoP", "E-351 / P-411", "Same concept, larger."),
    (29, "—", "Nitrogen (purge, inerting)", "BoP", "N2", "Larger: alkaline systems are typically N2-purged/pressurised at start-up."),
    (30, "—", "Instrument air", "BoP", "IA", "Same."),
    (31, "FCU", "Fleet Control Unit + plant PLC/EMS", "Sunfire + BoP", "MTSA 11.140", "Fleet Control dispatches the 4 modules on wind power (mijnwindparknl /opsplitsing logic)."),
]
r = table(wa, 5, alk)
wa.freeze_panes = "A5"

wb.move_sheet("Inputs", offset=-1)
OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print("wrote", OUT)
