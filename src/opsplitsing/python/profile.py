"""Rekenbasis zonder verzonnen metingen of vermogenscurves."""

from bisect import bisect_right
from datetime import date, datetime, time, timedelta, timezone
from math import isfinite
from zoneinfo import ZoneInfo

# Windpark Fryslân draait sinds november 2021 volledig.
FIRST_DAY = date(2021, 11, 1)


def today() -> date:
    return datetime.now(ZoneInfo("Europe/Amsterdam")).date()


def day_minutes(day: date) -> list[datetime]:
    """UTC-tijdstippen voor elke minuut van een Nederlandse kalenderdag, 1 november 2021 tot en met vandaag."""
    if not FIRST_DAY <= day <= today():
        raise ValueError("Kies een datum vanaf 1 november 2021 tot en met vandaag.")
    local = ZoneInfo("Europe/Amsterdam")
    start = datetime.combine(day, time(), local).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time(), local).astimezone(timezone.utc)
    return [start + timedelta(minutes=i) for i in range(int((end - start).total_seconds() / 60))]


def power_kw(speed: float, curve: list[tuple[float, float]], *, cut_out: float) -> float:
    """Interpoleer een aangeleverde curve; vermogen is nul vanaf cut-out.

    Curves moeten uit een gecontroleerde bron komen. Een enkele statische curve
    modelleert geen hysterese of stormregeling van de turbine.
    """
    if not isfinite(speed) or speed < 0:
        raise ValueError("Windsnelheid moet eindig en niet-negatief zijn.")
    if len(curve) < 2 or not isfinite(cut_out) or cut_out <= curve[-1][0]:
        raise ValueError("Een volledige curve en cut-out boven het laatste punt zijn vereist.")
    if any(not isfinite(v) or not isfinite(p) or v < 0 or p < 0 for v, p in curve):
        raise ValueError("Curvewaarden moeten eindig en niet-negatief zijn.")
    if any(a[0] >= b[0] for a, b in zip(curve, curve[1:])):
        raise ValueError("Curvesnelheden moeten strikt oplopen.")
    if curve[0][1] != 0:
        raise ValueError("De curve moet beginnen bij nul vermogen.")
    if speed < curve[0][0] or speed >= cut_out:
        return 0.0
    if speed >= curve[-1][0]:
        return curve[-1][1]
    index = bisect_right([v for v, _ in curve], speed)
    v0, p0 = curve[index - 1]
    v1, p1 = curve[index]
    return p0 + (p1 - p0) * (speed - v0) / (v1 - v0)


def combined_mw(first: list[float | None], second: list[float | None]) -> list[float | None]:
    """Som van uitgelijnde minuutreeksen; ontbrekende productie blijft ontbrekend."""
    if len(first) != len(second):
        raise ValueError("Beide parkreeksen moeten dezelfde tijdstappen hebben.")
    return [None if a is None or b is None else a + b for a, b in zip(first, second)]


def cubic_power_kw(speed: float, *, rated_kw: float = 4300, cut_in: float = 3,
                   rated_speed: float = 11.5, cut_out: float = 25) -> float:
    """Indicatief scenario, geen fabrikantcurve. Plateau inclusief cut-outgrens."""
    if not all(isfinite(v) for v in (speed, rated_kw, cut_in, rated_speed, cut_out)):
        raise ValueError("Modelwaarden moeten eindig zijn.")
    if speed < 0 or rated_kw <= 0 or not 0 <= cut_in < rated_speed < cut_out:
        raise ValueError("Ongeldige windsnelheid of modelgrenzen.")
    if speed < cut_in or speed > cut_out:
        return 0.0
    if speed >= rated_speed:
        return rated_kw
    return rated_kw * (speed**3 - cut_in**3) / (rated_speed**3 - cut_in**3)
