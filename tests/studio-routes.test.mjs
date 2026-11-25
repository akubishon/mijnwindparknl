import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// De Projectstudio in de samengestelde worker: alleen op intern., overal het wachtwoord, overal noindex.
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
const host = 'https://intern.mijnwindpark.nl';
const store = new Map();
const env = { SITE_PASSWORD: 'fixture-site-password', BUCKET: { async get(k) { return store.has(k) ? { body: store.get(k), json: async () => JSON.parse(store.get(k)) } : null; }, async put(k, v) { store.set(k, v); }, async head(k) { return store.has(k) ? {} : null; } } };
const login = await worker.fetch(new Request(host + '/auth/site', { method: 'POST', headers: { Origin: host, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password: env.SITE_PASSWORD, next: '/project/bolsward' }) }), env);
const cookie = login.headers.get('Set-Cookie')?.split(';')[0];
const get = (path, signed = true, init = {}) => worker.fetch(new Request(host + path, { ...init, headers: { ...(signed ? { Cookie: cookie } : {}), ...(init.headers || {}) } }), env);

test('inloggen op intern. geeft een eigen sessie en stuurt door', () => {
  assert.equal(login.status, 303); assert.equal(login.headers.get('Location'), '/project/bolsward'); assert.match(cookie, /^__Host-site_session=/);
  assert.equal(login.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('elke route zonder sessie: 401 of het wachtwoordformulier, en altijd noindex', async () => {
  for (const path of ['/', '/nieuw', '/project/bolsward', '/project/bolsward/park/fryslan', '/assets/studio.js', '/assets/studio.css', '/api/studio/projects', '/api/studio/stations', '/api/studio/parks', '/api/studio/wind10/0-20000-0-06258/2025', '/api/studio/park-dag?project=bolsward&park=fryslan&dag=2025-01-01', '/api/atlas/catalogue', '/assets/elektrolyser-rekenkern.js', '/onbekend']) {
    const r = await get(path, false);
    assert.equal(r.status, 401, path); assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow', path);
    if (!path.startsWith('/api/')) assert.match(await r.text(), /type="password"/, path);
  }
  const robots = await get('/robots.txt', false);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
});

test('met sessie: pagina, bundels, parken en stations; noindex en eigen CSP', async () => {
  const page = await get('/project/bolsward');
  assert.equal(page.status, 200); assert.match(await page.text(), /Projectstudio/); assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(page.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.equal((await get('/assets/studio.js')).status, 200);
  assert.match(await (await get('/assets/studio.css')).text(), /maplibregl-map/);
  const parks = await (await get('/api/studio/parks')).json();
  assert.ok(parks.features.length > 100);
  const stations = await (await get('/api/studio/stations')).json();
  assert.ok(stations.stations.some(s => s.id === '0-20000-0-06258'));
  assert.equal((await get('/assets/elektrolyser-rekenkern.js')).status, 200);
  assert.equal((await get('/elektrolyser')).status, 404, 'de hoofdsite staat niet op intern.');
});

test('projecten bewaren, lezen, wijzigen en in de lijst zien', async () => {
  const project = { naam: 'Test Sneek', locatie: { lat: 53.03, lon: 5.66 }, varianten: [{ id: 'a', modelId: '', modules: 2, choices: {} }], referentie: 0, jaren: [2024, 2025], algemeen: {},
    parken: [{ id: 'osm:53.0000,5.6000', naam: 'Testpark', lat: 53, lon: 5.6, turbines: 4, rated_kw: 3000, hub_height_m: 100, wake_pct: 5, curve: 'standaard', hoogte: 'alpha', aandeel: 0.5, stations: ['0-20000-0-06267'], herkomst: { turbines: 'osm' } }] };
  const post = body => get('/api/studio/projects', true, { method: 'POST', headers: { Origin: host, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await get('/api/studio/projects', true, { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' })).status, 403);
  assert.equal((await post({ ...project, parken: [{ ...project.parken[0], stations: ['nep'] }] })).status, 400);
  const created = await post(project);
  assert.equal(created.status, 201);
  const saved = await created.json();
  assert.match(saved.id, /^[a-z2-7]{12}$/); assert.ok(store.has(`studio/v1/projects/${saved.id}.json`));
  const read = await (await get('/api/studio/projects/' + saved.id)).json();
  assert.equal(read.naam, 'Test Sneek'); assert.deepEqual(read.jaren, [2025], 'alleen windjaar 2025');
  const put = await get('/api/studio/projects/' + saved.id, true, { method: 'PUT', headers: { Origin: host, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...read, naam: 'Test Sneek 2' }) });
  assert.equal((await put.json()).gemaakt, saved.gemaakt);
  const list = await (await get('/api/studio/projects')).json();
  assert.deepEqual(list.projecten.map(p => p.naam), ['Test Sneek 2']);
  assert.equal((await get('/project/' + saved.id)).status, 200);
  assert.equal((await get('/api/studio/projects/aaaaaaaaaaaa')).status, 404);
  assert.equal((await get('/api/studio/park-dag?project=' + saved.id + '&park=osm:53.0000,5.6000&dag=2025-01-01')).status, 503, 'zonder KNMI-sleutel');
});

test('de hoofdsite en de Atlas veranderen niet door de studio', async () => {
  const main = await worker.fetch(new Request('https://mijnwindpark.nl/robots.txt'), env);
  assert.equal(main.status, 200); assert.doesNotMatch(await main.text(), /intern/);
  assert.equal((await worker.fetch(new Request('https://mijnwindpark.nl/api/studio/projects'), env)).status, 401);
});
