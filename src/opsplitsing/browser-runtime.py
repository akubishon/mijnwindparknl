import json, os
from pathlib import Path
from datetime import date
from windprofiel import opsplitsing as model
class SerialPool:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def map(self, fn, jobs): return map(fn, jobs)
model.ProcessPoolExecutor = SerialPool
os.cpu_count = lambda: 1
model.available_years = lambda: [2022, 2023, 2024, 2025]
_supplies = {}
def supply_year(year):
    if year not in _supplies:
        _supplies[year] = json.loads(Path(f'/app/data/{year}.json').read_text())
    return _supplies[year]
model.supply_year = supply_year
def dispatch(path, body):
    if path.endswith('/aannames'): return model.meta_json()
    a = model.parse_aannames(body.get('aannames', {}))
    strategy = body.get('strategie', 'verdelen')
    counts = body.get('modules', model.MODULE_COUNTS)
    years = sorted(set(body.get('jaren', model.available_years())))
    if strategy not in model.STRATEGIES or not counts or any(type(n) is not int or not 1 <= n <= model.MAX_MODULES for n in counts):
        raise ValueError('Ongeldige besturing of moduleaantallen.')
    if not years or any(y not in model.available_years() for y in years): raise ValueError('Kies windjaren uit de lijst.')
    if path.endswith('/dag'): return model.day_trace(a, date.fromisoformat(body['datum']), counts, strategy)
    if path.endswith('/gevoeligheid'): return model.sensitivity(a, years, body['n'], strategy, workers=1)
    if path.endswith('/omslagkaart'): return model.omslagkaart(a, years, counts, strategy, workers=1)
    return model.run(a, years, counts, strategy, workers=1)
