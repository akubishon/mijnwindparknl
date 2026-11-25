// Maakt de statische conceptschermen van de Projectstudio (docs/plan-projectstudio-ui.md).
// Alleen voor het ontwerp: de getallen in de grafieken zijn voorbeeldgegevens, geen berekening.
// Gebruik: node docs/projectstudio-concepten/maak-concepten.mjs  (schrijft de .html-bestanden naast dit script)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));

// ------------------------------------------------------------ kaart (assets/kaart.jpg: PDOK BRT grijs, zoom 11)
const Z = 2 ** 11 * 256, X0 = 1052 * 256, Y0 = 664 * 256;
const px = lon => (lon + 180) / 360 * Z - X0;
const py = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Z - Y0; };
const km = (a, b) => { const r = Math.PI / 180, d = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(d)); };
const nl = (v, d = 1) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

const ELEKTROLYSER = { lat: 53.066, lon: 5.531 };
const CHOSEN = [
  { naam: 'Windpark Fryslân', plaats: 'Makkum', lat: 53.003, lon: 5.261, mw: 382.7, turbines: 89, kw: 4300, hub: 115, wake: 5, aandeel: 0.1, model: 'bekend parkmodel', hoogte: 'WINS50' },
  { naam: 'Windpark Beabuorren', plaats: 'Tjerkwerd', lat: 53.051, lon: 5.492, mw: 10.4, turbines: 8, kw: 1300, hub: 60, wake: 2, aandeel: 1, model: 'bekend parkmodel', hoogte: 'WINS50' },
];
// Bestaande parken rond Bolsward uit src/atlas/windparken.geojson (OSM).
const PARKS = [['Windturbines (2)','Bolsward',6,53.069,5.502],['Windturbines (1)','Burgwerd',3,53.08,5.558],['Windturbines (1)','Hichtum',3,53.089,5.522],['Windturbines (3)','Tjerkwerd',9,53.043,5.527],['Windturbines (1)','Wommels',3,53.104,5.561],['Windturbines (2)','Wommels',6,53.098,5.592],['Windturbines (1)','Dedgum',3,53.018,5.492],['Windturbines (1)','Allingawier',3,53.039,5.455],['Windturbines (2)','Kûbaard',6,53.115,5.581],['Windturbines (1)','Arum',3,53.119,5.49],['Windturbines (1)','Parrega',3,53.019,5.472],['Windturbines (8)','Idsegahuizum',24,53.05,5.435],['Windturbines (1)','Witmarsum',3,53.111,5.462],['Windturbines (5)','Kûbaard',15,53.125,5.569],['Windpark A7','Witmarsum',8,53.093,5.435],['Windturbines (2)','Easterein',6,53.094,5.627],['Windturbines (2)','Wons',6,53.062,5.424],['Windturbines (1)','Reahûs',3,53.07,5.652],['Windturbines (1)','Iens',3,53.124,5.608],['Windturbines (2)','Achlum',6,53.14,5.506],['Windturbines (1)','Oudega',3,52.992,5.564],['Windturbines (1)','Gaast',3,53.022,5.427],['Windturbines (1)','Pingjum',3,53.123,5.434],['Windturbines (1)','Tzum',3,53.15,5.531],['Windpark Nij Hiddum-Houw','Cornwerd',41.9,53.094,5.398],['Windturbines (1)','Workum',3,52.984,5.468],['Windturbines (1)','Ferwoude',3,53.002,5.426],['Windturbines (2)','IJlst',6,52.998,5.634],['Windturbines (2)','Harlingen',6,53.155,5.477],['Windturbines (2)','Britswert',6,53.114,5.669],['Windturbines (5)','Wjelsryp',15,53.163,5.585],['Windturbines (2)','Workum',6,52.977,5.425],['Windturbines (4)','Franeker',12,53.181,5.564],['Windpark Riedpolder','Wijnaldum',13.8,53.188,5.476],['Windturbines (5)','Harlingen',15,53.196,5.435],['Windturbines (8)','Warns',24,52.873,5.401],['Windturbines (5)','Menaam',15,53.209,5.636],['Windturbines (1)','Akkrum',3,53.068,5.821],['WindinL','Leeuwarden',7.8,53.194,5.763],['Windturbines (1)','Oudemirdum',3,52.835,5.556]]
  .map(([naam, plaats, mw, lat, lon]) => ({ naam, plaats, mw, lat, lon }));
