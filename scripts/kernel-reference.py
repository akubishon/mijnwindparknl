"""Reference results of the unchanged Python kernel for the JavaScript port (src/electrolyser-kernel.mjs).

Run from fryslan-webapp/ with CPython 3.12 or newer:
    python3 -I scripts/kernel-reference.py > tests/fixtures/elektrolyser-kern-python.json
"""
import json
import sys
import types
from dataclasses import asdict, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
package = types.ModuleType("windprofiel")
package.__path__ = [str(ROOT / "src/opsplitsing/python")]
sys.modules["windprofiel"] = package
sys.dont_write_bytecode = True
from windprofiel import opsplitsing as model  # noqa: E402

CASES = [
    ("10 x 4,4 MW verdelen", 2025, 10, {"minimumlast": 0.20}, "verdelen"),
    ("2 x 22 MW verdelen", 2025, 2, {"minimumlast": 0.20}, "verdelen"),
    ("10 x 4,4 MW samen", 2025, 10, {"minimumlast": 0.20}, "samen"),
    ("2 x 22 MW samen", 2025, 2, {"minimumlast": 0.20}, "samen"),
    ("4 modules bijschakelen", 2025, 4, {}, "bijschakelen"),
    ("alkaline schrikkeljaar", 2024, 3, {"capaciteit_mw": 30.0, **{k: v for k, v in asdict(model.TECHNOLOGIES["alkaline"][1]).items() if k != "capaciteit_mw"}}, "verdelen"),
    ("veel uitval", 2022, 5, {"capaciteit_mw": 12.0, "storingen_per_jaar": 6.0, "hersteltijd_uur": 100.0, "onderhoud_dagen": 20.0,
                              "startvertraging_min": 0.0}, "bijschakelen"),
    ("geen minimumlast", 2023, 7, {"capaciteit_mw": 40.0, "minimumlast": 0.0, "bop_vast": 0.0, "stackwissel_weken": 0.0}, "verdelen"),
]
KEYS = ["modules", "module_mw", "waterstof_t", "verbruik_mwh", "standby_mwh", "aanbod_mwh", "benutting", "bedrijfsuren_gem",
        "productie_uur", "starts_warm_per_module", "starts_koud_per_module", "eq_uren_per_module", "dekking_uur", "stackwissel_dagen"]


def main() -> None:
    supplies = {}
    out = {"python": sys.version.split()[0], "model_version": model.MODEL_VERSION, "cases": []}
    for name, year, n, changes, strategy in CASES:
        if year not in supplies:
            supplies[year] = json.loads((ROOT / f"src/opsplitsing/data/{year}.json").read_text())
        a = replace(model.Aannames(), **changes)
        result = model.simulate_with_replacements(supplies[year], n, a, strategy)
        out["cases"].append({"naam": name, "jaar": year, "modules": n, "strategie": strategy, "aannames": asdict(a),
                             "uitkomst": {key: result[key] for key in KEYS}})
    out["technologieen"] = {key: asdict(a) for key, (_, a) in model.TECHNOLOGIES.items()}
    json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
