"""Hulp voor tests/opsplitsing-simcache.test.mjs; draait in Pyodide, in de namespace van browser-runtime.py.

Alles hier is meetwerk om de simulatiecache te toetsen; niets ervan gaat mee in de browserbundel.
"""
import copy
import json
import sys
from dataclasses import asdict, fields, replace

FIELD_NAMES = [f.name for f in fields(model.Aannames)]
FULL_SUPPLY = json.loads(Path('/app/data/2025.json').read_text())
WINDOW = (1000, 2500)   # 25 % laag, 62 % deellast, 12 % vol: alle takken van de simulatie komen voor, in een paar tienden seconde


def window_supply(start=WINDOW[0], stop=WINDOW[1]):
    return {**FULL_SUPPLY, 't': FULL_SUPPLY['t'][start:stop], 'mw': FULL_SUPPLY['mw'][start:stop]}


class LoggedAannames(model.Aannames):
    """Aannames die elke leestoegang tot een veld logt."""
    reads = set()

    def __getattribute__(self, name):
        if name == '__dict__':
            LoggedAannames.reads.update(FIELD_NAMES)     # vars(a) leest alles
        elif name in FIELD_NAMES:
            caller = sys._getframe(1)
            # dataclasses.replace() kopieert alle velden naar het nieuwe object; dat is geen gebruik door het model.
            # Andere dataclasses-functies (asdict, astuple) tellen wel mee, net als een gegenereerde __hash__ of __eq__.
            if not (caller.f_globals.get('__name__') == 'dataclasses' and caller.f_code.co_name in ('replace', '_replace')):
                LoggedAannames.reads.add(name)
        return super().__getattribute__(name)


def logged(base):
    return LoggedAannames(**{name: getattr(base, name) for name in FIELD_NAMES})


# Beginwaarden waarbij takken van het model anders lopen: andere technologie, geen uitval, geen minimumlast of BoP.
VARIANTS = {
    'pem': model.Aannames(),
    'alkaline_hoog': model.TECHNOLOGIES['alkaline_hoog'][1],
    'zonder uitval': replace(model.Aannames(), stackwissel_weken=0.0, storingen_per_jaar=0.0, onderhoud_dagen=0.0),
    'zonder minimumlast': replace(model.Aannames(), minimumlast=0.0, bop_vast=0.0, bop_variabel=0.0, standby=0.0, koud_na_uur=0.0,
                                  min_aan_min=0.0, min_uit_min=0.0, startvertraging_min=0.0),
}


def probe(counts=(1, 2, 4, 10)):
    """Welke velden leest model._job (het origineel, zonder cache)? Standaard voor elke besturing en elk aantal modules, de andere
    beginwaarden voor 1 en 4 modules."""
    supply = window_supply()
    union, per_run = set(), {}
    for label, base in VARIANTS.items():
        for strategy in model.STRATEGIES:
            for n in (counts if label == 'pem' else (1, 4)):
                LoggedAannames.reads = set()
                SIM_MEMO.job((supply, n, logged(base), strategy))
                per_run[f'{label} / {strategy} / {n}'] = sorted(LoggedAannames.reads)
                union |= LoggedAannames.reads
    # Eén volledig jaar, voor het geval een tak pas in het jaarverloop wordt bereikt.
    LoggedAannames.reads = set()
    SIM_MEMO.job((FULL_SUPPLY, 4, logged(model.Aannames()), 'verdelen'))
    full_year = sorted(LoggedAannames.reads)
    union |= LoggedAannames.reads
    return {'velden': FIELD_NAMES, 'gelezen': sorted(union), 'per_run': per_run, 'jaar': full_year}


def unread_fields_change_nothing():
    """Zelfde uitkomst als een veld dat de simulatie niet leest een andere waarde krijgt? Geeft de velden die dat niet doen."""
    supply = window_supply()
    unread = [name for name in FIELD_NAMES if name not in SIMULATION_FIELDS]
    differing = []
    for strategy, n in (('verdelen', 4), ('samen', 2)):
        reference = SIM_MEMO.job((supply, n, model.Aannames(), strategy))
        for name in unread:
            changed = replace(model.Aannames(), **{name: getattr(model.Aannames(), name) * 1.37 + 0.5})
            if SIM_MEMO.job((supply, n, changed, strategy)) != reference:
                differing.append(name)
    return {'ongelezen': unread, 'verschillend': sorted(set(differing))}


def key_sensitivity():
    """Welke veldwijzigingen veranderen de cachesleutel? Kostenvelden niet, simulatievelden wel."""
    supply = window_supply()
    base = model.Aannames()
    reference = SIM_MEMO.key((supply, 4, base, 'verdelen'))
    changed = {name: SIM_MEMO.key((supply, 4, replace(base, **{name: getattr(base, name) * 1.37 + 0.5}), 'verdelen')) != reference
               for name in FIELD_NAMES}
    other = {
        'n': SIM_MEMO.key((supply, 5, base, 'verdelen')) != reference,
        'besturing': SIM_MEMO.key((supply, 4, base, 'samen')) != reference,
        'jaar': SIM_MEMO.key(({**supply, 'jaar': 2024}, 4, base, 'verdelen')) != reference,
        'aanbod': SIM_MEMO.key((window_supply(1100, 2600), 4, base, 'verdelen')) != reference,
        'modelversie': None,
    }
    version = model.MODEL_VERSION
    model.MODEL_VERSION = version + 1
    other['modelversie'] = SIM_MEMO.key((supply, 4, base, 'verdelen')) != reference
    model.MODEL_VERSION = version
    return {'velden': changed, 'overig': other}