const STATIONS = [{ naam: 'Stavoren', lat: 52.8967, lon: 5.3833 }, { naam: 'Houtribdijk', lat: 52.6481, lon: 5.4006 }, { naam: 'Leeuwarden', lat: 53.2231, lon: 5.7517 }];

function map({ bbox, cls = '', labels = true, lines = true, others = true, stations = false, ring = null, small = false, h2 = ELEKTROLYSER, chosen = true, view = 800 }) {
  const [w, s, e, n] = bbox, x = px(w), y = py(n), W = px(e) - x, H = py(s) - y, k = W / view;
  const dot = p => 2.5 * k + Math.sqrt(p.mw) * 1.35 * k;
  let o = `<svg class="map ${cls}" viewBox="${x.toFixed(0)} ${y.toFixed(0)} ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Kaart met elektrolyser en windparken"><image href="assets/kaart.jpg" x="0" y="0" width="1536" height="1792"/>`;
  o += `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="#C3E4F2" opacity=".12"/>`;
  if (ring) o += `<circle cx="${px(ring.lon)}" cy="${py(ring.lat)}" r="${ring.r}" fill="#00A6DE" fill-opacity=".06" stroke="#00A6DE" stroke-dasharray="${6 * k} ${4 * k}" stroke-width="${1.5 * k}"/>`;
  if (others) for (const p of PARKS) o += `<circle cx="${px(p.lon)}" cy="${py(p.lat)}" r="${dot(p)}" fill="#00A6DE" fill-opacity=".55" stroke="#0C2340" stroke-width="${0.8 * k}"/>`;
  if (lines && chosen) for (const p of CHOSEN) {
    const a = [px(ELEKTROLYSER.lon), py(ELEKTROLYSER.lat)], b = [px(p.lon), py(p.lat)], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    o += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#0C2340" stroke-width="${2 * k}" stroke-dasharray="${5 * k} ${4 * k}"/>`;
    if (labels && km(ELEKTROLYSER, p) > 6) o += `<g transform="translate(${m[0]} ${m[1]}) scale(${k})"><rect x="-27" y="-11" width="54" height="22" rx="0" fill="#0C2340"/><text x="0" y="4.5" text-anchor="middle" font-size="12" fill="#fff" font-weight="600">${nl(km(ELEKTROLYSER, p))} km</text></g>`;
  }
  if (chosen) for (const p of CHOSEN) o += `<circle cx="${px(p.lon)}" cy="${py(p.lat)}" r="${Math.max(dot(p), 9 * k)}" fill="#F5A800" stroke="#0C2340" stroke-width="${2 * k}"/>`;
  if (stations) for (const st of STATIONS) { const cx = px(st.lon), cy = py(st.lat); o += `<g transform="translate(${cx} ${cy}) scale(${k})"><path d="M0 -10 L9 7 L-9 7Z" fill="${st.naam === 'Leeuwarden' ? '#fff' : '#0C2340'}" stroke="#0C2340" stroke-width="2"/>${labels ? `<text x="13" y="5" font-size="12" font-weight="600" fill="#0C2340" paint-order="stroke" stroke="#fff" stroke-width="3">${st.naam}</text>` : ''}</g>`; }
  if (labels && chosen) for (const p of CHOSEN) o += `<g transform="translate(${px(p.lon)} ${py(p.lat)}) scale(${k})"><text x="${p.mw > 100 ? 0 : -14}" y="${p.mw > 100 ? 44 : 22}" text-anchor="${p.mw > 100 ? 'middle' : 'end'}" font-size="13" font-weight="700" fill="#0C2340" paint-order="stroke" stroke="#fff" stroke-width="4">${p.naam.replace('Windpark ', '')}</text></g>`;
  const s2 = small ? 0.75 : 1;
  o += `<g transform="translate(${px(h2.lon)} ${py(h2.lat)}) scale(${k * s2})"><path d="M-16 -16 H10 Q16 -16 16 -10 V16 H-16Z" fill="#0C2340" stroke="#00A6DE" stroke-width="2.5"/><text x="0" y="5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">H₂</text></g>`;
  return o + '</svg>';
}

