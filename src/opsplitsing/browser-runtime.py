import json, os
from collections import OrderedDict
from pathlib import Path
from datetime import date
from windprofiel import opsplitsing as model
class SerialPool:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def map(self, fn, jobs): return map(fn, jobs)
# capaciteit_mw is stackvermogen; de BoP (standaard 3 % vast + 7 % variabel) komt erbovenop, zoals in het Python-model.
# 17: BoP weer bovenop het stackvermogen (13–16 rekenden in de browser met BoP 0).
model.MODEL_VERSION = 17
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
# Simulatiecache. Elke simulatie is één model._job((aanbod, n, aannames, besturing)); de kosten (stroomprijs, rente, offerte, ...)
# worden pas daarna in summarise/break_even toegepast. De uitkomst van een job hangt dus alleen af van het aanbod, n, de besturing en
# de aannames die simulate() leest. Verandert alleen een kostenaanname, dan is de simulatie een cachetreffer en kost Bereken vrijwel niets.
# Ook de basisrun van de gevoeligheid en de omslagkaartrij met de huidige minimumlast zijn dezelfde jobs als in Bereken.
# Deze lijst is niet met de hand opgesteld maar afgeleid: tests/opsplitsing-simcache.test.mjs draait het model met een Aannames-proxy die
# elke attribuuttoegang logt en faalt zodra simulate() een ander veld leest. Volgorde van Aannames.
SIMULATION_FIELDS = ('capaciteit_mw', 'minimumlast', 'systeemverbruik_vol', 'deellastvoordeel', 'faradayverlies_10', 'bop_vast', 'bop_variabel',
                     'degradatie_jaar', 'degradatie_jaren', 'min_aan_min', 'min_uit_min', 'startvertraging_min', 'standby', 'koud_na_uur',
                     'opstart_warm_min', 'opstart_koud_min', 'onderhoud_dagen', 'storingen_per_jaar', 'hersteltijd_uur',
                     'stack_levensduur_uur', 'stackwissel_weken')
# Eén uitkomst (incl. 'dagen', 365 dagen) is zo'n 70 kB (gemeten in CPython 64-bit); 1000 uitkomsten is dus ongeveer 70 MB, ver onder
# de ~300 MB die een tabblad aankan naast de windreeksen. Op de standaardinstelling (4 jaren, 10 configuraties) is Bereken 40 jobs,
# de gevoeligheid 120 en de omslagkaart 200: een hele sessie past erin. Wie veel varieert, verliest alleen de oudste jobs.
SIM_MEMO_LIMIT = 1000
class SimulationMemo:
    """LRU in het geheugen van deze worker rond model._job. De uitkomsten worden gedeeld: summarise, break_even en example_day
    muteren ze niet (zie de test), dus een kopie is niet nodig."""
    def __init__(self, job, limit=SIM_MEMO_LIMIT):
        self.job, self.limit = job, limit
        self.entries = OrderedDict()
        self.signatures = {}
        self.hits = self.misses = 0
    def signature(self, supply):
        # Zelfde controlesom van de aanbodreeks als de bestandscache van het model (supply_key); eenmaal per aanbod, want de reeks is groot.
        known = self.signatures.get(id(supply))
        if known is None:   # de verwijzing naar `supply` houdt het object, en dus zijn id, in leven
            known = self.signatures[id(supply)] = (supply, (supply['jaar'], *model.supply_key({supply['jaar']: supply})[0]))
        return known[1]
    def key(self, args):
        supply, n, a, strategy = args
        return (model.MODEL_VERSION, self.signature(supply), n, strategy, tuple(getattr(a, name) for name in SIMULATION_FIELDS))
    def __call__(self, args):
        key = self.key(args)
        if key in self.entries:
            self.hits += 1
            self.entries.move_to_end(key)
            return self.entries[key]
        self.misses += 1
        result = self.entries[key] = self.job(args)
        if len(self.entries) > self.limit: self.entries.popitem(last=False)
        return result
    def clear(self):
        self.entries.clear()
        self.hits = self.misses = 0
SIM_MEMO = model._job = SimulationMemo(model._job)
def sim_cache_stats(): return {'hits': SIM_MEMO.hits, 'misses': SIM_MEMO.misses, 'jobs': len(SIM_MEMO.entries)}
def dispatch(path, body):
    if path.endswith('/aannames'):
        meta = model.meta_json()
        for group in meta['groepen']:
            for field in group['velden']:
                if field['key'] == 'capaciteit_mw':
                    field['uitleg'] = ('Totaal stackvermogen, opgesplitst over N gelijke modules. De BoP (standaard 10 %) komt erbij in de berekening: '
                                       '44 MW stack neemt bij vollast 48,4 MW op, uit maximaal 48,7 MW aanbod.')
        return meta
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
