import json, os
from pathlib import Path
from datetime import date
from windprofiel import opsplitsing as model
class SerialPool:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def map(self, fn, jobs): return map(fn, jobs)
# This page uses total system power: BoP is already included in the 44 MW.
model.MODEL_VERSION = 14
model.SENSITIVE_OPERATION = [key for key in model.SENSITIVE_OPERATION if not key.startswith('bop_')]
model.ProcessPoolExecutor = SerialPool
os.cpu_count = lambda: 1
model.available_years = lambda: [2022, 2023, 2024, 2025]
_supplies = {}
def supply_year(year, client=None, method='onafhankelijk'):
    # Meegeleverde jaarreeksen zijn met de standaard windmethode berekend; de oude methoden draaien alleen lokaal.
    if method != 'onafhankelijk':
        raise ValueError('In de browser is alleen de standaard windmethode beschikbaar.')
    if year not in _supplies:
        _supplies[year] = json.loads(Path(f'/app/data/{year}.json').read_text())
    return _supplies[year]
model.supply_year = supply_year
def dispatch(path, body):
    if path.endswith('/aannames'):
        meta = model.meta_json()
        for group in meta['groepen']:
            group['velden'] = [field for field in group['velden'] if not field['key'].startswith('bop_')]
            for field in group['velden']:
                if field['key'] == 'capaciteit_mw':
                    field['uitleg'] = 'Totaal systeemvermogen inclusief BoP, opgesplitst over N gelijke modules. BoP wordt niet nogmaals toegevoegd.'
        for technology in meta['technologieen'].values():
            technology['waarden'].update(bop_vast=0, bop_variabel=0)
        return meta
    # Also override old stored scenarios and explicit request values.
    a = model.parse_aannames({**body.get('aannames', {}), 'bop_vast': 0, 'bop_variabel': 0})
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