// ------------------------------------------------------------ voorbeeldgegevens: aanbod per uur, windjaar 2025
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(2025), gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
const CAP = 48.7, hours = [];
let anom = 0;
for (let h = 0; h < 8760; h++) {
  const d = h / 24, season = 8.1 + 1.9 * Math.cos(2 * Math.PI * (d - 20) / 365), diurnal = 0.5 * Math.sin(2 * Math.PI * ((h % 24) - 9) / 24);
  anom = 0.975 * anom + 0.62 * gauss();
  const v = Math.max(0, season + diurnal + anom * 1.25);
  const p = v < 3 || v > 25 ? 0 : Math.min(1, (v ** 3 - 27) / (12.5 ** 3 - 27));
  hours.push(+(CAP * 0.96 * p).toFixed(2));
}
const mwh = hours.reduce((a, b) => a + b, 0), vollast = mwh / CAP, stil = hours.filter(v => v < CAP * 0.05).length / hours.length;
const sorted = [...hours].sort((a, b) => b - a);
const months = Array.from({ length: 12 }, (_, m) => { const d0 = new Date(Date.UTC(2025, m, 1)), d1 = new Date(Date.UTC(2025, m + 1, 1)); const a = (d0 - Date.UTC(2025, 0, 1)) / 36e5, b = (d1 - Date.UTC(2025, 0, 1)) / 36e5; return hours.slice(a, b).reduce((s, v) => s + v, 0); });
const VARIANTS = [{ id: 'A', naam: 'PEM · 4 × 5,0 MW', opname: 21.8, kleur: '#F5A800' }, { id: 'B', naam: 'Alkalisch · 3 × 10 MW', opname: 32.5, kleur: '#00A6DE' }];
const above = mw => hours.filter(v => v >= mw).length / hours.length;

function heatmap() {
  const W = 730, H = 200, cw = W / 365, ch = H / 24;
  const stops = [[0, [239, 236, 230]], [0.25, [195, 228, 242]], [0.55, [0, 166, 222]], [1, [12, 35, 64]]];
  const col = f => { for (let i = 1; i < stops.length; i++) if (f <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (f - a) / (b - a); return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(',')})`; } return 'rgb(12,35,64)'; };
  let o = `<svg viewBox="-44 -6 ${W + 44} ${H + 34}" class="chart" role="img" aria-label="Aanbod per uur over het jaar (voorbeeld)">`;
  for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) o += `<rect x="${(d * cw).toFixed(2)}" y="${(h * ch).toFixed(2)}" width="${(cw + 0.3).toFixed(2)}" height="${(ch + 0.3).toFixed(2)}" fill="${col(hours[d * 24 + h] / CAP)}"/>`;
  ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'].forEach((m, i) => { const x = (Date.UTC(2025, i, 1) - Date.UTC(2025, 0, 1)) / 864e5 * cw; o += `<line x1="${x}" x2="${x}" y1="${H}" y2="${H + 5}" stroke="#465970"/><text x="${x + 3}" y="${H + 18}" class="ax">${m}</text>`; });
  [0, 6, 12, 18, 24].forEach(h => { o += `<text x="-6" y="${h * ch + 4}" text-anchor="end" class="ax">${String(h).padStart(2, '0')}:00</text>`; });
  return o + '</svg>';
}
function duration({ W = 520, H = 280 } = {}) {
  const L = 44, B = 30, T = 12, x = f => L + f * (W - L - 12), y = v => H - B - v / 50 * (H - B - T);
  const pts = Array.from({ length: 201 }, (_, i) => [i / 200, sorted[Math.min(sorted.length - 1, Math.round(i / 200 * (sorted.length - 1)))]]);
  const line = pts.map(([f, v], i) => `${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(v).toFixed(1)}`).join('');
  let o = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Duurkromme (voorbeeld)">`;
  for (const v of [0, 10, 20, 30, 40, 50]) o += `<line x1="${L}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}" stroke="#dfe5eb"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}</text>`;
  for (const f of [0, .25, .5, .75, 1]) o += `<text x="${x(f)}" y="${H - 10}" text-anchor="middle" class="ax">${f * 100} %</text>`;
  o += `<path d="${line}L${x(1)},${y(0)}L${x(0)},${y(0)}Z" fill="#C3E4F2" opacity=".7"/><path d="${line}" fill="none" stroke="#0C2340" stroke-width="2.5"/>`;
  o += `<line x1="${x(0)}" x2="${x(1)}" y1="${y(CAP)}" y2="${y(CAP)}" stroke="#0C2340" stroke-width="1" opacity=".5"/><text x="${x(1) - 4}" y="${y(CAP) - 6}" text-anchor="end" class="ax">toegewezen ${nl(CAP)} MW</text>`;
  for (const v of VARIANTS) { const f = above(v.opname); o += `<line x1="${x(0)}" x2="${x(1)}" y1="${y(v.opname)}" y2="${y(v.opname)}" stroke="${v.kleur}" stroke-width="2" stroke-dasharray="6 4"/><circle cx="${x(f)}" cy="${y(v.opname)}" r="5" fill="${v.kleur}" stroke="#0C2340" stroke-width="1.5"/><g transform="translate(${x(f) + 10} ${y(v.opname) - 10})"><rect x="0" y="-13" width="152" height="20" fill="#fff" stroke="${v.kleur}"/><text x="7" y="1" class="ax strong">${v.id} vollast ${nl(f * 100, 0)} % van de tijd</text></g>`; }
  o += `<g transform="translate(${x(.3)} ${y(sorted[Math.round(.3 * sorted.length)])})"><circle r="5" fill="#fff" stroke="#0C2340" stroke-width="2"/><g transform="translate(14 -44)"><rect width="168" height="40" fill="#0C2340"/><text x="10" y="16" fill="#C3E4F2" font-size="11">30 % van de tijd minstens</text><text x="10" y="32" fill="#fff" font-size="13" font-weight="700">${nl(sorted[Math.round(.3 * sorted.length)])} MW</text></g></g>`;
  return o + `<text x="${L}" y="9" class="ax">MW</text></svg>`;
}
function monthly({ W = 420, H = 280 } = {}) {
  const L = 44, B = 26, T = 10, max = Math.ceil(Math.max(...months) / 2000) * 2000, bw = (W - L - 12) / 12, y = v => H - B - v / max * (H - B - T);
  let o = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Aanbod per maand (voorbeeld)">`;
  for (let v = 0; v <= max; v += max / 4) o += `<line x1="${L}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}" stroke="#dfe5eb"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${nl(v / 1000, 0)}</text>`;
  months.forEach((v, i) => { const fr = v * 38.3 / 48.7, x = L + i * bw + bw * .18, w = bw * .64; o += `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(fr) - y(v)}" fill="#00A6DE"/><rect x="${x}" y="${y(fr)}" width="${w}" height="${y(0) - y(fr)}" fill="#0C2340"/><text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" class="ax">${'JFMAMJJASOND'[i]}</text>`; });
  return o + `<text x="${L}" y="8" class="ax">GWh</text></svg>`;
}