def memo_behaviour():
    """Treffers, missers en gedeelde uitkomsten van de geïnstalleerde cache."""
    supply = window_supply()
    SIM_MEMO.clear()
    args = (supply, 4, model.Aannames(), 'verdelen')
    first = SIM_MEMO(args)
    again = SIM_MEMO(args)
    cost_only = SIM_MEMO((supply, 4, replace(model.Aannames(), stroomprijs_eur_mwh=140.0, rente=0.09), 'verdelen'))
    after_cost = sim_cache_stats()
    operation = SIM_MEMO((supply, 4, replace(model.Aannames(), minimumlast=0.3), 'verdelen'))
    return {
        'zelfde_object': first is again and first is cost_only,
        'gelijk_aan_origineel': first == SIM_MEMO.job(args),
        'na_kosten': after_cost,
        'minimumlast_anders': operation != first,
        'na_minimumlast': sim_cache_stats(),
    }


def lru_behaviour():
    calls = []

    def job(args):
        calls.append(args)
        if args == 'fout': raise RuntimeError('mislukt')
        return {'uitkomst': args}

    memo = SimulationMemo(job, limit=2)
    memo.key = lambda args: args    # de sleutel is hier de job zelf
    memo('a'); memo('b'); memo('a')         # a is nu recenter dan b
    memo('c')                               # verdrijft b, niet a
    order = list(memo.entries)
    memo('a'); memo('b')                    # a is een treffer, b opnieuw berekend (verdrijft c)
    try:
        memo('fout')
    except RuntimeError:
        pass
    return {'volgorde': order, 'aanroepen': calls, 'na': list(memo.entries), 'treffers': memo.hits, 'missers': memo.misses}


def strip_timing(value):
    return {k: v for k, v in value.items() if k not in ('rekentijd_s', 'uit_cache', 'eerste_rekentijd_s')}


def clear_file_cache():
    import shutil
    shutil.rmtree(model.CACHE, ignore_errors=True)


def pipeline(years=(2025,), counts=(1, 2, 4)):
    """Bereken met andere kosten, gevoeligheid en omslagkaart via dispatch; telt de treffers; controleert dat de gedeelde uitkomsten
    ongewijzigd bleven en dat een koude run (lege cache) dezelfde JSON geeft."""
    _supplies.clear()
    _supplies[2025] = window_supply()
    body = {'jaren': list(years), 'modules': list(counts)}
    cost = {'aannames': {'stroomprijs_eur_mwh': 120, 'rente': 8}}
    out = {}
    SIM_MEMO.clear()
    clear_file_cache()
    out['bereken'] = strip_timing(dispatch('/api/opsplitsing', body))
    out['na_bereken'] = sim_cache_stats()
    out['bereken_kosten'] = strip_timing(dispatch('/api/opsplitsing', {**body, **cost}))
    out['na_kosten'] = sim_cache_stats()
    before = sim_cache_stats()
    out['gevoeligheid'] = dispatch('/api/opsplitsing/gevoeligheid', {**body, 'n': 4})
    after = sim_cache_stats()
    out['gevoeligheid_stats'] = {'treffers': after['hits'] - before['hits'], 'missers': after['misses'] - before['misses']}
    before = after
    out['omslagkaart'] = dispatch('/api/opsplitsing/omslagkaart', body)
    after = sim_cache_stats()
    out['omslag_stats'] = {'treffers': after['hits'] - before['hits'], 'missers': after['misses'] - before['misses']}
    # Gedeelde uitkomsten mogen door summarise/break_even/example_day niet veranderd zijn.
    mutated = [key for key, value in SIM_MEMO.entries.items()
               if value != SIM_MEMO.job((_supplies[2025], key[2], model.Aannames(**dict(zip(SIMULATION_FIELDS, key[4]))), key[3]))]
    out['gemuteerd'] = len(mutated)
    # Koude controle: lege cache en lege bestandscache, dezelfde invoer.
    SIM_MEMO.clear()
    clear_file_cache()
    out['koud_bereken'] = strip_timing(dispatch('/api/opsplitsing', body))
    out['koud_bereken_kosten'] = strip_timing(dispatch('/api/opsplitsing', {**body, **cost}))
    SIM_MEMO.clear()
    clear_file_cache()
    out['koud_gevoeligheid'] = dispatch('/api/opsplitsing/gevoeligheid', {**body, 'n': 4})
    SIM_MEMO.clear()
    clear_file_cache()
    out['koud_omslagkaart'] = dispatch('/api/opsplitsing/omslagkaart', body)
    return out
