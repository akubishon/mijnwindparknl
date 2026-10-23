"""Gemeten dagproductie van Windpark Fryslân, 2022–2025.

Alleen voor vergelijking en weergave naast het model. Deze gegevens bepalen nergens de
wind, de hoogtevertaling of de modelopbrengst; `tests/test_productie_onafhankelijk.py`
controleert dat.

Bron: dagtotalen uit de app van Windpark Fryslân, opgehaald in oktober 2026 (één aanvraag
per maand, zie docs/databronnen.md). Kalenderdagen in Europe/Amsterdam; waarden in kWh,
afgerond op hele MWh. Zes dagen staan op 0; de oorzaak daarvan is niet bekend.
"""

import csv
from datetime import date
from pathlib import Path

PRODUCTION = Path(__file__).parent / "data" / "productie_fryslan.csv"
SOURCE = "Dagtotalen uit de app van Windpark Fryslân (opgehaald oktober 2026)"


def load(path: Path = PRODUCTION) -> dict[date, float]:
    """Gemeten productie per dag in MWh; lege waarden ontbreken, nul blijft nul."""
    with path.open(encoding="utf-8") as file:
        return {date.fromisoformat(row["datum"]): int(row["productie_kwh"]) / 1000
                for row in csv.DictReader(file) if row["productie_kwh"] not in ("", "None")}
