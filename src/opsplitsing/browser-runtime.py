import json, os
from collections import OrderedDict
from pathlib import Path
from datetime import date
from windprofiel import opsplitsing as model
class SerialPool:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def map(self, fn, jobs): return tracked_map(fn, list(jobs))
# capaciteit_mw is stackvermogen; de BoP (standaard 3 % vast + 7 % variabel) komt erbovenop, zoals in het Python-model.
# 17: BoP weer bovenop het stackvermogen (13–16 rekenden in de browser met BoP 0).
model.MODEL_VERSION = 17
model.ProcessPoolExecutor = SerialPool
os.cpu_count = lambda: 1
model.available_years = lambda: [2022, 2023, 2024, 2025]
_supplies = {}
def supply_year(year, client=None, method='onafhankelijk'):
    # Meegeleverd is de standaardreeks; andere windprofielen en parkkeuzes worden daaruit afgeleid (wind_supply hieronder).
    if year not in _supplies:
        _supplies[year] = json.loads(Path(f'/app/data/{year}.json').read_text())
    return wind_supply(_supplies[year], method, WIND['parken'])
model.supply_year = supply_year
# ---------------------------------------------------------------- windprofiel en windparken
# De bundel bevat per tien minuten ook de stationswind (stations.houtribdijk/stavoren). De andere windprofielen worden daaruit
# afgeleid met dezelfde stappen als supply_year() in het model: windbron.select en model.park_mw. In de bundel zitten alleen
# momenten waarop beide stations meten; voor 'productie_hoogste' ontbreken dus de momenten met één station.
from array import array
from datetime import datetime, time, timedelta, timezone
from windprofiel import windbron, productie
from windprofiel.application import PARKS, HYDROGEN_SHARE, load_curve
SCALED = 'gemeten_dagproductie'
windbron.METHODS[SCALED] = windbron.METHODS[windbron.DEFAULT]   # zelfde wind; daarna Fryslân per dag geschaald
windbron.LABELS[SCALED] = ('Geschaald naar gemeten dagproductie: de modelvorm van Windpark Fryslân, per kalenderdag gelijk aan de '
                           'gemeten dagproductie en begrensd op het parkvermogen; Beabuorren blijft gemodelleerd')
PROFILE_NAMES = {'onafhankelijk': 'Productie-onafhankelijk (standaard)', 'productie_houtribdijk': 'Oud dagprofiel: Houtribdijk',
                 'productie_hoogste': 'Oude opsplitsing: hoogste station', SCALED: 'Geschaald naar gemeten dagproductie'}
PROFILE_NOTES = {'productie_hoogste': 'Alleen momenten waarop beide stations meten; de oorspronkelijke reeks nam ook momenten met één station mee.',
                 SCALED: 'Dagen zonder meting vallen weg. Beabuorren heeft geen productiemetingen en blijft gemodelleerd.'}
ALL_PARKS = tuple(PARKS)
FRYSLAN_CAP_MW = PARKS['fryslan']['count'] * PARKS['fryslan']['rated_kw'] / 1000
WIND = {'parken': ALL_PARKS}   # parkkeuze van het lopende verzoek; de worker rekent één verzoek tegelijk
def wind_choice(body):
    """Windprofiel en windparken uit een verzoek; zonder deze velden (oude scenario's) de standaard."""
    profile, parks = body.get('windprofiel', windbron.DEFAULT), body.get('parken', list(ALL_PARKS))
    if not isinstance(profile, str) or profile not in windbron.METHODS:
        raise ValueError('Onbekend windprofiel. Kies: ' + ', '.join(PROFILE_NAMES.values()) + '.')
    if not isinstance(parks, list) or not parks or any(not isinstance(p, str) or p not in PARKS for p in parks):
        raise ValueError('Kies minstens één windpark: Windpark Fryslân, Windpark Beabuorren of beide.')
    return profile, tuple(p for p in ALL_PARKS if p in parks)
def wind_meta():
    return {'standaard': windbron.DEFAULT, 'profielen': {key: {'naam': PROFILE_NAMES[key], 'uitleg': windbron.LABELS[key],
                                                            'let_op': PROFILE_NOTES.get(key, '')} for key in windbron.METHODS},
            'parken': {key: {'naam': PARKS[key]['name'], 'aandeel': HYDROGEN_SHARE[key],
                             'mw': round(PARKS[key]['count'] * PARKS[key]['rated_kw'] / 1000 * HYDROGEN_SHARE[key], 1)} for key in PARKS}}
_meta_json = model.meta_json
model.meta_json = lambda: {**_meta_json(), 'windkeuze': wind_meta()}
_series, _derived = {}, {}
def day_hours(day):
    start = datetime.combine(day, time(), model.LOCAL)
    return (datetime.combine(day + timedelta(days=1), time(), model.LOCAL).timestamp() - start.timestamp()) / 3600
