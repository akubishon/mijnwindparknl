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
const rad = d => d * Math.PI / 180;
const km = (lat1, lon1, lat2, lon2) => 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2)));
let chosen = null;          // gekozen perceel
let options = [];           // windparken die in het paneel te kiezen zijn
const selected = new Set(); // id's van de aangevinkte windparken
let focus = null;           // omgekeerde route: windpark waarbij een perceel wordt gezocht
let profileView = null;     // laatst opgehaald locatieprofiel (zolang de keuze niet verandert)
const FOCUS_KM = 5;         // omgekeerde route: percelen binnen deze afstand van het park
const HUB_MIN = 2.5, HUB_MAX = 25; // hubregeling (interessepeiling RVO): elektrisch inputvermogen in MW
const SCAN = 'https://mijnwindpark.nl/waterstofscan';
const CAPACITEITSKAART = 'https://capaciteitskaart.netbeheernederland.nl/';
const params = new URLSearchParams(location.search);
// Campagnebron uit de link (?bron=adviseur-x); de Atlas zelf is 'atlas'.
const incoming = (params.get('bron') || '').toLowerCase();
const campaign = /^[a-z0-9][a-z0-9-]{0,30}$/.test(incoming) && incoming !== 'atlas' ? incoming : '';
const ctaSource = campaign ? 'atlas-' + campaign : 'atlas';

// ---------------------------------------------------------------- tellen zonder cookies (alleen de naam van de stap)
function track(e) {
 const body = JSON.stringify({e});
 try { if (navigator.sendBeacon?.('/api/atlas/event', body)) return; } catch { /* val terug op fetch */ }
 fetch('/api/atlas/event', {method: 'POST', body, keepalive: true}).catch(() => {});
}
track('kaart');

// ---------------------------------------------------------------- windparken (één keer laden; ook voor gedeelde links)
const parksData = fetch('/windparken.geojson').then(r => r.json()).catch(() => ({type: 'FeatureCollection', features: []}));
const parkById = async id => (await parksData).features.find(f => f.properties.id === id);
const parkOption = (f, at) => ({id: f.properties.id, naam: f.properties.naam, mw: f.properties.mw, station: {naam: f.properties.knmi},
 afstand_km: at ? km(at.lat, at.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) : 0});

// ---------------------------------------------------------------- deelbare link: perceel en parken in het adres
function syncUrl() {
 const q = new URLSearchParams();
 if (chosen) q.set('p', `${chosen.lat.toFixed(6)},${chosen.lon.toFixed(6)}`);
 if (chosen && selected.size) q.set('w', [...selected].join(','));
 if (!chosen && focus) q.set('park', String(focus.id));
 if (campaign) q.set('bron', campaign);
 const query = q.toString();
 history.replaceState(null, '', location.pathname + (query ? '?' + query.replace(/%2C/g, ',') : ''));
}
function ctaHref() {
 const chosenParks = options.filter(p => selected.has(p.id));
 const total = chosenParks.reduce((sum, p) => sum + p.mw, 0);
 const q = new URLSearchParams({bron: ctaSource});
 if (chosen) q.set('locatie', `Perceel ${chosen.aanduiding} (${chosen.lat.toFixed(5)}, ${chosen.lon.toFixed(5)})${chosenParks.length ? '; windparken: ' + chosenParks.map(p => p.naam).join(', ') : ''}`.slice(0, 300));
 if (total > 0) q.set('vermogen', String(Math.round(total * 10) / 10));
 return `${SCAN}?${q}#aanvraag`;
}