// ------------------------------------------------------------ iconen (lucide-stijl)
const I = (d, s = 18) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ic = {
  check: I('<path d="M20 6 9 17l-5-5"/>', 14), warn: I('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>', 14),
  save: I('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>', 16), share: I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', 16),
  plus: I('<path d="M12 5v14M5 12h14"/>', 16), trash: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 16), right: I('<path d="m9 18 6-6-6-6"/>', 16), left: I('<path d="m15 18-6-6 6-6"/>', 16),
  down: I('<path d="m6 9 6 6 6-6"/>', 16), search: I('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 16), info: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', 14),
  wind: I('<path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>', 16), more: I('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', 18),
  layers: I('<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>', 16), grid: I('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', 16),
  external: I('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 14), download: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 16),
};

// ------------------------------------------------------------ gedeelde stukken
const STEPS = [
  ['Locatie', 'Bolsward, centrum', 'klaar'], ['Elektrolyser', '2 varianten · 20–30 MW', 'klaar'], ['Windparken', '48,7 MW uit 2 parken', 'klaar'],
  ['KNMI-stations', '1 waarschuwing', 'let'], ['Beschikbaar vermogen', `${nl(vollast, 0)} vollasturen`, 'klaar'], ['Vergelijken', 'nog niet bekeken', 'open'],
];
const stepIcon = (s, i) => s === 'klaar' ? `<span class="dot ok">${ic.check}</span>` : s === 'let' ? `<span class="dot warn">${ic.warn}</span>` : `<span class="dot">${i + 1}</span>`;
const rail = active => `<nav class="rail" aria-label="Stappen"><div class="rail-head"><span class="eyebrow">Project</span><div class="progress"><span style="width:${active >= 4 ? 83 : 50}%"></span></div><small>${active >= 4 ? '5' : '3'} van 6 stappen klaar</small></div><ol>${STEPS.map(([n, sub, st], i) => {
  const s = i === 4 && active < 4 ? 'open' : st, sb = i === 4 && active < 4 ? 'nog niet berekend' : sub;
  return `<li class="${i === active ? 'on' : ''} st-${s}"><a href="#">${stepIcon(i === active && s !== 'let' ? (s === 'klaar' ? 'klaar' : 'open') : s, i)}<span><b>${n}</b><small>${sb}</small></span></a></li>`; }).join('')}</ol>
  <div class="rail-foot"><a href="#">${ic.external} Windparkpagina's</a><a href="#">${ic.download} CSV van het aanbod</a></div></nav>`;