def park_series(base, profile):
    """Gemodelleerd vermogen (MW) per park en moment voor dit profiel, met stationswind en bron; eenmaal per jaar en profiel."""
    known = _series.get((base['jaar'], profile))
    if known and known[0] is base: return known[1]
    methods, curves = windbron.method(profile), {p: load_curve(p) for p in PARKS}
    keep, v10, source, power = [], {p: [] for p in PARKS}, [], {p: array('d') for p in PARKS}
    for i, stamp in enumerate(base['t']):
        values = {key: base['stations'][key][i] for key in base['stations']}
        picked = {p: windbron.select(methods[p], values) for p in PARKS}
        if any(v is None for v, _ in picked.values()): continue   # zoals supply_year: beide parken moeten wind hebben
        moment = datetime.fromtimestamp(stamp, timezone.utc)
        keep.append(i)
        source.append(picked['fryslan'][1])
        for p in PARKS:
            v10[p].append(picked[p][0])
            power[p].append(model.park_mw(p, picked[p][0], moment, curves[p], methods[p]))
    series = {'keep': keep, 'v10': v10, 'bron': source, 'mw': power, 'dagfactor': None}
    if profile == SCALED: scale_to_production(base, series)
    _series[(base['jaar'], profile)] = (base, series)
    return series
def scale_to_production(base, series):
    """Fryslân per kalenderdag (Europe/Amsterdam) naar de gemeten dagproductie, begrensd op het parkvermogen.

    Het gemiddelde vermogen over de aanwezige tienminutenmomenten wordt gelijk aan gemeten MWh / uren van de dag; zonder meetgaten
    is de dagopbrengst dus precies de meting. Dagen zonder meting (of zonder modelopbrengst om te schalen) vallen weg, ze tellen
    nooit als nul; de omrekening naar 8.760 uur in simulate() vult ze met het jaargemiddelde."""
    measured, days = productie.load(), {}
    stamps = [base['t'][i] for i in series['keep']]
    for stamp, value in zip(stamps, series['mw']['fryslan']):
        entry = days.setdefault(datetime.fromtimestamp(stamp, model.LOCAL).date(), [0.0, 0])
        entry[0] += value
        entry[1] += 1
    factors = {day: measured[day] * n / (day_hours(day) * total) for day, (total, n) in days.items() if day in measured and total > 0}
    scaled, kept = array('d'), []
    for j, (stamp, value) in enumerate(zip(stamps, series['mw']['fryslan'])):
        factor = factors.get(datetime.fromtimestamp(stamp, model.LOCAL).date())
        if factor is None: continue
        kept.append(j)
        scaled.append(min(FRYSLAN_CAP_MW, value * factor))
    series['keep'] = [series['keep'][j] for j in kept]
    series['v10'] = {p: [values[j] for j in kept] for p, values in series['v10'].items()}
    series['bron'] = [series['bron'][j] for j in kept]
    series['mw'] = {'fryslan': scaled, 'beabuorren': array('d', (series['mw']['beabuorren'][j] for j in kept))}
    series['dagfactor'] = {day.isoformat(): factor for day, factor in factors.items()}
def wind_supply(base, profile, parks):
    """Aanbod voor dit windprofiel en deze parken. De standaard is de meegeleverde reeks zelf, ongewijzigd."""
    if profile == windbron.DEFAULT and parks == ALL_PARKS: return base
    known = _derived.get((base['jaar'], profile, parks))
    if known and known[0] is base: return known[1]
    series = park_series(base, profile)
    mw = []
    for i in range(len(series['keep'])):
        total = 0.0
        for p in parks: total += HYDROGEN_SHARE[p] * series['mw'][p][i]
        mw.append(round(total, 4))
    full = len(series['keep']) == len(base['t'])
    supply = {'jaar': base['jaar'], 'mw': mw, 'v10': series['v10'], 'bron': series['bron'],
              # De methode staat in supply_key en dus in elke cachesleutel: profiel én parken.
              'methode': profile if parks == ALL_PARKS else profile + ':' + '+'.join(parks),
              't': base['t'] if full else [base['t'][i] for i in series['keep']],
              'stations': base['stations'] if full else {k: [v[i] for i in series['keep']] for k, v in base['stations'].items()},
              'park_mwh': {p: sum(series['mw'][p]) * model.STEP_H for p in parks}, 'dagfactor': series['dagfactor']}
    _derived[(base['jaar'], profile, parks)] = (base, supply)
    return supply
def measured_mwh(year):
    """Gemeten productie van heel Windpark Fryslân in dit jaar, omgerekend naar 8.760 uur zoals het model."""
    days = {day: value for day, value in productie.load().items() if day.year == year}
    hours = sum(day_hours(day) for day in days)
    return sum(days.values()) * 8760 / hours if hours else None