const map = new maplibregl.Map({
 container: 'kaart',
 center: [5.3, 52.2], zoom: 7, minZoom: 6, maxZoom: 20, maxBounds: [[2.5, 50.2], [8, 54]],
 attributionControl: {compact: true},
 style: {
  version: 8,
  sources: {
   brt: {type: 'raster', tiles: [BRT], tileSize: 256, maxzoom: 19, attribution: 'Achtergrond en percelen © <a href="https://www.pdok.nl">Kadaster / PDOK</a>'},
   kadaster: {type: 'raster', tiles: [KADASTER], tileSize: 256, minzoom: PERCEEL_ZOOM, maxzoom: 20},
   windparken: {type: 'geojson', data: empty, attribution: 'Windparken © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'},
   perceel: {type: 'geojson', data: empty},
   focus: {type: 'geojson', data: empty},
   dekking: {type: 'geojson', data: empty},
   stations: {type: 'geojson', data: empty, attribution: 'Wind © <a href="https://www.knmi.nl">KNMI</a>'},
  },
  layers: [
   {id: 'brt', type: 'raster', source: 'brt'},
   {id: 'dekking', type: 'fill', source: 'dekking', paint: {'fill-color': '#7AB800', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.2, PERCEEL_ZOOM, 0.06]}},
   {id: 'kadaster', type: 'raster', source: 'kadaster', minzoom: PERCEEL_ZOOM},
   {id: 'focus', type: 'line', source: 'focus', paint: {'line-color': '#0C2340', 'line-width': 2, 'line-dasharray': [2, 2]}},
   {id: 'perceel-vlak', type: 'fill', source: 'perceel', paint: {'fill-color': '#00A6DE', 'fill-opacity': 0.25}},
   {id: 'perceel-rand', type: 'line', source: 'perceel', paint: {'line-color': '#0C2340', 'line-width': 3}},
   {id: 'windparken', type: 'circle', source: 'windparken', paint: {
    // Grijs: geen KNMI-station binnen de afstandsgrens van dit park, dus niet te kiezen.
    'circle-color': ['case', ['to-boolean', ['get', 'knmi']], '#00A6DE', '#A7B1BC'],
    'circle-stroke-color': ['case', ['to-boolean', ['get', 'knmi']], '#0C2340', '#7C8896'],
    'circle-stroke-width': 1.5, 'circle-opacity': ['case', ['to-boolean', ['get', 'knmi']], 0.85, 0.6],
    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mw'], 3], 3, 4, 50, 8, 300, 14, 1000, 20],
   }},
   {id: 'windparken-gekozen', type: 'circle', source: 'windparken', filter: ['in', ['get', 'id'], ['literal', []]], paint: {
    'circle-color': '#0C2340', 'circle-stroke-color': '#00A6DE', 'circle-stroke-width': 3,
    'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mw'], 3], 3, 6, 50, 10, 300, 16, 1000, 22],
   }},
   {id: 'stations', type: 'circle', source: 'stations', paint: {'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#0C2340', 'circle-stroke-width': 2.5}},
  ],
 },
});
map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');
map.on('mouseenter', 'windparken', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'windparken', () => { map.getCanvas().style.cursor = ''; });
const hint = () => { $('hint').hidden = map.getZoom() >= PERCEEL_ZOOM; };
map.on('zoomend', hint); hint();

// ---------------------------------------------------------------- KNMI-dekking: windparken binnen max_km van een station met data zijn te kiezen
function circle(lon, lat, radiusKm, steps = 64) {
 const ring = [];
 for (let i = 0; i <= steps; i++) {
  const a = 2 * Math.PI * i / steps;
  ring.push([lon + radiusKm / (111.32 * Math.cos(rad(lat))) * Math.sin(a), lat + radiusKm / 110.574 * Math.cos(a)]);
 }
 return ring;
}
map.on('load', async () => {
 map.getSource('windparken').setData(await parksData);
 restore();
 try {
  const r = await fetch('/api/atlas/stations');
  if (!r.ok) return;
  const d = await r.json();
  if (!d.stations?.length) return;
  map.getSource('dekking').setData({type: 'FeatureCollection', features: d.stations.map(s => ({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [circle(s.lon, s.lat, d.max_km)]}}))});
  map.getSource('stations').setData({type: 'FeatureCollection', features: d.stations.map(s => ({type: 'Feature', properties: {naam: s.naam, wind: s.wind_gem_ms}, geometry: {type: 'Point', coordinates: [s.lon, s.lat]}}))});
  $('hint').textContent = `Klik op de kaart om een perceel te kiezen. Blauwe windparken liggen binnen ${d.max_km} km van een KNMI-station (groen gebied) en zijn te selecteren; grijze niet.`;
 } catch { /* zonder stations blijft de kaart bruikbaar; de server bewaakt de afstanden */ }
});

