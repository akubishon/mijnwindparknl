// Atlas-kaart (browser). Bevat bewust geen reken- of kostencode: de LCOH komt alleen van POST /api/atlas/lcoh.
import maplibregl from 'maplibre-gl';

const PERCEEL_ZOOM = 16;
const BRT = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png';
const KADASTER = 'https://service.pdok.nl/kadaster/kadastralekaart/wmts/v5_0/Kadastralekaart/EPSG:3857/{z}/{x}/{y}.png';
const BRK = 'https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items';
const LOCATIE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const $ = id => document.getElementById(id);
const nl = (v, d = 1) => Number(v).toLocaleString('nl-NL', {minimumFractionDigits: d, maximumFractionDigits: d});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const empty = {type: 'FeatureCollection', features: []};
let chosen = null;

const map = new maplibregl.Map({
 container: 'kaart',
 center: [5.3, 52.2], zoom: 7, minZoom: 6, maxZoom: 20, maxBounds: [[2.5, 50.2], [8, 54]],
 attributionControl: {compact: true},
 style: {
  version: 8,
  sources: {
   brt: {type: 'raster', tiles: [BRT], tileSize: 256, maxzoom: 19, attribution: 'Achtergrond en percelen © <a href="https://www.pdok.nl">Kadaster / PDOK</a>'},
   kadaster: {type: 'raster', tiles: [KADASTER], tileSize: 256, minzoom: PERCEEL_ZOOM, maxzoom: 20},
   windparken: {type: 'geojson', data: '/windparken.geojson', attribution: 'Windparken © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'},
   perceel: {type: 'geojson', data: empty},
  },
  layers: [
   {id: 'brt', type: 'raster', source: 'brt'},
   {id: 'kadaster', type: 'raster', source: 'kadaster', minzoom: PERCEEL_ZOOM},
   {id: 'perceel-vlak', type: 'fill', source: 'perceel', paint: {'fill-color': '#00A6DE', 'fill-opacity': 0.25}},
   {id: 'perceel-rand', type: 'line', source: 'perceel', paint: {'line-color': '#0C2340', 'line-width': 3}},
   {id: 'windparken', type: 'circle', source: 'windparken', paint: {
    'circle-color': '#00A6DE', 'circle-stroke-color': '#0C2340', 'circle-stroke-width': 1.5, 'circle-opacity': 0.85,
    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mw'], 3], 3, 4, 50, 8, 300, 14, 1000, 20],
   }},
  ],
 },
});
map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
map.on('mouseenter', 'windparken', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'windparken', () => { map.getCanvas().style.cursor = ''; });
const hint = () => { $('hint').hidden = map.getZoom() >= PERCEEL_ZOOM; };
map.on('zoomend', hint); hint();

// ---------------------------------------------------------------- klikken: windpark (popup) of perceel (teaser)
map.on('click', async event => {
 const park = map.queryRenderedFeatures(event.point, {layers: ['windparken']})[0];
 if (park) {
  const p = park.properties;
  new maplibregl.Popup({offset: 10}).setLngLat(park.geometry.coordinates).setHTML(`<strong>${esc(p.naam)}</strong><br>${nl(p.mw)} MW`).addTo(map);
  return;
 }
 if (map.getZoom() < PERCEEL_ZOOM) { map.easeTo({center: event.lngLat, zoom: Math.max(map.getZoom() + 3, PERCEEL_ZOOM)}); return; }
 await choose(event.lngLat.lng, event.lngLat.lat);
});

function inRing(x, y, ring) {
 let inside = false;
 for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
  const [xi, yi] = ring[i], [xj, yj] = ring[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
 }
 return inside;
}
const contains = (geometry, x, y) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
 .some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(hole => inRing(x, y, hole)));

async function choose(lon, lat) {
 show('<p class="atlas-muted">Perceel ophalen…</p>');
 const d = 0.0002, bbox = [lon - d, lat - d, lon + d, lat + d].map(v => v.toFixed(6)).join(',');
 let perceel = null;
 try {
  const r = await fetch(`${BRK}?bbox=${bbox}&f=json&limit=50`);
  if (!r.ok) throw Error();
  perceel = (await r.json()).features.find(f => f.geometry && contains(f.geometry, lon, lat)) || null;
 } catch { show('<p>Het Kadaster is nu niet bereikbaar. Probeer het opnieuw.</p>'); return; }
 if (!perceel) { map.getSource('perceel').setData(empty); show('<p>Hier ligt geen kadastraal perceel. Klik op een perceel op het land.</p>'); return; }
 map.getSource('perceel').setData(perceel);
 const p = perceel.properties;
 chosen = {lat, lon, aanduiding: `${p.kadastrale_gemeente_waarde} ${p.sectie} ${p.perceelnummer}`, m2: p.kadastrale_grootte_waarde};
 let teaser = null;
 try {
  const r = await fetch(`/api/atlas/teaser?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`);
  if (r.ok) teaser = await r.json();
 } catch { teaser = null; }
 render(teaser);
}

