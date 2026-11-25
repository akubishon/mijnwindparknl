// Projectstudio op intern.mijnwindpark.nl (lokaal intern.localhost:8787). De worker roept studioRoute() pas aan na de
// wachtwoordpoort; elke response krijgt daar ook X-Robots-Tag: noindex. Gebundeld als IIFE met globalName studioServer.
import windparken from '../atlas/windparken.geojson';
import { windRoute } from './wind-data.mjs';
import { validateProject, newProjectId, ID_PATTERN } from './project.mjs';
import { parkDayRoute } from './park-day.mjs';

export const STUDIO_HOSTS = ['intern.mijnwindpark.nl', 'intern.localhost'];
export const PROJECTS = 'studio/v1/projects/', PROJECT_INDEX = PROJECTS + 'index.json', MAX_BODY = 256 * 1024, MAX_PROJECTS = 500;
const CSP = "default-src 'none'; script-src 'self'; worker-src 'self' blob:; child-src blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://service.pdok.nl; connect-src 'self' https://service.pdok.nl https://api.pdok.nl; font-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
export const studioHeaders = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'X-Robots-Tag': 'noindex, nofollow' };
const answer = (value, status = 200) => Response.json(value, { status, headers: { ...studioHeaders, 'Cache-Control': 'no-store' } });
// Parken van de kaart (OpenStreetMap), alleen wat de studio nodig heeft.
export const studioParks = windparken.features.filter(f => f.geometry?.type === 'Point').map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.geometry.coordinates }, properties: { naam: f.properties.naam, mw: f.properties.mw, turbines: f.properties.turbines, plaats: f.properties.plaats, gemeente: f.properties.gemeente, provincie: f.properties.provincie } }));
const PAGE_PATHS = /^\/(?:$|nieuw$|project\/(?:bolsward|[a-z2-7]{12})(?:\/park\/[^/]{1,60})?$)/;

async function readJSON(bucket, key) { const o = await bucket.get(key); return o ? o.json() : null; }
async function readBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw Error('Project is te groot.');
  const body = await request.text(); if (body.length > MAX_BODY) throw Error('Project is te groot.');
  return JSON.parse(body);
}
async function saveProject(env, project) {
  await env.BUCKET.put(PROJECTS + project.id + '.json', JSON.stringify(project), { httpMetadata: { contentType: 'application/json' } });
  const index = (await readJSON(env.BUCKET, PROJECT_INDEX)) || { projecten: [] };
  const entry = { id: project.id, naam: project.naam, locatie: project.locatie, gewijzigd: project.gewijzigd, parken: project.parken.length };
  index.projecten = [entry, ...index.projecten.filter(p => p.id !== project.id)].slice(0, MAX_PROJECTS);
  await env.BUCKET.put(PROJECT_INDEX, JSON.stringify(index), { httpMetadata: { contentType: 'application/json' } });
}
// Alle parken in bewaarde projecten (voor de HARMONIE-punten van de uurlijkse taak), hoogstens `max`.
export async function projectParks(env, max = 50) {
  const index = (await readJSON(env.BUCKET, PROJECT_INDEX)) || { projecten: [] }, out = new Map();
  for (const entry of index.projecten) {
    if (out.size >= max) break;
    const project = await readJSON(env.BUCKET, PROJECTS + entry.id + '.json').catch(() => null);
    for (const p of project?.parken || []) if (!['fryslan', 'beabuorren'].includes(p.id) && out.size < max && !out.has(p.id)) out.set(p.id, { id: p.id, latitude: p.lat, longitude: p.lon });
  }
  return [...out.values()];
}

async function projectsRoute(request, env, url) {
  if (!env.BUCKET) return answer({ error: 'De opslag is niet gekoppeld.' }, 503);
  const now = new Date().toISOString();
  if (url.pathname === '/api/studio/projects') {
    if (request.method === 'GET') return answer((await readJSON(env.BUCKET, PROJECT_INDEX)) || { projecten: [] });
    if (request.method !== 'POST') return answer({ error: 'Method not allowed' }, 405);
    if (request.headers.get('Origin') !== url.origin) return answer({ error: 'Ongeldige aanvraag.' }, 403);
    let project; try { project = validateProject(await readBody(request)); } catch (e) { return answer({ error: e.message }, 400); }
    Object.assign(project, { id: newProjectId(), gemaakt: now, gewijzigd: now });
    await saveProject(env, project);
    return answer(project, 201);
  }
  const m = url.pathname.match(/^\/api\/studio\/projects\/([a-z2-7]{12})$/);
  if (!m || !ID_PATTERN.test(m[1])) return null;
  const key = PROJECTS + m[1] + '.json';
  if (request.method === 'GET') { const p = await readJSON(env.BUCKET, key); return p ? answer(p) : answer({ error: 'Project niet gevonden.' }, 404); }
  if (request.method !== 'PUT') return answer({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Origin') !== url.origin) return answer({ error: 'Ongeldige aanvraag.' }, 403);
  const old = await readJSON(env.BUCKET, key);
  if (!old) return answer({ error: 'Project niet gevonden.' }, 404);
  let project; try { project = validateProject(await readBody(request)); } catch (e) { return answer({ error: e.message }, 400); }
  Object.assign(project, { id: m[1], gemaakt: old.gemaakt, gewijzigd: now });
  await saveProject(env, project);
  return answer(project);
}

// `assets`: {page, script, style}; `shared(path)` geeft een response van de hoofdsite voor gedeelde paden (catalogus, rekenkern, font).
export async function studioRoute(request, env, url, assets, shared) {
  try {
    if (url.pathname.startsWith('/api/studio/projects')) { const r = await projectsRoute(request, env, url); if (r) return r; }
    if (request.method !== 'GET' && request.method !== 'HEAD') return answer({ error: 'Method not allowed' }, 405);
    if (PAGE_PATHS.test(url.pathname)) return new Response(assets.page, { headers: { ...studioHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (url.pathname === '/assets/studio.js') return new Response(assets.script, { headers: { ...studioHeaders, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (url.pathname === '/assets/studio.css') return new Response(assets.style, { headers: { ...studioHeaders, 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (url.pathname === '/api/studio/parks') return Response.json({ type: 'FeatureCollection', attributie: windparken.attributie, features: studioParks }, { headers: { ...studioHeaders, 'Cache-Control': 'private, max-age=3600' } });
    if (url.pathname.startsWith('/api/studio/wind10/') || url.pathname === '/api/studio/stations') { const r = await windRoute(request, env, url, answer); if (r) return r; }
    if (url.pathname === '/api/studio/park-dag') return await parkDayRoute(request, env, url, answer);
    const sharedResponse = await shared?.(url.pathname);
    if (sharedResponse) return sharedResponse;
    return answer({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('STUDIO_REQUEST_FAILED', url.pathname, error?.message || 'Error');
    return answer({ error: 'Er ging iets mis in de Projectstudio. Probeer het opnieuw.' }, 500);
  }
}