// ---------------------------------------------------------------- klikken: windpark (kiezen of popup), station (popup) of perceel (teaser)
map.on('click', async event => {
 const park = map.queryRenderedFeatures(event.point, {layers: ['windparken-gekozen', 'windparken']})[0];
 if (park) {
  const p = park.properties;
  if (!p.knmi) {
   new maplibregl.Popup({offset: 10}).setLngLat(park.geometry.coordinates).setHTML(`<strong>${esc(p.naam)}</strong><br>${nl(p.mw)} MW<br><span class="atlas-muted">Geen KNMI-station dicht genoeg bij dit park; niet te kiezen.</span>`).addTo(map);
   return;
  }
  if (chosen && !$('paneel').hidden) { togglePark({id: p.id, naam: p.naam, mw: p.mw, station: {naam: p.knmi}, afstand_km: km(chosen.lat, chosen.lon, park.geometry.coordinates[1], park.geometry.coordinates[0])}); return; }
  const box = document.createElement('div');
  box.innerHTML = `<strong>${esc(p.naam)}</strong><br>${nl(p.mw)} MW · KNMI ${esc(p.knmi)}<br><button type="button" class="atlas-link">Zoek een locatie bij dit park</button>`;
  const popup = new maplibregl.Popup({offset: 10}).setLngLat(park.geometry.coordinates).setDOMContent(box).addTo(map);
  box.querySelector('button').addEventListener('click', () => { popup.remove(); focusPark({id: p.id, naam: p.naam, mw: p.mw, knmi: p.knmi, lon: park.geometry.coordinates[0], lat: park.geometry.coordinates[1]}); });
  return;
 }
 const station = map.queryRenderedFeatures(event.point, {layers: ['stations']})[0];
 if (station) {
  new maplibregl.Popup({offset: 10}).setLngLat(station.geometry.coordinates).setHTML(`<strong>KNMI ${esc(station.properties.naam)}</strong><br>gemiddeld ${nl(station.properties.wind)} m/s in 2025`).addTo(map);
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

function reset() {
 map.getSource('perceel').setData(empty);
 chosen = null; options = []; selected.clear(); profileView = null; markSelected(); syncUrl();
}
// Omgekeerde route: begin bij een windpark en kies een perceel binnen FOCUS_KM.
function focusPark(park) {
 reset();
 focus = park;
 const ring = circle(park.lon, park.lat, FOCUS_KM);
 map.getSource('focus').setData({type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: ring}});
 const lons = ring.map(c => c[0]), lats = ring.map(c => c[1]);
 map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {padding: 40, duration: 800});
 show(`<p class="atlas-kicker">Locatie zoeken bij een windpark</p><h2>${esc(park.naam)}</h2><p class="atlas-area">${nl(park.mw)} MW · KNMI ${esc(park.knmi)}</p>
  <p>Zoom in en klik op een perceel binnen de stippellijn (${FOCUS_KM} km). Zo dichtbij kan een elektrolyser via een directe lijn of een gedeelde aansluiting (cable pooling) stroom van dit park krijgen.</p>
  <p class="atlas-muted atlas-help">Netcapaciteit in de buurt: <a href="${CAPACITEITSKAART}" target="_blank" rel="noopener">capaciteitskaart van de netbeheerders</a>.</p>`);
 syncUrl();
}
async function choose(lon, lat, {parks: wanted = [], shared = false} = {}) {
 show('<p class="atlas-muted">Perceel ophalen…</p>');
 const d = 0.0002, bbox = [lon - d, lat - d, lon + d, lat + d].map(v => v.toFixed(6)).join(',');
 let perceel = null;
 try {
  const r = await fetch(`${BRK}?bbox=${bbox}&f=json&limit=50`);
  if (!r.ok) throw Error();
  perceel = (await r.json()).features.find(f => f.geometry && contains(f.geometry, lon, lat)) || null;
 } catch { show('<p>Het Kadaster is nu niet bereikbaar. Probeer het opnieuw.</p>'); return; }
 if (!perceel) { reset(); show('<p>Hier ligt geen kadastraal perceel. Klik op een perceel op het land.</p>'); return; }
 let teaser = null, status = 0;
 try {
  const r = await fetch(`/api/atlas/teaser?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`);
  status = r.status;
  teaser = await r.json();
 } catch { teaser = null; }
 if (status === 422) {
  reset();
  show(`<p class="atlas-kicker">Geen geschikt windpark in de buurt</p><p>${esc(teaser?.error)} Kies een perceel dichter bij een blauw windpark.</p>`);
  return;
 }
 if (status !== 200 || !teaser?.windparken) { reset(); show('<p>Winddata is nu niet beschikbaar. Probeer het later opnieuw.</p>'); return; }
 map.getSource('perceel').setData(perceel);
 const p = perceel.properties;
 chosen = {lat, lon, aanduiding: `${p.kadastrale_gemeente_waarde} ${p.sectie} ${p.perceelnummer}`, m2: p.kadastrale_grootte_waarde};
 options = teaser.windparken || [];
 selected.clear(); profileView = null;
 // Gedeelde link: de parken uit het adres; omgekeerde route: het park waarbij gezocht werd.
 const preselect = shared ? wanted : focus ? [focus.id] : [];
 for (const id of preselect) {
  if (options.some(p => p.id === id)) { selected.add(id); continue; }
  const f = await parkById(id);
  if (f?.properties.knmi) { options.push({...parkOption(f, chosen), afstand_km: Math.round(parkOption(f, chosen).afstand_km * 10) / 10}); selected.add(id); }
 }
 markSelected();
 render(teaser);
 syncUrl();
 track('perceel');
}

function render() {
 if (profileView) { renderProfile(profileView); return; }
 show(`<p class="atlas-kicker">Elektrolyserlocatie</p>
  <h2>Perceel ${esc(chosen.aanduiding)}</h2>
  <p class="atlas-area">${Number(chosen.m2).toLocaleString('nl-NL')} m²</p>
  <h3>Kies windparken</h3>
  <p class="atlas-muted atlas-help">Vink de parken aan die deze locatie voeden, of klik een blauw windpark op de kaart. Elk park rekent met de wind van het KNMI-station bij dat park.</p>
  <ul id="parken" class="atlas-parks"></ul>
  <p id="parktotaal" class="atlas-total"></p>
  <div id="hub" class="atlas-hub" hidden></div>
  <p id="lcoh" class="atlas-lcoh" hidden></p>
  <div id="profielblok" class="atlas-profile-form" hidden>
   <h3>Gratis locatieprofiel</h3>
   <p class="atlas-muted atlas-help">Perceel, gekozen windparken en hoe het windaanbod zich verhoudt tot andere locaties, om te bewaren of af te drukken. Geen kostprijs.</p>
   <form id="profielform" novalidate>
    <label>Naam<input name="naam" required maxlength="120" autocomplete="name"></label>
    <label>Organisatie<input name="organisatie" required maxlength="160" autocomplete="organization"></label>
    <label>Zakelijk e-mailadres<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
    <span class="atlas-trap" aria-hidden="true"><label>Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label></span>
    <label class="atlas-check"><input type="checkbox" name="toestemming" required><span>Je mag mijn gegevens gebruiken om contact met me op te nemen over deze locatie.</span></label>
    <button type="submit">Stuur mijn locatieprofiel</button>
    <span id="profielstatus" class="atlas-status" role="status"></span>
   </form>
  </div>
  <p class="atlas-actions"><a id="cta" class="atlas-cta" href="${esc(ctaHref())}">Vraag een Waterstofscan aan</a><button id="deel" type="button" class="atlas-link">Kopieer link naar deze keuze</button></p>`);
 renderParks();
}
function renderParks() {
 const list = $('parken');
 if (!list) return;
 list.innerHTML = options.length ? options.map(p => `<li><label><input type="checkbox" data-id="${p.id}"${selected.has(p.id) ? ' checked' : ''}>
  <span><strong>${esc(p.naam)}</strong><small>${nl(p.afstand_km)} km van het perceel · ${nl(p.mw)} MW</small>
  <small>KNMI ${esc(p.station.naam)}${p.station.afstand_km === undefined ? '' : ` (${nl(p.station.afstand_km)} km van het park, ${nl(p.station.wind_gem_ms)} m/s in 2025)`}</small></span></label></li>`).join('') : '<li class="atlas-muted">Geen windparken gevonden.</li>';
 const chosenParks = options.filter(p => selected.has(p.id)), total = chosenParks.reduce((sum, p) => sum + p.mw, 0);
 $('parktotaal').textContent = selected.size ? `${selected.size} ${selected.size === 1 ? 'windpark' : 'windparken'} gekozen · ${nl(total)} MW` : 'Nog geen windpark gekozen.';
 $('profielblok').hidden = !selected.size;
 $('cta').href = ctaHref();
 renderHub(chosenParks, total);
}
// Hubregeling (concept): elektrolyser van 2,5 tot 25 MW; standaard de helft van het gekozen windvermogen, begrensd.
function renderHub(chosenParks, total) {
 const box = $('hub');
 if (!box) return;
 box.hidden = !chosenParks.length;
 if (!chosenParks.length) return;
 if (!$('hubmw')) box.innerHTML = `<h3>Past dit bij de hubregeling?</h3>
  <label class="atlas-inline">Elektrolyservermogen <input id="hubmw" type="number" min="0.5" max="200" step="0.5" value="${Math.min(HUB_MAX, Math.max(HUB_MIN, Math.round(total * 5) / 10))}"> MW</label>
  <ul id="hubchecks" class="atlas-checks"></ul>
  <p class="atlas-muted atlas-help">Voorwaarden uit de interessepeiling van RVO (april 2025); de regeling is verwacht in Q1 2027. Toets de definitieve voorwaarden.</p>`;
 const mw = Number($('hubmw').value), nearest = Math.min(...chosenParks.map(p => p.afstand_km));
 const ok = mw >= HUB_MIN && mw <= HUB_MAX, enough = mw > 0 && total >= mw;
 $('hubchecks').innerHTML = `<li class="${ok ? 'ok' : 'nee'}">${ok ? '✓' : '✗'} Tussen ${nl(HUB_MIN)} en ${nl(HUB_MAX, 0)} MW elektrisch inputvermogen</li>
   <li class="${enough ? 'ok' : 'nee'}">${enough ? '✓' : '✗'} Gekozen windvermogen (${nl(total)} MW) is minstens zo groot als de elektrolyser</li>
   <li class="open">? Niet vooral gericht op mobiliteit (zelf toetsen)</li>
   <li class="open">? Netcapaciteit: bekijk de <a href="${CAPACITEITSKAART}" target="_blank" rel="noopener">capaciteitskaart</a>; dichtstbijzijnde gekozen park op ${nl(nearest)} km${nearest <= FOCUS_KM ? ' (directe lijn of cable pooling denkbaar)' : ''}</li>`;
}
function renderProfile(d) {
 show(`<div class="atlas-profile">
  <p class="atlas-kicker">Locatieprofiel · indicatief</p>
  <h2>${d.perceel ? 'Perceel ' + esc(d.perceel) : 'Gekozen locatie'}</h2>
  <p class="atlas-area">${nl(d.lat, 5)}° N, ${nl(d.lon, 5)}° O${chosen?.m2 ? ' · ' + Number(chosen.m2).toLocaleString('nl-NL') + ' m²' : ''}</p>
  <h3>Windparken (${nl(d.P_mw)} MW samen)</h3>
  <ul class="atlas-parks">${d.windparken.map(p => `<li><strong>${esc(p.naam)}</strong><small>${nl(p.mw)} MW · ${nl(p.afstand_km)} km van het perceel</small><small>KNMI ${esc(p.station.naam)}, ${nl(p.station.afstand_km)} km van het park · ${nl(p.station.wind_gem_ms)} m/s in ${d.jaar}</small></li>`).join('')}</ul>
  <h3>Windaanbod ${d.jaar}</h3>
  ${d.percentiel === null ? '<p>Niet te bepalen: te weinig winddata.</p>' : `<p class="atlas-total">Hoger dan ${d.percentiel} % van de windparken die in de Atlas te kiezen zijn.</p>
  <p class="atlas-muted atlas-help">Ongeveer ${Number(d.vollasturen).toLocaleString('nl-NL')} vollasturen met een referentieturbine: één windjaar, uurwind van het KNMI-station omgerekend naar ashoogte. Geen opgave van het park zelf.</p>`}
  <p class="atlas-muted atlas-help">De Atlas toont geen kostprijs van waterstof. De Waterstofscan rekent de productie per elektrolyser uit met vier windjaren in stappen van tien minuten.</p>
  <p class="atlas-actions atlas-noprint"><button id="print" type="button">Afdrukken of opslaan als pdf</button><a id="cta" class="atlas-cta" href="${esc(ctaHref())}">Vraag een Waterstofscan aan</a><button id="terug" type="button" class="atlas-link">Terug naar de keuze</button></p>
 </div>`);
}
function markSelected() {
 profileView = null;
 if (map.getLayer('windparken-gekozen')) map.setFilter('windparken-gekozen', ['in', ['get', 'id'], ['literal', [...selected]]]);
 const line = $('lcoh');
 if (line) line.hidden = true; // een eerder getoonde LCOH hoort bij een andere keuze
}
function togglePark(park) {
 if (!options.some(p => p.id === park.id)) options.push({...park, afstand_km: Math.round(park.afstand_km * 10) / 10});
 if (selected.has(park.id)) selected.delete(park.id); else { selected.add(park.id); track('park'); }
 markSelected(); if (!$('parken')) render(); renderParks(); syncUrl();
}
$('teaser').addEventListener('change', event => {
 const id = Number(event.target.dataset?.id);
 if (!event.target.dataset?.id || !Number.isInteger(id)) return;
 if (event.target.checked) { selected.add(id); track('park'); } else selected.delete(id);
 markSelected(); renderParks(); syncUrl();
});
$('teaser').addEventListener('input', event => {
 if (event.target.id !== 'hubmw') return;
 const chosenParks = options.filter(p => selected.has(p.id));
 renderHub(chosenParks, chosenParks.reduce((sum, p) => sum + p.mw, 0));
});
$('teaser').addEventListener('click', async event => {
 const target = event.target.closest('a,button');
 if (!target) return;
 if (target.id === 'cta') track('cta');
 if (target.id === 'print') window.print();
 if (target.id === 'terug') { profileView = null; render(); }
 if (target.id === 'deel') {
  syncUrl();
  try { await navigator.clipboard.writeText(location.href); target.textContent = 'Link gekopieerd'; }
  catch { target.textContent = 'Kopieer de link uit de adresbalk'; }
  track('link');
 }
});
$('teaser').addEventListener('submit', async event => {
 if (event.target.id !== 'profielform') return;
 event.preventDefault();
 const form = event.target, status = $('profielstatus'), f = new FormData(form);
 status.textContent = 'Profiel maken…';
 try {
  const r = await fetch('/api/atlas/profiel', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
   naam: f.get('naam'), organisatie: f.get('organisatie'), email: f.get('email'), website: f.get('website'), toestemming: f.get('toestemming') === 'on',
   lat: chosen.lat, lon: chosen.lon, perceel: chosen.aanduiding, parken: [...selected], bron: campaign})});
  const d = await r.json();
  if (!r.ok) { status.textContent = d.error || 'Mislukt. Probeer opnieuw.'; return; }
  profileView = d; renderProfile(d);
 } catch { status.textContent = 'Mislukt. Probeer opnieuw.'; }
});
function show(html) { $('teaser').innerHTML = html; $('paneel').hidden = false; }
$('sluit').addEventListener('click', () => { $('paneel').hidden = true; });