const strip = active => `<nav class="strip" aria-label="Stappen">${STEPS.map(([n, , st], i) => { const s = i === 4 && active < 4 ? 'open' : st; return `<a href="#" class="${i === active ? 'on' : ''} st-${s}">${s === 'klaar' && i !== active ? ic.check : s === 'let' ? ic.warn : i + 1}<span>${n}</span></a>`; }).join('')}</nav>`;
const topbar = (title = 'Bolsward · basis', extra = true) => `<header class="top"><a class="brand" href="#"><span class="mark">mw</span><span>Projectstudio</span><em>intern</em></a>
  ${extra ? `<div class="doc"><b>${title}</b><span class="saved"><i></i>Bewaard · 14:32</span></div><div class="acts"><button class="ghost">${ic.share}<span>Link kopiëren</span></button><button class="cta">${ic.save}<span>Bewaren</span></button><button class="ghost icon" aria-label="Menu">${ic.more}</button></div>` : `<div class="doc"></div><div class="acts"><span class="who">Team mijnwindpark</span><button class="ghost">Uitloggen</button></div>`}</header>`;
const overview = (supply) => `<aside class="overview"><div class="ov-card"><div class="ov-map">${map({ bbox: [5.22, 52.98, 5.6, 53.1], labels: false, small: true, view: 420 })}</div>
  <div class="ov-body"><span class="eyebrow">Projectoverzicht</span><div class="kpis"><div><small>Toegewezen</small><b>48,7<i>MW</i></b></div><div><small>Parken</small><b>2</b></div><div><small>Varianten</small><b>2</b></div><div><small>Stations</small><b>2</b></div></div>
  ${supply ? `<div class="ov-supply"><small>Aanbod 2025</small><b>${nl(mwh / 1000, 1)}<i>GWh</i></b><small>${nl(vollast, 0)} vollasturen · dekking 97,4 %</small></div>` : `<div class="ov-supply empty"><small>Aanbod 2025</small><span>Nog niet berekend</span><button class="mini">Bereken aanbod</button></div>`}
  <div class="todo"><span class="eyebrow">Let op</span><a href="#" class="note warn">${ic.warn}<span><b>Beabuorren</b> · Houtribdijk ligt 40,6 km van het park (meer dan 25 km).</span></a><a href="#" class="note">${ic.info}<span>Vergelijken nog niet bekeken.</span></a></div></div></div></aside>`;