function render(t) {
 const parks = t?.windparken?.length ? `<ol class="atlas-parks">${t.windparken.map(p => `<li><strong>${esc(p.naam)}</strong><span>${nl(p.afstand_km)} km · ${nl(p.mw)} MW</span></li>`).join('')}</ol>` : '<p class="atlas-muted">Geen windparken gevonden.</p>';
 const station = t?.station ? `<dl class="atlas-facts">
  <dt>KNMI-station</dt><dd>${esc(t.station.naam)} (${nl(t.station.afstand_km)} km)</dd>
  <dt>Gemiddelde wind 2025</dt><dd>${nl(t.station.wind_gem_ms)} m/s op 10 m hoogte</dd></dl>` : '<p class="atlas-muted">Winddata is nu niet beschikbaar.</p>';
 show(`<p class="atlas-kicker">Elektrolyserlocatie</p>
  <h2>Perceel ${esc(chosen.aanduiding)}</h2>
  <p class="atlas-area">${Number(chosen.m2).toLocaleString('nl-NL')} m²</p>
  ${station}
  <h3>Dichtstbijzijnde windparken</h3>${parks}
  <p id="lcoh" class="atlas-lcoh" hidden></p>
  <a class="atlas-cta" href="https://mijnwindpark.nl/waterstofscan">Vraag een Waterstofscan aan</a>`);
}
function show(html) { $('teaser').innerHTML = html; $('paneel').hidden = false; }
$('sluit').addEventListener('click', () => { $('paneel').hidden = true; });

// ---------------------------------------------------------------- adres zoeken (PDOK Locatieserver)
let searchTimer = 0, results = [];
$('zoek').addEventListener('input', () => {
 clearTimeout(searchTimer);
 const q = $('zoek').value.trim();
 if (q.length < 3) { $('resultaten').hidden = true; return; }
 searchTimer = setTimeout(async () => {
  try {
   const r = await fetch(`${LOCATIE}?${new URLSearchParams({q, rows: '6', fl: 'weergavenaam,centroide_ll,type', fq: 'type:(adres OR postcode OR weg OR woonplaats OR gemeente)'})}`);
   results = (await r.json()).response.docs;
  } catch { results = []; }
  $('resultaten').innerHTML = results.map((d, i) => `<li><button type="button" data-i="${i}">${esc(d.weergavenaam)}</button></li>`).join('') || '<li class="atlas-muted">Geen resultaten</li>';
  $('resultaten').hidden = false;
 }, 250);
});
$('resultaten').addEventListener('click', event => {
 const d = results[event.target.closest('button')?.dataset.i];
 if (!d) return;
 const [lon, lat] = d.centroide_ll.match(/[-\d.]+/g).map(Number);
 const zoom = {adres: 18, postcode: 17, weg: 16, woonplaats: 13, gemeente: 11}[d.type] || 15;
 map.flyTo({center: [lon, lat], zoom});
 $('zoek').value = d.weergavenaam; $('resultaten').hidden = true;
});
$('zoekform').addEventListener('submit', event => { event.preventDefault(); $('resultaten').querySelector('button')?.click(); });

// ---------------------------------------------------------------- verborgen: Alt+klik op het logo
$('logo').addEventListener('click', event => {
 if (!event.altKey) return;
 event.preventDefault();
 $('slot').hidden = !$('slot').hidden;
 if (!$('slot').hidden) $('wachtwoord').focus();
});
$('slot').addEventListener('submit', async event => {
 event.preventDefault();
 const status = $('slotstatus');
 if (!chosen) { status.textContent = 'Kies eerst een perceel.'; return; }
 status.textContent = 'Berekenen…';
 try {
  const r = await fetch('/api/atlas/lcoh', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({lat: chosen.lat, lon: chosen.lon, password: $('wachtwoord').value})});
  const d = await r.json();
  if (!r.ok) { status.textContent = d.error || 'Mislukt.'; return; }
  status.textContent = '';
  const line = $('lcoh');
  if (line) { line.textContent = `LCOH ${d.lcoh_eur_kg === null ? '–' : '€ ' + nl(d.lcoh_eur_kg, 2)}/kg · ${d.windpark || 'aangenomen windpark'} (${nl(d.P_mw)} MW)`; line.hidden = false; }
 } catch { status.textContent = 'Mislukt. Probeer opnieuw.'; }
});
