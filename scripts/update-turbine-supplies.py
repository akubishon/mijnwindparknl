"""Recompute bundled wind power from retained observations and current turbine curves.

Run from the project root: python3 scripts/update-turbine-supplies.py
No observations, station choices, height factors or production readings are changed.
"""
import json
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
package = types.ModuleType('windprofiel')
package.__path__ = [str(ROOT / 'src/opsplitsing/python')]
sys.modules['windprofiel'] = package
from windprofiel import opsplitsing, windbron  # noqa: E402
from windprofiel.application import HYDROGEN_SHARE, load_curve  # noqa: E402

curves = {key: load_curve(key) for key in HYDROGEN_SHARE}
for path in sorted((ROOT / 'src/opsplitsing/data').glob('20??.json')):
    data = json.loads(path.read_text())
    if data['methode'] != 'onafhankelijk':
        raise ValueError(f'{path}: expected production-independent wind observations')
    moments = [datetime.fromtimestamp(t, timezone.utc) for t in data['t']]
    if any(len(data['v10'][key]) != len(moments) for key in curves):
        raise ValueError(f'{path}: inconsistent time axis')
    parks = {key: [opsplitsing.park_mw(key, v, t, curves[key], windbron.METHODS['onafhankelijk'][key])
                   for t, v in zip(moments, data['v10'][key])] for key in curves}
    data['mw'] = [round(sum(HYDROGEN_SHARE[key] * parks[key][i] for key in curves), 4)
                  for i in range(len(moments))]
    data['park_mwh'] = {key: sum(values) / 6 for key, values in parks.items()}
    data['turbine_curves'] = {key: {k: v for k, v in curve.items() if k != 'points'}
                              for key, curve in curves.items()}
    path.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(f'{data["jaar"]}: {len(moments)} intervals, {sum(data["mw"]) / 6:.2f} MWh')