const mobileSummary = supply => `<button class="msum"><span><b>48,7 MW</b> · 2 parken · 2 varianten${supply ? ` · ${nl(mwh / 1000, 0)} GWh` : ''}</span><span class="pill warn">${ic.warn}1</span>${ic.down}</button>`;
const bottomBar = (prev, next, n) => `<div class="bottombar"><button class="ghost dark">${ic.left}<span>${prev}</span></button><small>stap ${n} van 6</small><button class="cta">${next}${ic.right}</button></div>`;
const banner = `<div class="concept">Concept · voorbeeldgegevens, geen berekening</div>`;
const page = (title, body, cls = '') => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="assets/concept.css"></head><body class="${cls}">${body}${banner}</body></html>`;

// ------------------------------------------------------------ concept A: werkbank, stap 3 Windparken
const parkCard = (p, open) => {
  const mw = p.mw * p.aandeel;
  return `<article class="park"><header><span class="swatch"></span><div><h3>${p.naam}</h3><p>${p.plaats} · ${nl(km(ELEKTROLYSER, p))} km van de elektrolyser</p></div><div class="chips"><span class="chip dark">${p.model}</span><span class="chip">${p.hoogte}</span></div><button class="ghost icon dark" aria-label="Park verwijderen">${ic.trash}</button></header>
  <div class="alloc"><div class="alloc-num"><small>Voor de elektrolyser</small><b>${nl(mw)}<i>MW</i></b><span>${nl(p.aandeel * 100, 0)} % van ${nl(p.mw)} MW</span></div>
  <div class="alloc-ctl"><div class="slider"><span class="fill" style="width:${p.aandeel * 100}%"></span><span class="knob" style="left:${p.aandeel * 100}%"></span></div><div class="scale"><span>0</span><span>${nl(p.mw / 2, 0)}</span><span>${nl(p.mw, 1)} MW</span></div></div>
  <div class="stepper"><button>−</button><input value="${nl(mw)}" aria-label="MW"><button>+</button></div></div>
  <details ${open ? 'open' : ''}><summary>Parkgegevens<span>${p.turbines} × ${nl(p.kw / 1000, 1)} MW · ${p.hub} m · zog ${p.wake} %</span>${ic.down}</summary><div class="facts"><label>Turbines<span class="chip">bron</span><input value="${p.turbines}"></label><label>Turbinevermogen<span class="chip">bron</span><input value="${nl(p.kw, 0)} kW"></label><label>Ashoogte<span class="chip">bron</span><input value="${p.hub} m"></label><label>Zogverlies<span class="chip">bron</span><input value="${p.wake} %"></label></div></details>
  <footer><a href="#">Windparkpagina ${ic.right}</a></footer></article>`;
};
const nearby = PARKS.map(p => ({ ...p, km: km(ELEKTROLYSER, p) })).sort((a, b) => b.mw - a.mw).slice(0, 5);
const aBody = `${topbar()}<div class="frame">${rail(2)}<main class="work">${mobileSummary(false)}${strip(2)}
  <div class="head"><span class="eyebrow">Stap 3 van 6</span><h1>Welke windparken leveren?</h1><p>Kies bestaande parken op de kaart of in de lijst. Per park geef je aan hoeveel MW de elektrolyser mag pakken: op elk moment hetzelfde deel van de productie.</p></div>
  <section class="card mapcard">${map({ bbox: [5.17, 52.975, 5.63, 53.11], cls: 'big', view: 880 })}<div class="map-search">${ic.search}<input placeholder="Zoek een park, plaats of gemeente"></div><div class="legend"><span><i class="lg h2"></i>Elektrolyser</span><span><i class="lg chosen"></i>Gekozen park</span><span><i class="lg lg-park"></i>Park (grootte = MW)</span></div><div class="map-tools"><button aria-label="Lagen">${ic.layers}</button></div></section>
  <div class="section-head"><h2>Gekozen parken</h2><div class="total"><small>Totaal toegewezen</small><b>48,7 MW</b></div></div>
  ${CHOSEN.map((p, i) => parkCard(p, i === 1)).join('')}
  <section class="card list"><div class="section-head"><h2>Meer parken in de buurt</h2><div class="seg"><button class="on">Afstand</button><button>Vermogen</button></div></div><ul>${nearby.map(p => `<li><span class="sz" style="--s:${6 + Math.sqrt(p.mw) * 2}px"></span><div><b>${p.naam}</b><small>${p.plaats}</small></div><span class="num">${nl(p.mw)} MW</span><span class="num muted">${nl(p.km)} km</span><button class="add" aria-label="Toevoegen">${ic.plus}</button></li>`).join('')}</ul></section>
  <div class="nav-foot"><button class="ghost dark">${ic.left}Elektrolyser</button><button class="cta big">Verder naar KNMI-stations ${ic.right}</button></div>