# Zonder waterstof geen kostprijs (economics() geeft dan None) en daarmee geen vergelijking. Dat gebeurt als het gekozen aanbod nooit
# boven de minimumlast komt, bijvoorbeeld alleen Beabuorren (10,4 MW) met één module van 44 MW. Dan een duidelijke melding.
def no_hydrogen(counts):
    names = ', '.join(map(str, counts[:-1])) + ' en ' + str(counts[-1]) if len(counts) > 1 else str(counts[0])
    return ValueError(f"Met dit aanbod {'maakt 1 module' if counts == [1] else f'maken {names} modules'} geen waterstof: het aanbod komt "
                      "nooit boven de minimumlast. Kies andere moduleaantallen, een lagere minimumlast of meer windparken.")
_break_even, _sensitivity = model.break_even, model.sensitivity
def break_even(rows, a):
    empty = [row['modules'] for row in rows if row['waterstof_t'] <= 0]
    if empty: raise no_hydrogen(empty)
    return _break_even(rows, a)
def sensitivity(*args, **kwargs):
    try: return _sensitivity(*args, **kwargs)
    except TypeError: raise no_hydrogen([1]) from None   # het voordeel tegenover 1 module: een kostprijs ontbreekt
model.break_even, model.sensitivity = break_even, sensitivity
def run_wind(data, profile, parks):
    data.update(windprofiel=profile, parken=list(parks))
    if 'fryslan' in parks:
        for year, supply in data['aanbod'].items():
            if 'fryslan' in supply['parken']: supply['parken']['fryslan']['gemeten_mwh'] = measured_mwh(int(year))
    return data
def trace_wind(data, profile, parks, day):
    """Dagspoor volgens de keuze: alleen de gekozen parken, en bij het geschaalde profiel de dagfactor voor Fryslân."""
    data.update(windprofiel=profile, parken={p: data['parken'][p] for p in parks}, aandeel={p: HYDROGEN_SHARE[p] for p in parks})
    factors = supply_year(day.year, method=profile).get('dagfactor')
    if factors and 'fryslan' in parks:
        steps, curve, pm = next(iter(data['configuraties'].values()))['stappen'], load_curve('fryslan'), windbron.method(profile)['fryslan']
        for wind, step in zip(data['wind'], steps):
            factor, park = factors[datetime.fromtimestamp(step['t'], model.LOCAL).date().isoformat()], wind['fryslan']
            raw = model.park_mw('fryslan', park['v10'], datetime.fromtimestamp(step['t'], timezone.utc), curve, pm)
            park.update(dagfactor=round(factor, 4), mw_aanbod=round(min(FRYSLAN_CAP_MW, raw * factor), 3))
    return data
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
# Voortgang. run(), sensitivity() en omslagkaart() rekenen hun jobs via SerialPool.map; elke job is één simulatie (windjaar, aantal
# modules, besturing). Na elke job gaat er een bericht naar progress_sink: de worker zet daar een JS-functie die het meteen naar de
# pagina post, ook terwijl runPython nog rekent. Een cachetreffer is direct klaar; te_rekenen telt alleen de jobs die echt
# gesimuleerd worden, zodat de pagina de resttijd kan schatten. jaar en modules horen bij de job die nu rekent.
# Een job met n modules kost ongeveer n + 3 eenheden rekentijd (gemeten in Chromium: 1,4 s bij 1 module, 3,3 s bij 6, 5,5 s bij 12);
# werk en te_werken tellen die eenheden voor de gesimuleerde jobs, want 12 modules duren bijna vier keer zo lang als 1.
progress_sink = None
def report_progress(**message):
    if progress_sink is not None: progress_sink(json.dumps(message))
def job_work(n): return n + 3
def tracked_map(fn, jobs):
    memo = fn if isinstance(fn, SimulationMemo) else None
    todo = [key[2] for key in set(map(memo.key, jobs)) if key not in memo.entries] if memo else [args[1] for args in jobs]
    done = computed = work = 0
    def report():
        upcoming = jobs[done] if done < len(jobs) else None
        report_progress(fase='simulaties', klaar=done, totaal=len(jobs), gerekend=computed, te_rekenen=max(len(todo), computed),
                        werk=work, te_werken=max(sum(map(job_work, todo)), work),
                        jaar=upcoming[0]['jaar'] if upcoming else None, modules=upcoming[1] if upcoming else None)
    report()
    for args in jobs:
        misses = memo.misses if memo else 0
        result = fn(args)
        done += 1
        if memo is None or memo.misses > misses:
            computed += 1
            work += job_work(args[1])
        report()
        yield result
    report_progress(fase='samenvatten')
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
    profile, WIND['parken'] = wind_choice(body)
    if path.endswith('/dag'):
        day = date.fromisoformat(body['datum'])
        return trace_wind(model.day_trace(a, day, counts, strategy, method=profile), profile, WIND['parken'], day)
    if path.endswith('/gevoeligheid'): return model.sensitivity(a, years, body['n'], strategy, workers=1, method=profile)
    if path.endswith('/omslagkaart'): return model.omslagkaart(a, years, counts, strategy, workers=1, method=profile)
    return run_wind(model.run(a, years, counts, strategy, workers=1, method=profile), profile, WIND['parken'])
