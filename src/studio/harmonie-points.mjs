// Projectstudio (C5): HARMONIE-voorspelling op de parklocatie. Fryslân en Beabuorren uit de bestaande snapshots
// (harmonie/v1/…), andere parken uit studio/v1/harmonie/… die de uurlijkse taak vult voor parken in bewaarde projecten.
import { forecastFactor, modelOptions } from '../knmi.mjs';
import { parkPowerModel, hubFactor, localDay } from './park-model.mjs';
import { findPark } from './park-day.mjs';

const KNOWN = ['fryslan', 'beabuorren'];
async function readJSON(bucket, key) { const o = await bucket.get(key); return o ? o.json() : null; }

// v_as / v_10 voor HARMONIE-wind op 10 m bij het park: WINS50-hoogtetoename op de parklocatie voor bekende parken
// (forecastFactor in knmi.mjs), anders dezelfde seizoens-α als de stationswind.
export const forecastHubFactor = (park, day) => KNOWN.includes(park.id) && park.hoogte === 'wins50' ? forecastFactor(day, modelOptions(new URLSearchParams({ park: park.id }))) : hubFactor(park, day);

export function forecastRows(snapshot, park, now = Date.now()) {
  const models = new Map();
  return snapshot.rows.filter(r => Date.parse(r.time) >= now - 3600000).map(r => {
    const point = r.parks.find(p => p.id === park.id);
    if (!point) return null;
    const day = localDay(Date.parse(r.time));
    if (!models.has(day)) { const f = forecastHubFactor(park, day); models.set(day, { f, power: parkPowerModel(park, day, f) }); }
    const { f, power } = models.get(day), v = point.windSpeedMS;
    return { time: r.time, windSpeedMS: v, hubWindSpeedMS: v === null ? null : v * f, powerMW: power(v), gridLatitude: point.gridLatitude, gridLongitude: point.gridLongitude };
  }).filter(Boolean);
}

export async function harmonieRoute(request, env, url, answer) {
  const model = url.searchParams.get('model') || 'p1';
  if (!['p1', 'p2b'].includes(model)) return answer({ error: 'Kies HARMONIE P1 of P2b.' }, 400);
  if (!env.BUCKET) return answer({ error: 'De opslag is niet gekoppeld.' }, 503);
  const park = await findPark(env, url.searchParams.get('project'), url.searchParams.get('park'));
  if (!park) return answer({ error: 'Park niet gevonden in dit project.' }, 404);
  const base = KNOWN.includes(park.id) ? `harmonie/v1/${model}/` : `studio/v1/harmonie/${model}/`;
  const pointer = await readJSON(env.BUCKET, base + 'latest.json'), snapshot = pointer ? await readJSON(env.BUCKET, pointer.key) : null;
  const rows = snapshot ? forecastRows(snapshot, park) : [];
  if (!rows.length) return answer({ error: 'Nog geen voorspelling voor dit park. De uurlijkse taak haalt het roosterpunt op zodra het park in een bewaard project staat.' }, 404);
  return answer({ model, run: snapshot.run, source: snapshot.source, retrievedAt: snapshot.retrievedAt, stale: Date.now() - Date.parse(snapshot.run) > 6 * 3600000, park: { id: park.id, naam: park.naam }, heightM: 10,
    hoogtevertaling: KNOWN.includes(park.id) && park.hoogte === 'wins50' ? 'WINS50-hoogtetoename op de parklocatie' : 'seizoens-α (aanname), zoals de stationswind', rows });
}