</main>${overview(false)}</div>${bottomBar('Elektrolyser', 'KNMI-stations', 3)}`;
writeFileSync(dir + 'concept-a-werkbank.html', page('Concept A · Werkbank', aBody));

// ------------------------------------------------------------ concept A: stap 5 Beschikbaar vermogen
const tiles = [['Aanbod 2025', nl(mwh / 1000, 1), 'GWh', 'uit 48,7 MW toegewezen'], ['Vollasturen', nl(vollast, 0), 'uur', `capaciteitsfactor ${nl(vollast / 87.6, 0)} %`], ['Dekking', '97,4', '%', 'momenten met data van beide stations'], ['Windstil', nl(stil * 100, 0), '%', 'van de tijd onder 5 % vermogen']];
const dBody = `${topbar()}<div class="frame">${rail(4)}<main class="work">${mobileSummary(true)}${strip(4)}
  <div class="head row"><div><span class="eyebrow">Stap 5 van 6</span><h1>Beschikbaar vermogen</h1><p>Het aanbod per tien minuten uit Fryslân en Beabuorren, gemodelleerd met KNMI Houtribdijk + Stavoren. Windjaar 2025.</p></div><button class="ghost dark">${ic.download}CSV</button></div>
  <div class="tiles">${tiles.map(([l, v, u, s], i) => `<div class="tile ${i === 0 ? 'tile-main' : ''}"><small>${l}</small><b>${v}<i>${u}</i></b><span>${s}</span></div>`).join('')}</div>
  <section class="card chartcard"><div class="section-head"><div><h2>Wanneer is er wind?</h2><p class="sub">Elk vakje is één uur: dagen van links naar rechts, uren van boven naar beneden.</p></div><div class="scale-legend"><span>0</span><i></i><span>${nl(CAP)} MW</span></div></div>${heatmap()}</section>
  <div class="two"><section class="card chartcard"><div class="section-head"><div><h2>Duurkromme</h2><p class="sub">Hoe vaak is er minstens een bepaald vermogen? Stippellijnen: opname bij vollast per variant.</p></div></div>${duration()}<div class="vlegend">${VARIANTS.map(v => `<span><i style="background:${v.kleur}"></i><b>Variant ${v.id}</b> ${v.naam} · ${nl(v.opname)} MW</span>`).join('')}</div></section>
  <section class="card chartcard"><div class="section-head"><div><h2>Per maand</h2><p class="sub">Aanbod per park in GWh.</p></div></div>${monthly()}<div class="vlegend"><span><i style="background:#0C2340"></i>Fryslân (38,3 MW)</span><span><i style="background:#00A6DE"></i>Beabuorren (10,4 MW)</span></div></section></div>
  <details class="card more"><summary>Cijfers per park en hoe de studio rekent${ic.down}</summary></details>
  <div class="nav-foot"><button class="ghost dark">${ic.left}KNMI-stations</button><button class="cta big">Verder naar Vergelijken ${ic.right}</button></div>
</main>${overview(true)}</div>${bottomBar('Stations', 'Vergelijken', 5)}`;
writeFileSync(dir + 'concept-a-aanbod.html', page('Concept A · Beschikbaar vermogen', dBody));

// ------------------------------------------------------------ concept B: kaart centraal
const bBody = `${topbar()}<div class="mapstage">${map({ bbox: [4.93, 52.8, 5.85, 53.2], view: 1300, stations: true, ring: { lat: 53.003, lon: 5.261, r: px(5.261 + 0.37) - px(5.261) } })}
  <nav class="pillsteps">${STEPS.map(([n, , st], i) => `<a href="#" class="${i === 3 ? 'on' : ''} st-${st}">${st === 'klaar' && i !== 3 ? ic.check : st === 'let' && i !== 3 ? ic.warn : `<b>${i + 1}</b>`}<span>${n}</span></a>`).join('')}</nav>
  <section class="sheet"><div class="grab"></div><span class="eyebrow light">Stap 4 van 6</span><h1>KNMI-stations</h1><p>De studio stelt per park een station voor. Jij kiest; bij twee stations telt een moment alleen als beide meten.</p>
   <div class="parktabs"><button class="on"><i class="lg chosen"></i>Fryslân</button><button><i class="lg chosen"></i>Beabuorren <span class="pill warn">${ic.warn}</span></button></div>
   <div class="choices"><button class="choice"><small>Voorstel</small><b>Stavoren</b><span>14,4 km · 99 % dekking</span></button><button class="choice on"><small>Alternatief · gekozen</small><b>Houtribdijk + Stavoren</b><span>gemiddelde · −2,6 % momenten</span>${ic.check}</button></div>
   <ul class="stations">${[['Stavoren', 14.4, .99, 7.1, true], ['Houtribdijk', 40.6, .98, 7.6, true], ['De Kooy', 33.2, .97, 6.9, false], ['Vlieland', 34.8, .84, 8.0, false], ['Leeuwarden', 40.9, .99, 5.2, false]].map(([n, k, d, v, on]) => `<li class="${on ? 'on' : ''}"><span class="cb">${on ? ic.check : ''}</span><div><b>${n}</b><small>${nl(k)} km${k > 25 ? ' · verder dan 25 km' : ''}</small></div><div class="cov"><span style="width:${d * 100}%" class="${d < .9 ? 'low' : ''}"></span></div><span class="num">${nl(d * 100, 0)} %</span><span class="num muted">${nl(v)} m/s</span></li>`).join('')}</ul>
   <button class="ghost light wide">Gebruik deze keuze voor alle parken</button>
   <div class="sheet-foot"><button class="ghost light">${ic.left}Windparken</button><button class="cta">Beschikbaar vermogen ${ic.right}</button></div></section>
  <aside class="floatkpi"><div><small>Toegewezen</small><b>48,7 MW</b></div><div><small>Stations</small><b>2</b></div><div class="warnk"><small>Let op</small><b>1</b></div></aside>
  <div class="map-tools fixed"><button aria-label="Lagen">${ic.layers}</button><button>+</button><button>−</button></div>