// ---------------------------------------------------------------- gedeelde link of windparkpagina openen
async function restore() {
 const point = (params.get('p') || '').split(',').map(Number);
 if (point.length === 2 && point.every(Number.isFinite)) {
  const [lat, lon] = point;
  const wanted = (params.get('w') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger).slice(0, 10);
  map.jumpTo({center: [lon, lat], zoom: 17});
  track('gedeeld');
  await choose(lon, lat, {parks: wanted, shared: true});
  return;
 }
 const parkId = Number(params.get('park'));
 if (params.has('park') && Number.isInteger(parkId)) {
  const f = await parkById(parkId);
  if (f?.properties.knmi) focusPark({id: parkId, naam: f.properties.naam, mw: f.properties.mw, knmi: f.properties.knmi, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]});
 }
}

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
 if (!selected.size) { status.textContent = 'Kies eerst minstens één windpark.'; return; }
 status.textContent = 'Berekenen…';
 try {
  const r = await fetch('/api/atlas/lcoh', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({lat: chosen.lat, lon: chosen.lon, parken: [...selected], password: $('wachtwoord').value})});
  const d = await r.json();
  if (!r.ok) { status.textContent = d.error || 'Mislukt.'; return; }
  status.textContent = '';
  const line = $('lcoh');
  if (line) { line.textContent = `LCOH ${d.lcoh_eur_kg === null ? '–' : '€ ' + nl(d.lcoh_eur_kg, 2)}/kg · ${d.windparken.join(', ')} (${nl(d.P_mw)} MW samen, wind van ${d.stations.join(', ')})`; line.hidden = false; }
 } catch { status.textContent = 'Mislukt. Probeer opnieuw.'; }
});
