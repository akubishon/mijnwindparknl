import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const env = {SITE_PASSWORD: 'fixture-site-password', WINDPARK_CATALOG_TOKEN: 'fixture-atlas-secret'};
const raw = async () => (await import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + Math.random()).toString('base64')}`)).default;
async function signedIn() {
 const worker = await raw();
 const login = await worker.fetch(new Request('https://fixture.test/auth/site', {method: 'POST', headers: {Origin: 'https://fixture.test', 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({password: env.SITE_PASSWORD})}), env);
 const cookie = login.headers.get('Set-Cookie').split(';')[0];
 return route => worker.fetch(new Request('https://fixture.test' + route, {headers: {Cookie: cookie}}), env);
}
const routes = ['/elektrolyser', '/elektrolyser/catalogus', '/elektrolyser/samenstellen', '/elektrolyser/vergelijken'];

test('Elektrolyser sub-tabs and the calculation worker stay behind the site login', async () => {
 const worker = await raw();
 for (const route of [...routes, '/api/harmonie', '/assets/elektrolyser-rekenkern.js']) assert.equal((await worker.fetch(new Request('https://fixture.test' + route), env)).status, 401, route);
 const get = await signedIn();
 for (const route of routes) {
  const r = await get(route);
  assert.equal(r.status, 200, route);
  const policy = r.headers.get('Content-Security-Policy');
  assert.match(policy, /worker-src 'self'/); assert.match(policy, /connect-src 'self'/);
  const html = await r.text();
  assert.doesNotMatch(html, /fixture-atlas-secret|WINDPARK_CATALOG_TOKEN/);
 }
 const retired = await get('/slim-schakelen?day=2026-10-25');
 assert.equal(retired.status, 302);
 assert.equal(retired.headers.get('Location'), '/elektrolyser?day=2026-10-25');
 const script = await get('/assets/elektrolyser-rekenkern.js');
 assert.equal(script.status, 200); assert.match(script.headers.get('Content-Type'), /javascript/);
 assert.match(script.headers.get('Content-Security-Policy'), /connect-src 'self'/);
 const text = await script.text();
 assert.match(text, /opsplitsing-assets\/data\//); assert.doesNotMatch(text, /fixture-atlas-secret/);
 // /elektrolyser/opsplitsen stays the alias of the opsplitsing page.
 assert.match(await (await get('/elektrolyser/opsplitsen')).text(), /bridge\.js/);
});