</div>`;
writeFileSync(dir + 'concept-b-kaart.html', page('Concept B · Kaart centraal', bBody, 'b'));

// ------------------------------------------------------------ concept C: projecten
const projects = [
  { naam: 'Bolsward · basis', plaats: 'Bolsward', bbox: [5.2, 52.96, 5.62, 53.12], mw: '48,7', parken: 2, var: 2, st: 'Aanbod berekend', ok: true, when: 'startinstelling', vast: true },
  { naam: 'Harlingen haven', plaats: 'Harlingen', h2: { lat: 53.172, lon: 5.415 }, bbox: [5.3, 53.1, 5.6, 53.24], mw: '62,0', parken: 3, var: 3, st: 'Aanbod berekend', ok: true, when: '2 uur geleden' },
  { naam: 'Sneek · De Hemmen', plaats: 'Sneek', h2: { lat: 53.03, lon: 5.68 }, bbox: [5.5, 52.98, 5.8, 53.1], mw: '24,5', parken: 2, var: 1, st: '1 waarschuwing', ok: false, when: 'gisteren' },
  { naam: 'Lemmer sluis', plaats: 'Lemmer', h2: { lat: 52.842, lon: 5.712 }, bbox: [5.55, 52.79, 5.85, 52.92], mw: '—', parken: 0, var: 1, st: 'Concept', ok: null, when: '3 dagen geleden' },
  { naam: 'Workum IJsselmeerkust', plaats: 'Workum', h2: { lat: 52.98, lon: 5.445 }, bbox: [5.3, 52.92, 5.6, 53.04], mw: '31,2', parken: 2, var: 2, st: 'Aanbod berekend', ok: true, when: '12 nov' },
];
const cBody = `${topbar('', false)}<main class="home"><section class="hero"><div><span class="eyebrow">Projectstudio</span><h1>Waar komt de volgende elektrolyser?</h1><p>Kies een plek, een elektrolyser en de windparken die leveren. De studio rekent het aanbod en vergelijkt de varianten.</p><div class="hero-acts"><button class="cta big">${ic.plus}Nieuw project</button><button class="ghost dark big">Bolsward openen</button></div></div><div class="hero-map">${map({ bbox: [5.15, 52.93, 5.7, 53.15], labels: false })}</div></section>
  <div class="section-head"><h2>Projecten <span class="count">5</span></h2><div class="tools"><div class="searchbox">${ic.search}<input placeholder="Zoek project"></div><div class="seg"><button class="on">Recent</button><button>Naam</button></div><div class="seg"><button class="on" aria-label="Kaarten">${ic.grid}</button></div></div></div>
  <div class="pgrid">${projects.map(p => `<a class="pcard" href="#"><div class="thumb">${map({ bbox: p.bbox, labels: false, lines: !!p.vast, chosen: !!p.vast, h2: p.h2 || ELEKTROLYSER, view: 420 })}${p.vast ? '<span class="badge">startinstelling</span>' : ''}</div><div class="pbody"><h3>${p.naam}</h3><p>${p.plaats} · ${p.when}</p><div class="pstats"><span><b>${p.mw}</b> MW</span><span><b>${p.parken}</b> parken</span><span><b>${p.var}</b> varianten</span></div><span class="chip ${p.ok ? 'dark' : p.ok === false ? 'warn' : ''}">${p.ok === false ? ic.warn : ''}${p.st}</span></div></a>`).join('')}
  <a class="pcard new" href="#"><span>${ic.plus}</span><b>Nieuw project</b><small>Begin leeg of vanaf Bolsward</small></a></div></main>`;
writeFileSync(dir + 'concept-c-projecten.html', page('Concept C · Projecten', cBody));
console.log('Klaar:', nl(mwh / 1000, 1), 'GWh,', nl(vollast, 0), 'vollasturen, stil', nl(stil * 100, 0), '%');
