// Projectstudio (C5): daggrafiek en stationsvergelijking voor een park in een project, met parkPowerModel en de
// gekozen KNMI-stations. Antwoord in dezelfde vorm als /api/wind (hours, intervals), zodat dag en jaar hetzelfde model delen.
import { fetchStation, modelHours, modelOptions, windPowerModel, describeWind, AVERAGE } from '../knmi.mjs';
import { parkPowerModel, hubFactor, KNOWN, HOUTRIBDIJK, STAVOREN } from './park-model.mjs';
import { BOLSWARD, stationName, ID_PATTERN } from './project.mjs';

const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && !Number.isNaN(Date.parse(day + 'T00:00:00Z')) && Date.parse(day + 'T00:00:00Z') <= Date.now() + 86400000 && day >= '2015-01-01';
const nl = v => v.toFixed(3).replace('.', ',');

// Gemiddelde van n KNMI-antwoorden per tijdstempel; ontbreekt één station, dan blijft het moment leeg (geen invulling).
export function averageMany(raws, id = AVERAGE) {
  if (raws.length === 1) return raws[0];
  const series = raws.map(raw => { const c = raw.coverages?.[0]; if (raw.coverages?.length !== 1 || raw.parameters?.ff?.unit?.symbol?.value !== 'm/s') throw Error('Invalid KNMI data'); const t = c.domain?.axes?.t?.values || [], ff = c.ranges?.ff?.values || []; return new Map(t.map((s, i) => [s, typeof ff[i] === 'number' && Number.isFinite(ff[i]) && ff[i] >= 0 ? ff[i] : null])); });
  const stamps = [...new Set(series.flatMap(m => [...m.keys()]))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const ff = stamps.map(s => { let sum = 0; for (const m of series) { const v = m.get(s); if (v == null) return null; sum += v; } return sum / series.length; });
  return { parameters: raws[0].parameters, coverages: [{ 'eumetnet:locationId': id, domain: { axes: { t: { values: stamps } } }, ranges: { ff: { values: ff }, dd: { values: stamps.map(() => null) } } }] };
}

// Precies het model van /api/wind voor Fryslân en Beabuorren met de standaardinstelling; anders het studiomodel.
export function isSiteDefault(park) {
  const known = KNOWN[park.id];
  return !!known && park.hoogte === 'wins50' && park.curve === known.curve && park.turbines === known.turbines && park.rated_kw === known.rated_kw && park.wake_pct === known.wake_pct
    && park.stations.length === 2 && park.stations[0] === HOUTRIBDIJK && park.stations[1] === STAVOREN;
}
export function dayModel(park, day) {
  if (isSiteDefault(park)) { const options = { ...modelOptions(new URLSearchParams({ park: park.id })), stationId: AVERAGE, stationName: 'Houtribdijk + Stavoren' }; return { options, power: windPowerModel(day, options), text: describeWind(day, options) }; }
  const id = park.stations.length > 1 ? AVERAGE : park.stations[0], f = hubFactor(park, day);
  const source = 'KNMI ' + park.stations.map(stationName).join(' + ') + (park.stations.length > 1 ? ' (gemiddelde per tien minuten, alleen als alle stations meten)' : '');
  const height = park.hoogte === 'wins50' ? `hoogtevertaling WINS50, F = ${nl(f)} voor deze maand` : `seizoens-α (aanname, geijkt op Fryslân), deze dag factor ${nl(f)} van 10 naar ${park.hub_height_m} m`;
  return { options: { stationId: id, stationName: park.stations.map(stationName).join(' + ') }, power: parkPowerModel(park, day, f), text: `${source}; ${height}; ${park.curve === 'standaard' ? 'standaardcurve SWT-DD-130 geschaald naar ' + park.rated_kw + ' kW (aanname)' : 'eigen turbinecurve'}, zogverlies ${park.wake_pct} %.` };
}

export async function parkDay(park, day, env) {
  const model = dayModel(park, day), raws = await Promise.all(park.stations.map(id => fetchStation(day, env, id)));
  const profile = modelHours(averageMany(raws), day, model.options, true, model.power);
  return { day, park: { id: park.id, naam: park.naam }, station: model.options.stationName, windSource: model.text, ...profile };
}
// Stationsvergelijking: elk gekozen station apart door het parkmodel, plus de combinatie en de verschilband.
export async function parkDayComparison(park, day, env) {
  const model = dayModel(park, day), settled = await Promise.allSettled(park.stations.map(id => fetchStation(day, env, id)));
  const stations = park.stations.map((id, i) => settled[i].status === 'fulfilled' ? { id, naam: stationName(id), intervals: modelHours(settled[i].value, day, { ...model.options, stationId: id }, true, model.power).intervals } : { id, naam: stationName(id), intervals: [] });
  const ok = settled.every(r => r.status === 'fulfilled');
  const combination = ok ? modelHours(averageMany(settled.map(r => r.value)), day, model.options, true, model.power).intervals.map(p => {
    const powers = stations.map(s => s.intervals.find(q => q.start === p.start)?.powerMW).filter(v => typeof v === 'number');
    return { ...p, minMW: powers.length === stations.length ? Math.min(...powers) : null, maxMW: powers.length === stations.length ? Math.max(...powers) : null, differenceMW: powers.length === stations.length ? Math.max(...powers) - Math.min(...powers) : null };
  }) : [];
  return { day, park: { id: park.id, naam: park.naam }, windSource: model.text, stations, combination, unavailable: stations.filter((s, i) => settled[i].status === 'rejected').map(s => s.naam) };
}

export async function findPark(env, projectId, parkId) {
  let project = null;
  if (projectId === 'bolsward') project = BOLSWARD;
  else if (ID_PATTERN.test(projectId || '') && env.BUCKET) { const o = await env.BUCKET.get('studio/v1/projects/' + projectId + '.json'); project = o ? await o.json() : null; }
  return project?.parken.find(p => p.id === parkId) || null;
}

export async function parkDayRoute(request, env, url, answer) {
  const day = url.searchParams.get('dag');
  if (!validDay(day)) return answer({ error: 'Kies een geldige datum.' }, 400);
  if (!env.KNMI_EDR_API_KEY) return answer({ error: 'KNMI-windgegevens zijn nog niet gekoppeld.' }, 503);
  const park = await findPark(env, url.searchParams.get('project'), url.searchParams.get('park'));
  if (!park) return answer({ error: 'Park niet gevonden in dit project.' }, 404);
  if (!park.stations?.length) return answer({ error: 'Kies eerst een KNMI-station voor dit park.' }, 400);
  try { return answer(url.searchParams.get('vergelijking') === '1' ? await parkDayComparison(park, day, env) : await parkDay(park, day, env)); }
  catch (e) { console.error('STUDIO_PARK_DAY_FAILED', e?.message); return answer({ error: e?.message === 'KNMI_AUTH' ? 'KNMI weigert de API-sleutel.' : 'KNMI EDR is tijdelijk niet beschikbaar. Probeer het opnieuw.' }, 502); }
}
