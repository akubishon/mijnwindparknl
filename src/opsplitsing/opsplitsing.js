"use strict";
// Elektrolyser opsplitsen: formulier, aanvragen en grafieken zonder externe bibliotheken.

const $ = id => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";
const STORE = "opsplitsing-v2";   // v2: technologiekeuze en EU-standaardwaarden
const COLORS = {one: "#22528F", many: "#0094C6", accent: "#00A6DE", wash: "#C3E4F2", ink: "#0C2340", muted: "#465970"};
const nf = (value, digits = 1) => value == null || !isFinite(value) ? "–"
  : new Intl.NumberFormat("nl-NL", {minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
const pct = (value, digits = 1) => (value > 0 ? "+" : "") + nf(value * 100, digits) + " %";
const label = n => `${n} module${n === 1 ? "" : "s"}`;

let meta = null;
let tech = "pem";
const standard = key => meta.technologieen[tech].waarden[key];
const show = value => nf(value, decimals(value)).replace(/\s|\./g, "");
const SOURCE_CLASS = {"EU LCOH-tool": "eu", "mijnwindpark.nl": "site", "eigen aanname": "own", "plaatshouder": "placeholder"};
let lastResult = null;
let running = false;

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of [].concat(children)) node.append(child);
  return node;
}

function text(x, y, content, attrs = {}) {
  return el("text", {x, y, ...attrs}, [document.createTextNode(content)]);
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}

function save(state) {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* opslag niet beschikbaar */ }
}

// ---------------------------------------------------------------- tooltip

const tooltip = $("tooltip");
function showTip(event, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const box = tooltip.getBoundingClientRect();
  let x = event.clientX + 14, y = event.clientY + 14;
  if (x + box.width > innerWidth - 8) x = event.clientX - box.width - 14;
  if (y + box.height > innerHeight - 8) y = event.clientY - box.height - 14;
  tooltip.style.left = Math.max(8, x) + "px";
  tooltip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { tooltip.hidden = true; };
const swatch = color => `<span class="key ${color === COLORS.one ? "one" : "many"}"></span>`;

// ---------------------------------------------------------------- formulier

function field(item, value) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const id = "f-" + item.key;
  const base = standard(item.key);
  const hint = `${item.uitleg ? item.uitleg + " " : ""}Standaard ${meta.technologieen[tech].naam}: ${nf(base, decimals(base))}.`;
  wrap.innerHTML = `<label for="${id}">${item.label}${item.eenheid ? ` <span class="unit">(${item.eenheid})</span>` : ""}</label>
    <input id="${id}" inputmode="decimal" autocomplete="off" data-key="${item.key}">
    <div class="field-meta"><span class="source ${SOURCE_CLASS[item.bron]}">${item.bron}</span>
      <details class="hint"><summary aria-label="Uitleg bij ${item.label}">ⓘ</summary><p>${hint}</p></details></div>`;
  const input = wrap.querySelector("input");
  input.value = show(value);
  input.addEventListener("input", () => { validate(input); remember(); drawExplainers(); summarise(); });
  validate(input);
  return wrap;
}

function decimals(value) {
  const text = String(value);
  return text.includes(".") ? Math.min(3, text.split(".")[1].length) : 0;
}

function parse(text) {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  return clean === "" || !/^-?\d*\.?\d+$/.test(clean) ? NaN : Number(clean);
}

function item(key) {
  for (const group of meta.groepen) for (const entry of group.velden) if (entry.key === key) return entry;
  return null;
}

function validate(input) {
  const entry = item(input.dataset.key);
  const value = parse(input.value);
  const ok = isFinite(value) && value >= entry.min && value <= entry.max;
  input.setAttribute("aria-invalid", String(!ok));
  input.title = ok ? "" : `Kies ${nf(entry.min, decimals(entry.min))} tot ${nf(entry.max, decimals(entry.max))}`;
  input.classList.toggle("changed", ok && Math.abs(value - standard(entry.key)) > 1e-9);
  return ok;
}

function values() {
  const out = {};
  for (const input of document.querySelectorAll(".field input")) out[input.dataset.key] = parse(input.value);
  return out;
}

function selection() {
  return {
    strategie: document.querySelector("input[name=strategie]:checked")?.value || "verdelen",
    jaren: [...document.querySelectorAll("input[name=jaar]:checked")].map(i => Number(i.value)),
    modules: [...document.querySelectorAll("input[name=modules]:checked")].map(i => Number(i.value)),
  };
}

function remember() {
  const changed = {};
  const current = values();
  for (const [key, value] of Object.entries(current)) {
    if (isFinite(value) && Math.abs(value - standard(key)) > 1e-9) changed[key] = value;
  }
  save({technologie: tech, aannames: changed, ...selection()});
}

function buildForm(state) {
  tech = meta.technologieen[state.technologie] ? state.technologie : "pem";
  $("technologies").replaceChildren(...Object.entries(meta.technologieen).map(([key, entry]) => {
    const labelNode = document.createElement("label");
    labelNode.innerHTML = `<input type="radio" name="technologie" value="${key}"><span><b>${entry.naam}</b></span>`;
    const input = labelNode.querySelector("input");
    input.checked = key === tech;
    input.addEventListener("change", () => switchTechnology(key));
    return labelNode;
  }));
  $("strategies").replaceChildren(...Object.entries(meta.strategieen).map(([key, description]) => {
    const labelNode = document.createElement("label");
    labelNode.innerHTML = `<input type="radio" name="strategie" value="${key}"><span><b>${key[0].toUpperCase() + key.slice(1)}</b><small>${description}</small></span>`;
    labelNode.querySelector("input").checked = key === (state.strategie || "verdelen");
    return labelNode;
  }));
  const checks = (target, name, list, chosen, format) => $(target).replaceChildren(...list.map(value => {
    const labelNode = document.createElement("label");
    labelNode.innerHTML = `<input type="checkbox" name="${name}" value="${value}"> ${format(value)}`;
    labelNode.querySelector("input").checked = chosen.includes(value);
    return labelNode;
  }));
  $("tech-note").textContent = meta.technologieen[tech].toelichting || "";
  checks("years", "jaar", meta.jaren, state.jaren?.length ? state.jaren : meta.jaren, String);
  checks("counts", "modules", meta.modules, state.modules?.length ? state.modules : meta.modules, String);
  const opened = loadOpen();
  $("groups").replaceChildren(...meta.groepen.map(group => {
    const set = document.createElement("details");
    set.className = "group";
    set.dataset.group = group.naam;
    set.open = opened.includes(group.naam);
    set.innerHTML = `<summary><span class="group-name">${group.naam}</span><span class="group-summary"></span></summary>`;
    set.addEventListener("toggle", rememberOpen);
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "text-button";
    reset.textContent = "Standaard";
    reset.addEventListener("click", () => {
      for (const entry of group.velden) {
        const input = $("f-" + entry.key);
        input.value = show(standard(entry.key));
        validate(input);
      }
      remember(); drawExplainers(); summarise();
    });
    const body = document.createElement("div");
    body.className = "group-body";
    body.append(reset);
    for (const entry of group.velden) body.append(field(entry, state.aannames?.[entry.key] ?? standard(entry.key)));
    set.append(body);
    return set;
  }));
  summarise();
}

// Korte samenvatting per dichte categorie: de belangrijkste waarden en hoeveel er is aangepast.
const SUMMARIES = {
  "Installatie": v => [`${nf(v.capaciteit_mw, 0)} MW`],
  "Rendement per module": v => [`minimumlast ${nf(v.minimumlast, 0)} %`, `${nf(v.systeemverbruik_vol)} kWh/kg`, `${nf(v.degradatie_1000h, 2)} %/1000 h`],
  "Bedrijfsvoering": v => [`aan ≥ ${nf(v.min_aan_min, 0)} min`, `startvertraging ${nf(v.startvertraging_min, 0)} min`, `koude start ${nf(v.opstart_koud_min, 0)} min`],
  "Beschikbaarheid": v => [`${nf(v.onderhoud_dagen, 0)} dagen onderhoud`, `${nf(v.storingen_per_jaar, 0)} storingen per jaar`],
  "Slijtage": v => [`stack ${nf(v.stack_levensduur_uur, 0)} h`, `wissel ${nf(v.stackwissel_weken, 0)} weken`],
  "Kosten": v => [`offerte ${nf(v.offerte_meur, 0)} M€ voor ${nf(v.offerte_mw, 0)} MW`, `vast ${nf(v.vaste_kosten_module_meur, 2)} M€ per module`, `stroom ${nf(v.stroomprijs_eur_mwh + v.netkosten_eur_mwh + v.belasting_eur_mwh, 2)} €/MWh`, `rente ${nf(v.rente, 1)} %`],
  "Subsidies en opbrengsten": v => {
    const parts = [];
    if (v.capex_subsidie_eur_kw) parts.push(`subsidie ${nf(v.capex_subsidie_eur_kw, 0)} €/kW`);
    if (v.waterstofpremie_eur_kg) parts.push(`premie ${nf(v.waterstofpremie_eur_kg, 2)} €/kg`);
    if (v.korting_net_belasting_eur_mwh) parts.push(`korting ${nf(v.korting_net_belasting_eur_mwh, 2)} €/MWh`);
    if (v.zuurstofprijs_eur_t) parts.push(`zuurstof ${nf(v.zuurstofprijs_eur_t, 0)} €/t`);
    return parts.length ? parts : ["geen"];
  },
};

function summarise() {
  const v = values();
  for (const set of document.querySelectorAll("details.group")) {
    const inputs = [...set.querySelectorAll(".field input")];
    const changed = inputs.filter(i => i.classList.contains("changed")).length;
    const bad = inputs.filter(i => i.getAttribute("aria-invalid") === "true").length;
    const parts = (SUMMARIES[set.dataset.group] || (() => []))(v).filter(p => !p.includes("–"));
    if (changed) parts.push(`${changed} aangepast`);
    if (bad) parts.push(`${bad} ongeldig`);
    set.querySelector(".group-summary").textContent = parts.join(" · ");
    set.classList.toggle("has-changes", changed > 0);
    set.classList.toggle("has-errors", bad > 0);
  }
}

function loadOpen() {
  try { return JSON.parse(localStorage.getItem(STORE + "-open")) || []; } catch { return []; }
}

function rememberOpen() {
  const open = [...document.querySelectorAll("details.group[open]")].map(d => d.dataset.group);
  try { localStorage.setItem(STORE + "-open", JSON.stringify(open)); } catch { /* opslag niet beschikbaar */ }
}

// ---------------------------------------------------------------- uitleg

// Wisselen zet alle velden op de standaard van die technologie; eigen wijzigingen vervallen.
function switchTechnology(key) {
  const changed = document.querySelectorAll(".field input.changed").length;
  if (changed && !confirm(`Alle velden op de standaardwaarden voor ${meta.technologieen[key].naam} zetten? ${changed} eigen ${changed === 1 ? "wijziging vervalt" : "wijzigingen vervallen"}.`)) {
    document.querySelector(`input[name=technologie][value=${tech}]`).checked = true;
    return;
  }
  buildForm({...selection(), technologie: key, aannames: {}});
  remember();
  drawExplainers();
}

// Spiegelt stack_sec_full, stack_kg_h en draw_mw in opsplitsing.py; v in getoonde eenheden.
function kgPerMWh(x, v, ageing = true) {
  if (x <= 0 || x < v.minimumlast / 100 - 1e-9) return 0;
  const faraday = Math.max(0, 1 - (v.faradayverlies_10 / 100) * 0.1 / x);
  const full = v.systeemverbruik_vol * (1 - v.faradayverlies_10 / 100 * 0.1) / (1 + v.bop_variabel / 100 + v.bop_vast / 100);
  const wear = ageing ? v.degradatie_1000h / 100 * v.stack_levensduur_uur / 1000 / 2 : 0;
  const sec = full * (1 - v.deellastvoordeel / 100 * (1 - x)) * (1 + wear);
  const draw = x * (1 + v.bop_variabel / 100) + v.bop_vast / 100;
  return x * 1000 / sec * faraday / draw;
}

function threshold(size, v) {
  return size * (v.minimumlast / 100 * (1 + v.bop_variabel / 100) + v.bop_vast / 100);
}

function drawExplainers() {
  const v = values();
  if (Object.values(v).some(x => !isFinite(x))) return;
  drawThresholdArt(v);
  drawEfficiency(v);
}

function drawThresholdArt(v) {
  const svg = $("threshold-art");
  const title = svg.querySelector("title");
  const W = 440, H = 220, L = 34, R = 150, T = 14, B = 196;
  const big = threshold(v.capaciteit_mw, v), small = threshold(v.capaciteit_mw / 4, v);
  const top = Math.max(big * 1.8, 4);
  const xs = Array.from({length: 121}, (_, i) => i / 120);
  const wave = x => top * (0.42 + 0.3 * Math.sin(x * 9.5) + 0.18 * Math.sin(x * 23 + 1) + 0.08 * Math.sin(x * 51));
  const px = x => L + x * (W - L - R);
  const py = value => B - Math.max(0, Math.min(top, value)) / top * (B - T);
  const area = cut => {
    const points = xs.map(x => [px(x), py(wave(x) >= cut ? wave(x) : 0)]);
    return `M${px(0)},${B} ` + points.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + ` L${px(1)},${B} Z`;
  };
  svg.replaceChildren(title,
    el("line", {x1: L, x2: px(1), y1: B, y2: B, class: "axis", stroke: "#bcc8d2"}),
    el("path", {d: area(small), fill: COLORS.many, "fill-opacity": .25}),
    el("path", {d: area(big), fill: COLORS.one, "fill-opacity": .35}),
    el("polyline", {points: xs.map(x => `${px(x).toFixed(1)},${py(wave(x)).toFixed(1)}`).join(" "), fill: "none", stroke: COLORS.ink, "stroke-width": 2, "stroke-linejoin": "round"}),
    el("line", {x1: L, x2: px(1), y1: py(big), y2: py(big), stroke: COLORS.one, "stroke-width": 1.5, "stroke-dasharray": "6 4"}),
    el("line", {x1: L, x2: px(1), y1: py(small), y2: py(small), stroke: COLORS.many, "stroke-width": 1.5, "stroke-dasharray": "6 4"}),
    text(px(1) + 8, py(big) + 4, `1 × ${nf(v.capaciteit_mw, 0)} MW: vanaf ${nf(big)} MW`, {fill: COLORS.ink, "font-size": 11}),
    text(px(1) + 8, py(small) + 4, `4 × ${nf(v.capaciteit_mw / 4)} MW: vanaf ${nf(small)} MW`, {fill: COLORS.ink, "font-size": 11}),
    text(px(1) + 8, py(wave(1)) + 4, "windaanbod", {fill: COLORS.muted, "font-size": 11}),
    text(L, B + 18, "tijd →", {fill: COLORS.muted, "font-size": 11}),
    text(L - 6, T + 4, "MW", {fill: COLORS.muted, "font-size": 11, "text-anchor": "end"}));
}

function drawEfficiency(v) {
  const W = 440, H = 220, L = 44, R = 16, T = 30, B = 184;
  const xs = Array.from({length: 101}, (_, i) => i / 100);
  const ys = xs.map(x => kgPerMWh(x, v));
  const top = niceTop(Math.max(...ys, 1) * 1.1);
  const px = x => L + x * (W - L - R), py = y => B - y / top * (B - T);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  for (let y = 0; y <= top; y += top / 4) {
    svg.append(el("line", {x1: L, x2: W - R, y1: py(y), y2: py(y), class: y ? "grid" : "axis"}),
      text(L - 6, py(y) + 4, nf(y, 0), {"text-anchor": "end"}));
  }
  for (const x of [0, .25, .5, .75, 1]) svg.append(text(px(x), B + 16, nf(x * 100, 0) + " %", {"text-anchor": "middle"}));
  svg.append(text(L - 40, T - 16, "kg per MWh", {}), text(W - R, B + 32, "last van de module", {"text-anchor": "end"}));
  const live = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y > 0);
  const minLoad = v.minimumlast / 100;
  svg.append(el("rect", {x: L, y: T, width: px(minLoad) - L, height: B - T, fill: COLORS.wash, "fill-opacity": .6}),
    text(L + 6, T + 14, "onder minimumlast", {fill: COLORS.ink}));
  if (live.length) {
    svg.append(el("polyline", {points: live.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(" "),
      fill: "none", stroke: COLORS.one, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round"}));
    const best = live.reduce((a, b) => b[1] > a[1] ? b : a);
    svg.append(el("circle", {cx: px(best[0]), cy: py(best[1]), r: 4.5, fill: COLORS.one, stroke: "#fff", "stroke-width": 2}),
      text(px(best[0]), py(best[1]) - 10, `${nf(best[1])} kg/MWh bij ${nf(best[0] * 100, 0)} %`, {"text-anchor": best[0] > .7 ? "end" : "middle", class: "label"}));
    const hit = el("rect", {x: L, y: T, width: W - L - R, height: B - T, class: "hit"});
    hit.addEventListener("mousemove", event => {
      const box = hit.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      const y = kgPerMWh(x, v);
      showTip(event, `<b>Last ${nf(x * 100, 0)} %</b><br>${y ? nf(y) + " kg per MWh stroom<br>" + nf(1000 / y) + " kWh per kg" : "Onder de minimumlast: geen productie"}`);
    });
    hit.addEventListener("mouseleave", hideTip);
    svg.append(hit);
  }
  $("efficiency-chart").replaceChildren(svg);
  $("efficiency-caption").textContent = `Gemiddeld over het stackleven. Op vollast ${nf(1000 / kgPerMWh(1, v))} kWh/kg; een nieuwe stack ${nf(1000 / kgPerMWh(1, v, false))} kWh/kg. Volgt de aannames uit stap 2.`;
}

// ---------------------------------------------------------------- grafieken per aantal modules

function frame(rows, top, {bottom = 0, unit = ""} = {}) {
  const format = v => nf(v, digitsFor((top - bottom) / 4));
  const W = 520, H = 260, L = 52, R = 14, T = 22, B = 214;
  const band = (W - L - R) / rows.length;
  const cx = i => L + band * (i + .5);
  const py = y => B - (y - bottom) / (top - bottom) * (B - T);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  for (let i = 0; i <= 4; i++) {
    const y = bottom + (top - bottom) * i / 4;
    svg.append(el("line", {x1: L, x2: W - R, y1: py(y), y2: py(y), class: i ? "grid" : "axis"}),
      text(L - 6, py(y) + 4, format(y), {"text-anchor": "end"}));
  }
  // Bij veel aantallen niet elk label: anders lopen ze door elkaar.
  const every = Math.ceil(rows.length / 16);
  rows.forEach((row, i) => (i % every === 0 || i === rows.length - 1) && svg.append(text(cx(i), B + 16, String(row.modules), {"text-anchor": "middle"})));
  svg.append(text(W - R, B + 34, "aantal modules", {"text-anchor": "end"}), text(L, T - 8, unit));
  return {svg, cx, py, band, L, R, T, B, W};
}

function hover(f, rows, html) {
  rows.forEach((row, i) => {
    const band = el("rect", {x: f.cx(i) - f.band / 2, y: f.T, width: f.band, height: f.B - f.T, class: "hit"});
    band.addEventListener("mousemove", event => showTip(event, html(row, i)));
    band.addEventListener("mouseleave", hideTip);
    f.svg.append(band);
  });
}

// Ronde as met vier gelijke stappen van 1, 2, 2,5 of 5 × 10^n.
function niceScale(low, high) {
  const raw = Math.max(high - low, 1e-9) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(m => m >= raw);
  let bottom = Math.floor(low / step) * step;
  while (bottom + 4 * step < high) bottom += step;
  return {bottom, top: bottom + 4 * step, step};
}
const niceTop = value => niceScale(0, value).top;
const digitsFor = step => step >= 1 ? 0 : step >= .1 ? 1 : 2;

function lineWithRange(target, rows, key, unit, digits) {
  const lows = rows.map(r => Math.min(...Object.values(r.jaren).map(y => y[key])));
  const highs = rows.map(r => Math.max(...Object.values(r.jaren).map(y => y[key])));
  const min = Math.min(...lows), max = Math.max(...highs);
  // Een lijn mag boven nul beginnen; de as maakt dat zichtbaar.
  const scale = niceScale(min - (max - min) * .25, max + (max - min) * .25);
  const f = frame(rows, scale.top, {bottom: scale.bottom, unit});
  rows.forEach((row, i) => f.svg.append(el("line", {x1: f.cx(i), x2: f.cx(i), y1: f.py(lows[i]), y2: f.py(highs[i]), stroke: COLORS.one, "stroke-opacity": .35, "stroke-width": 6, "stroke-linecap": "round"})));
  f.svg.append(el("polyline", {points: rows.map((r, i) => `${f.cx(i)},${f.py(r[key])}`).join(" "), fill: "none", stroke: COLORS.one, "stroke-width": 2, "stroke-linejoin": "round"}));
  const best = key === "lcoh_eur_kg" ? rows.reduce((a, b) => b[key] < a[key] ? b : a) : rows[rows.length - 1];
  rows.forEach((row, i) => {
    f.svg.append(el("circle", {cx: f.cx(i), cy: f.py(row[key]), r: 4.5, fill: COLORS.one, stroke: "#fff", "stroke-width": 2}));
    if (row === best || i === 0) f.svg.append(text(f.cx(i), f.py(highs[i]) - 9, nf(row[key], digits), {"text-anchor": "middle", class: "label"}));
  });
  hover(f, rows, (row, i) => `<b>${label(row.modules)} van ${nf(row.module_mw)} MW</b><br>Gemiddeld ${nf(row[key], digits)} ${unit}<br>Windjaren ${nf(lows[i], digits)} tot ${nf(highs[i], digits)}<br>Benutting aanbod ${nf(row.benutting * 100)} %`);
  $(target).replaceChildren(f.svg);
}

// "Loont niet": ook gratis extra modules maken de kilo niet goedkoper; dan nooit een negatief bedrag tonen.
const pays = row => row.opsplitsen === "loont";
const limitText = (row, digits = 2) => row.opsplitsen == null ? "–" : pays(row) ? nf(row.vaste_kosten_break_even_meur, digits) + " M€" : "loont niet";

function fixedCostChart(rows, assumed) {
  const steps = rows.filter(r => r.vaste_kosten_break_even_meur != null);
  if (!steps.length) { $("capex-chart").textContent = "Kies minstens twee moduleaantallen."; return; }
  const top = niceTop(Math.max(...steps.map(r => pays(r) ? r.vaste_kosten_break_even_meur : 0), assumed) * 1.1);
  const f = frame(steps, top, {unit: "M€ per module"});
  const width = Math.min(24, f.band - 12);
  steps.forEach((row, i) => {
    const value = pays(row) ? row.vaste_kosten_break_even_meur : 0;
    const x = f.cx(i) - width / 2, y = f.py(value), h = f.B - y, r = Math.min(4, h, width / 2);
    f.svg.append(el("path", {d: `M${x},${f.B} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${f.B} Z`,
      fill: pays(row) && row.vaste_kosten_break_even_meur >= assumed ? COLORS.many : COLORS.one}));
    f.svg.append(text(f.cx(i), y - 7, pays(row) ? nf(row.vaste_kosten_break_even_meur, 2) : "loont niet", {"text-anchor": "middle", class: "label", "font-size": pays(row) ? 11 : 9}));
  });
  f.svg.append(el("line", {x1: f.L, x2: f.W - f.R, y1: f.py(assumed), y2: f.py(assumed), stroke: COLORS.ink, "stroke-width": 1.5, "stroke-dasharray": "6 4"}),
    text(f.W - f.R, f.py(assumed) - 6, `aangenomen ${nf(assumed, 2)} M€`, {"text-anchor": "end", class: "label"}));
  hover(f, steps, row => pays(row)
    ? `<b>${label(row.modules)} van ${nf(row.module_mw)} MW</b><br>Lonend tot ${nf(row.vaste_kosten_break_even_meur, 2)} M€ vaste kosten per module
      <br>${row.vaste_kosten_break_even_meur >= assumed ? "Met de aanname goedkoper" : "Met de aanname duurder"} dan ${label(rows[0].modules)} per kilo
      <br>CAPEX nu ${nf(row.capex_meur)} M€`
    : `<b>${label(row.modules)} van ${nf(row.module_mw)} MW</b><br>Loont niet: ook als extra modules niets kosten, is de kilo duurder dan met ${label(rows[0].modules)}.
      <br>Waarom: zie "Waarom wint of verliest" hieronder.`);
  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `<span>${swatch(COLORS.many)} Goedkoper dan ${label(rows[0].modules)}</span><span>${swatch(COLORS.one)} Duurder</span><span><span class="key dash"></span> Aangenomen vaste kosten</span>`;
  $("capex-chart").replaceChildren(legend, f.svg);
}

function stepChart(rows) {
  const steps = rows.slice(1);
  if (!steps.length) { $("step-chart").textContent = "Kies minstens twee moduleaantallen."; return; }
  const top = niceTop(Math.max(...steps.map(r => Math.abs(r.extra_waterstof_t)), 1) * 1.15);
  const f = frame(steps, top, {unit: "ton per jaar"});
  const width = Math.min(24, f.band - 12);
  const biggest = steps.reduce((a, b) => b.extra_waterstof_t > a.extra_waterstof_t ? b : a);
  steps.forEach((row, i) => {
    const value = Math.max(0, row.extra_waterstof_t);
    const x = f.cx(i) - width / 2, y = f.py(value), h = f.B - y, r = Math.min(4, h, width / 2);
    f.svg.append(el("path", {d: `M${x},${f.B} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${f.B} Z`, fill: COLORS.one}));
    if (row === biggest || i === steps.length - 1) f.svg.append(text(f.cx(i), y - 7, nf(row.extra_waterstof_t, 0) + " t", {"text-anchor": "middle", class: "label"}));
  });
  hover(f, steps, (row, i) => {
    const before = rows[i];
    return `<b>${before.modules} → ${row.modules} modules</b><br>${nf(row.extra_waterstof_t, 1)} ton extra (${pct(row.extra_waterstof_t / before.waterstof_t)})<br>Kosten ${row.extra_kosten_meur_jaar >= 0 ? "+" : ""}${nf(row.extra_kosten_meur_jaar, 2)} M€ per jaar`;
  });
  $("step-chart").replaceChildren(f.svg);
}

// Opbrengst per kilo (premie en zuurstof) uit de aannames van de uitkomst, in opgeslagen eenheden.
const revenuePerKg = result => result.aannames.waterstofpremie_eur_kg + result.aannames.zuurstofprijs_eur_t * 8 / 1000;

function table(rows, net) {
  const columns = [
    ["Modules", r => `${r.modules} × ${nf(r.module_mw)} MW`],
    ["Waterstof (t/jaar)", r => nf(r.waterstof_t, 0)],
    ["Benutting aanbod", r => nf(r.benutting * 100) + " %"],
    ["Bedrijfsuren per module", r => nf(r.bedrijfsuren_gem, 0)],
    ["Uren met waterstof", r => nf(r.productie_uur, 0)],
    ["Starts per module (warm / koud)", r => `${nf(r.starts_warm_per_module, 0)} / ${nf(r.starts_koud_per_module, 0)}`],
    ["Stackwissel na (jaar)", r => nf(r.jaren_tot_stackwissel)],
    ["CAPEX (M€)", r => nf(r.capex_meur)],
    ["Maximale CAPEX (M€)", r => nf(r.capex_break_even_meur)],
    ["Max. vaste kosten per module", r => limitText(r)],
    ["Stilstand stackwissel (d/jaar)", r => nf(r.stackwissel_dagen)],
    ["Stroom (M€/jaar)", r => nf(r.stroom_meur_jaar, 2)],
    ["Stack (M€/jaar)", r => nf(r.stack_meur_jaar, 2)],
    ["Kosten (M€/jaar)", r => nf(r.kosten_meur_jaar, 2)],
    ["LCOH (€/kg)", r => nf(r.lcoh_eur_kg, 2)],
    ...(net ? [["Netto (€/kg)", r => nf(r.netto_eur_kg, 2)]] : []),
  ];
  const best = rows.reduce((a, b) => (b.lcoh_eur_kg ?? Infinity) < (a.lcoh_eur_kg ?? Infinity) ? b : a);
  const head = `<caption class="note">Gemiddelden over de gekozen windjaren. De vetgedrukte rij heeft de laagste LCOH.</caption><thead><tr>${columns.map(c => `<th scope="col">${c[0]}</th>`).join("")}</tr></thead>`;
  const body = rows.map(r => `<tr${r === best ? ' class="best"' : ""}>${columns.map(c => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("");
  $("table").innerHTML = head + `<tbody>${body}</tbody>`;
}

// ---------------------------------------------------------------- beste aantal modules

const hours = value => nf(value, 0) + " uur";
const signed = (value, digits, unit) => {
  const rounded = Number(value.toFixed(digits));   // geen "−0" bij een afgerond nulverschil
  return (rounded > 0 ? "+" : rounded < 0 ? "−" : "") + nf(Math.abs(rounded), digits) + unit;
};

function winner(rows) {
  const best = rows.find(r => r.beste) || rows[0];
  const base = rows[0];
  const index = rows.indexOf(best);
  const next = rows[index + 1];
  $("winner-title").textContent = rows.length < 2 ? `Kostprijs per kilo waterstof met ${label(best.modules)}`
    : best === base ? `Opsplitsen loont hier niet: ${label(base.modules)} geeft de laagste kostprijs per kilo`
    : `${label(best.modules)} geeft de laagste kostprijs per kilo waterstof`;
  // Twee tegels naast elkaar: zo is te zien dat de investering stijgt, terwijl de kilo goedkoper wordt.
  const compare = best === base ? (next ? [base, next] : [base]) : [base, best];
  const tile = row => `<div class="${row === best ? "win" : ""}">
      <span>${label(row.modules)} van ${nf(row.module_mw)} MW${row === best ? " · laagste kostprijs" : ""}</span>
      <strong>${nf(row.lcoh_eur_kg, 2)} <small>€ per kilo waterstof</small></strong>
      <dl><dt>Investering</dt><dd>${nf(row.capex_meur, 1)} M€</dd>
        <dt>Kosten per jaar</dt><dd>${nf(row.kosten_meur_jaar, 1)} M€</dd>
        <dt>Waterstof per jaar</dt><dd>${nf(row.waterstof_t, 0)} ton</dd>
        <dt>Uren met waterstof</dt><dd>${hours(row.productie_uur)}</dd></dl></div>`;
  $("winner-compare").innerHTML = compare.map(tile).join("");
  const parts = [];
  if (best !== base) {
    parts.push(`${label(best.modules)} kost <b>${nf(best.capex_meur - base.capex_meur, 1)} M€ meer</b> om te bouwen dan ${label(base.modules)},
      maar maakt <b>${nf(best.waterstof_t - base.waterstof_t, 0)} ton per jaar meer</b> waterstof, omdat de kleine modules vaker draaien
      (${hours(best.productie_uur)} in plaats van ${hours(base.productie_uur)}). Verdeeld over al die extra kilo's is elke kilo
      <b>${nf(base.lcoh_eur_kg - best.lcoh_eur_kg, 2)} € goedkoper</b>.`);
    if (best.marginale_eur_kg != null) parts.push(`De laatste stap naar ${label(best.modules)} levert kilo's van ${nf(best.marginale_eur_kg, 2)} €/kg:
      goedkoper dan het gemiddelde van ${nf(rows[index - 1].lcoh_eur_kg, 2)} €/kg, dus het gemiddelde zakt.`);
  } else if (next) {
    parts.push(`${label(next.modules)} maakt ${nf(next.waterstof_t - base.waterstof_t, 0)} ton per jaar meer waterstof, maar dat weegt niet op
      tegen de ${nf(next.kosten_meur_jaar - base.kosten_meur_jaar, 2)} M€ extra kosten per jaar.`);
  }
  if (next && best !== base) parts.push(next.marginale_eur_kg != null
    ? `Naar ${label(next.modules)} kosten de extra kilo's ${nf(next.marginale_eur_kg, 2)} €/kg: duurder dan ${nf(best.lcoh_eur_kg, 2)} €/kg, dus daar stopt het.`
    : `${label(next.modules)} levert geen extra waterstof meer op.`);
  $("winner-text").innerHTML = parts.join(" ");
  ladder(rows);
}

// Horizontale trap: per stap de kosten van de extra kilo's, met een streepje op het gemiddelde ervoor.
function ladder(rows) {
  const steps = rows.slice(1);
  if (!steps.length) { $("ladder").textContent = "Kies minstens twee moduleaantallen."; $("ladder-legend").innerHTML = ""; return; }
  const average = Math.max(...rows.map(r => r.lcoh_eur_kg ?? 0));
  const known = steps.map(r => r.marginale_eur_kg).filter(v => v != null && v > 0);
  const top = niceTop(Math.min(Math.max(average * 1.3, ...known), average * 3));
  const W = 640, L = 118, R = 150, T = 26, height = steps.length > 12 ? 26 : 40, H = T + steps.length * height + 24;
  const px = v => L + Math.max(0, Math.min(v, top)) / top * (W - L - R);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  const scale = niceScale(0, top);
  for (let v = 0; v <= top + 1e-9; v += scale.step) {
    svg.append(el("line", {x1: px(v), x2: px(v), y1: T - 6, y2: H - 22, class: v ? "grid" : "axis"}),
      text(px(v), H - 6, nf(v, 0), {"text-anchor": "middle"}));
  }
  svg.append(text(W - R + 10, H - 6, "€/kg"), text(W - R + 10, T - 10, "meer waterstof"));
  steps.forEach((row, i) => {
    const before = rows[i], y = T + i * height, mid = y + height / 2;
    const value = row.marginale_eur_kg;
    svg.append(text(L - 10, mid + 4, `${before.modules} → ${row.modules}`, {"text-anchor": "end", class: "on-light", "font-size": 13, "font-weight": row.beste ? 700 : 400}));
    const end = value == null ? px(top) : px(value);
    const w = Math.max(2, end - px(0)), r = Math.min(4, w);
    const pad = height > 30 ? 9 : 5;
    svg.append(el("path", {d: `M${px(0)},${y + pad} H${px(0) + w - r} Q${px(0) + w},${y + pad} ${px(0) + w},${y + pad + r} V${y + height - pad - r} Q${px(0) + w},${y + height - pad} ${px(0) + w - r},${y + height - pad} H${px(0)} Z`,
      fill: row.stap_loont ? COLORS.many : "#a9b6c2"}));
    const mark = px(before.lcoh_eur_kg);
    svg.append(el("line", {x1: mark, x2: mark, y1: y + 4, y2: y + height - 4, stroke: COLORS.ink, "stroke-width": 2}));
    const shownValue = value == null ? "geen extra H₂" : value > top ? `> ${nf(top, 0)} €/kg` : nf(value, 2) + " €/kg";
    // Lange balk: het getal binnen de balk, zodat het niet over de kolom rechts valt.
    const inside = Math.max(end, mark) + 76 > W - R;
    svg.append(inside ? text(end - 6, mid + 4, shownValue, {"text-anchor": "end", class: "on-light", "font-weight": 600})
      : text(Math.max(end, mark) + 6, mid + 4, shownValue, {class: "label"}),
      text(W - R + 10, mid + 4, `${signed(row.extra_productie_uur, 0, " uur")} · ${signed(row.extra_waterstof_t, 0, " t")}`, {class: "on-light", "font-size": 11}));
    const hit = el("rect", {x: 0, y, width: W, height, class: "hit"});
    hit.addEventListener("mousemove", event => showTip(event, `<b>${before.modules} → ${row.modules} modules</b>
      <br>${signed(row.extra_productie_uur, 0, " uur")} per jaar met waterstofproductie
      <br>${signed(row.extra_waterstof_t, 1, " ton")} waterstof per jaar
      <br>${signed(row.extra_kosten_meur_jaar, 2, " M€")} kosten per jaar
      <br>Extra kilo's kosten ${value == null ? "–" : nf(value, 2) + " €/kg"}, gemiddeld was ${nf(before.lcoh_eur_kg, 2)} €/kg
      <br><b>${row.stap_loont ? `Loont: LCOH ${nf(before.lcoh_eur_kg, 2)} → ${nf(row.lcoh_eur_kg, 2)} €/kg` : `Loont niet: LCOH ${nf(before.lcoh_eur_kg, 2)} → ${nf(row.lcoh_eur_kg, 2)} €/kg`}</b>`));
    hit.addEventListener("mouseleave", hideTip);
    svg.append(hit);
  });
  $("ladder-legend").innerHTML = `<span><span class="key cost"></span> Stap loont</span><span><span class="key cost-no"></span> Stap loont niet</span>
    <span><span class="key tick"></span> Gemiddelde kosten per kilo vóór de stap</span>`;
  $("ladder").replaceChildren(svg);
}

// ---------------------------------------------------------------- omslagkaart

let mapToken = 0;

function setupMap(result) {
  mapToken++;
  $("switch-map").replaceChildren();
  $("map-status").textContent = result.rijen.length > 1 ? "" : "Kies minstens twee moduleaantallen.";
  $("map-run").disabled = result.rijen.length < 2;
  $("map-run").onclick = () => loadMap(result);
}

async function loadMap(result) {
  const token = ++mapToken;
  $("map-run").disabled = true;
  $("map-status").innerHTML = '<span class="spinner"></span>Omslagkaart berekenen…';
  try {
    const data = await post("/api/opsplitsing/omslagkaart", {aannames: values(), strategie: result.strategie, jaren: result.jaren,
      modules: result.rijen.map(r => r.modules)});
    if (token !== mapToken) return;
    $("map-status").textContent = "";
    drawMap(data);
  } catch (error) {
    if (token !== mapToken) return;
    $("map-status").textContent = error.message;
  } finally {
    if (token === mapToken) $("map-run").disabled = false;
  }
}

// Eén tint van licht naar donker: meer modules is donkerder. Het getal staat altijd in de cel.
function ramp(t) {
  const a = [0xC3, 0xE4, 0xF2], b = [0x0C, 0x23, 0x40];
  return "#" + a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, "0")).join("");
}

function drawMap(data) {
  const rows = data.minimumlast.length, cols = data.vaste_kosten_meur.length;
  const W = 520, L = 64, R = 10, T = 14, B = 80, cw = (W - L - R) / cols, ch = 38, H = T + rows * ch + B;
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  const tone = n => data.modules.length > 1 ? data.modules.indexOf(n) / (data.modules.length - 1) : 0;
  // Hoogste minimumlast bovenaan.
  const cy = i => T + (rows - 1 - i) * ch;
  data.minimumlast.forEach((m, i) => {
    svg.append(text(L - 8, cy(i) + ch / 2 + 4, nf(m, 0) + " %", {"text-anchor": "end"}));
    data.vaste_kosten_meur.forEach((f, j) => {
      const cell = data.cellen[i][j], x = L + j * cw, y = cy(i);
      if (!cell) { svg.append(el("rect", {x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, fill: "#eef1f4"})); return; }
      const t = tone(cell.beste);
      svg.append(el("rect", {x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 3, fill: ramp(t)}),
        text(x + cw / 2, y + ch / 2 + 5, String(cell.beste), {"text-anchor": "middle", "font-size": 14, "font-weight": 700, class: t > 0.45 ? "on-dark" : "on-light"}));
      const hit = el("rect", {x, y, width: cw, height: ch, class: "hit"});
      hit.addEventListener("mousemove", event => showTip(event, `<b>Minimumlast ${nf(m, 0)} %, vaste kosten ${nf(f, 2)} M€ per module</b>
        <br>Laagste kostprijs per kilo: ${label(cell.beste)}, ${nf(cell.lcoh_eur_kg, 2)} €/kg<br>${label(data.modules[0])}: ${nf(cell.lcoh_een_eur_kg, 2)} €/kg`));
      hit.addEventListener("mouseleave", hideTip);
      svg.append(hit);
    });
  });
  data.vaste_kosten_meur.forEach((f, j) => svg.append(text(L + j * cw + cw / 2, T + rows * ch + 16, nf(f, 2), {"text-anchor": "middle"})));
  svg.append(text(L + (W - L - R) / 2, T + rows * ch + 34, "Vaste kosten per module (M€)", {"text-anchor": "middle", class: "on-light"}),
    text(4, T - 2, "Minimumlast", {class: "on-light"}));
  // Omrand het vak dat het dichtst bij de huidige aannames ligt.
  const nearest = (list, v) => list.reduce((best, x, k) => Math.abs(x - v) < Math.abs(list[best] - v) ? k : best, 0);
  const nx = L + nearest(data.vaste_kosten_meur, data.nu.vaste_kosten_meur) * cw, ny = cy(nearest(data.minimumlast, data.nu.minimumlast));
  svg.append(el("rect", {x: nx - 1, y: ny - 1, width: cw + 2, height: ch + 2, rx: 4, fill: "none", stroke: "#fff", "stroke-width": 6}),
    el("rect", {x: nx - 1, y: ny - 1, width: cw + 2, height: ch + 2, rx: 4, fill: "none", stroke: COLORS.accent, "stroke-width": 3}));
  // Legenda: één blokje per aantal modules.
  const lw = Math.min(46, (W - L - R) / data.modules.length);
  data.modules.forEach((n, k) => {
    const x = L + k * lw, y = H - 38;
    svg.append(el("rect", {x, y, width: lw - 3, height: 16, rx: 2, fill: ramp(tone(n))}),
      text(x + (lw - 3) / 2, y + 12, String(n), {"text-anchor": "middle", "font-size": 11, class: tone(n) > 0.45 ? "on-dark" : "on-light"}));
  });
  svg.append(text(L + data.modules.length * lw + 8, H - 26, "modules", {class: "on-light"}),
    el("rect", {x: L, y: H - 16, width: 22, height: 13, rx: 2, fill: "none", stroke: COLORS.accent, "stroke-width": 2.5}),
    text(L + 30, H - 5, `huidige aannames (${nf(data.nu.minimumlast, 0)} %, ${nf(data.nu.vaste_kosten_meur, 2)} M€) of het dichtstbijzijnde vak`, {class: "on-light"}));
  $("switch-map").replaceChildren(svg);
}

// ---------------------------------------------------------------- scenario

function loadScenario() {
  const changed = document.querySelectorAll(".field input.changed").length;
  if (changed && !confirm(`Het scenario zet alle velden op de waarden voor ${meta.technologieen.alkaline_hoog.naam}. ${changed} eigen ${changed === 1 ? "wijziging vervalt" : "wijzigingen vervallen"}.`)) return;
  buildForm({...selection(), technologie: "alkaline_hoog", aannames: {}, modules: meta.modules.filter(n => n <= 8)});
  remember();
  drawExplainers();
  $("form").requestSubmit();
}

// ---------------------------------------------------------------- opgeslagen scenario's

let shownSaved = null;
let savedList = [];

async function loadSaved() {
  $("saved-status").textContent = "";
  try {
    const response = await fetch("/api/opsplitsing/scenarios");
    if (!response.ok) throw new Error();
    savedList = (await response.json()).scenarios;
    drawSaved(savedList);
  } catch {
    $("saved-status").textContent = "De lijst met opgeslagen scenario's is niet te laden.";
  }
}

const span = counts => counts.length > 2 && counts.every((n, i) => !i || n === counts[i - 1] + 1)
  ? `${counts[0]}–${counts[counts.length - 1]}` : counts.join(", ");

function drawSaved(list) {
  const target = $("saved-list");
  if (!list.length) {
    target.innerHTML = '<div class="saved-empty"><p class="note">Nog geen opgeslagen scenario’s op dit apparaat. Bereken een scenario en kies “Uitkomst bewaren op dit apparaat”.</p></div>';
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = `<caption class="note">${list.length} scenario${list.length === 1 ? "" : "'s"}, nieuwste eerst. "Beste" = het aantal met de laagste kostprijs per kilo waterstof (LCOH).</caption>
    <thead><tr><th scope="col">Scenario</th><th scope="col">Modules</th><th scope="col">Laagste prijs per kilo bij</th>
    <th scope="col">€/kg: 1 module → beste</th><th scope="col">Meer waterstof</th><th scope="col">Gemaakt</th><th scope="col"></th></tr></thead>`;
  const body = document.createElement("tbody");
  for (const item of list) {
    const tr = document.createElement("tr");
    tr.classList.toggle("shown", item.id === shownSaved);
    const cells = [item.naam, span(item.modules), label(item.beste.modules),
      `${nf(item.een_module.lcoh_eur_kg, 2)} → ${nf(item.beste.lcoh_eur_kg, 2)} €/kg`,
      pct(item.beste.waterstof_t / item.een_module.waterstof_t - 1),
      new Date(item.gemaakt).toLocaleString("nl-NL", {dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam"})];
    cells.forEach((value, i) => {
      const td = document.createElement("td");
      td.textContent = value;   // namen komen uit bestanden: als tekst, nooit als HTML
      if (i === 2) td.className = "best-n";
      tr.append(td);
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.textContent = "Toon";
    button.addEventListener("click", () => showSaved(item.id));
    const td = document.createElement("td");
    td.append(button);
    tr.append(td);
    body.append(tr);
  }
  table.append(body);
  target.replaceChildren(table);
}

async function showSaved(id) {
  const status = $("saved-status");
  status.classList.remove("error");
  status.innerHTML = '<span class="spinner"></span>Scenario laden…';
  try {
    const response = await fetch("/api/opsplitsing/scenarios/" + encodeURIComponent(id));
    const stored = await response.json();
    if (!response.ok) throw new Error(stored.error || "Scenario niet gevonden.");
    const result = stored.resultaat;
    // De aannames staan opgeslagen in rekeneenheden (0,4); het formulier toont ze geschaald (40 %).
    const scales = Object.fromEntries(meta.groepen.flatMap(g => g.velden.map(v => [v.key, v.schaal])));
    const aannames = Object.fromEntries(Object.entries(result.aannames).filter(([key]) => key in scales)
      .map(([key, value]) => [key, Math.round(value * scales[key] * 1e6) / 1e6]));
    buildForm({technologie: stored.technologie, strategie: result.strategie, jaren: result.jaren, aannames,
      modules: result.rijen.map(r => r.modules).filter(n => meta.modules.includes(n))});
    remember();
    drawExplainers();
    render({...result, uit_cache: true});
    shownSaved = id;
    status.textContent = `Getoond: ${stored.naam}.`;
    drawSaved(savedList);
    $("results").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

function headline(rows, result) {
  const base = rows[0];
  // Knikpunt: het eerste aantal waarna een extra stap minder dan 1 % waterstof oplevert.
  let knee = base;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].extra_waterstof_t / rows[i - 1].waterstof_t < 0.01) break;
    knee = rows[i];
  }
  const gain = knee.waterstof_t / base.waterstof_t - 1;
  $("headline").innerHTML = `
    <div><span>Knikpunt</span><strong>${label(knee.modules)}</strong><p>Daarna levert een extra module minder dan 1 % waterstof op.</p></div>
    <div><span>Meer waterstof</span><strong>${pct(gain)}</strong><p>${label(knee.modules)} ten opzichte van ${label(base.modules)}: ${nf(knee.waterstof_t - base.waterstof_t, 0)} ton per jaar.</p></div>
    <div><span>Vaste kosten per module</span><strong>${knee.opsplitsen == null ? "–" : pays(knee) ? "≤ " + nf(knee.vaste_kosten_break_even_meur, 2) + " M€" : "Loont niet"}</strong>
      <p>${knee.opsplitsen == null ? `${label(knee.modules)} is de vergelijkingsbasis.`
        : pays(knee) ? `${label(knee.modules)} is per kilo goedkoper dan ${label(base.modules)} zolang een module hooguit dit aan vaste kosten heeft.`
        : `${label(knee.modules)} is per kilo duurder dan ${label(base.modules)}, ook als extra modules niets kosten. Zie de uitsplitsing hieronder.`}
        Nu aangenomen: ${nf(result.aannames.vaste_kosten_module_meur, 2)} M€.</p></div>`;
  const years = result.jaren.join(", ");
  $("result-sub").textContent = `Besturing ‘${result.strategie}’, windjaren ${years}. Aanbod gemiddeld ${nf(Object.values(result.aanbod).reduce((s, a) => s + a.mwh, 0) / result.jaren.length / 1000, 0)} GWh per jaar.`;
}

function render(result) {
  lastResult = result;
  const rows = result.rijen;
  $("results").hidden = false;
  headline(rows, result);
  winner(rows);
  setupMap(result);
  lineWithRange("h2-chart", rows, "waterstof_t", "ton", 0);
  fixedCostChart(rows, result.aannames.vaste_kosten_module_meur);
  const net = revenuePerKg(result) > 0;
  $("lcoh-title").textContent = net ? "Netto kosten per kilo" : "Kosten per kilo (LCOH)";
  $("lcoh-note").textContent = net
    ? `LCOH min premie en zuurstofverkoop (${nf(revenuePerKg(result), 2)} €/kg); de streep toont de spreiding tussen windjaren.`
    : "Met de CAPEX uit de referentieofferte en de vaste kosten per module; de streep toont de spreiding tussen windjaren.";
  lineWithRange("lcoh-chart", rows, net ? "netto_eur_kg" : "lcoh_eur_kg", "€/kg", 2);
  stepChart(rows);
  table(rows, net);
  renderSpeed(result);
  setupWhy(result);
  const others = rows.slice(1).map(r => r.modules);
  $("day-panel").hidden = !others.length;
  if (others.length) {
    const prefer = others.includes(4) ? 4 : others[0];
    $("day-count").replaceChildren(...others.map(n => new Option(label(n), n, false, n === prefer)));
    const day = $("day");
    day.min = `${Math.min(...result.jaren)}-01-01`;
    day.max = `${Math.max(...result.jaren)}-12-31`;
    if (!day.value || day.value < day.min || day.value > day.max) day.value = result.voorbeelddag || day.min;
    runDay();
  }
}

// ---------------------------------------------------------------- dag van dichtbij

const day = {data: null, n: 0, v: null, index: 0, marker: null};

function dayChart(data, n, v) {
  const one = data.configuraties[1] || data.configuraties["1"];
  const many = data.configuraties[n] || data.configuraties[String(n)];
  const steps = one.stappen;
  const W = 1000, H = 300, L = 48, R = 16, T = 16, B = 260;
  const start = steps[0].t, span = steps[steps.length - 1].t + 600 - start;
  const px = t => L + (t - start) / span * (W - L - R);
  const top = niceTop(Math.max(...steps.map(s => s.aanbod), threshold(v.capaciteit_mw, v)));
  const py = y => B - y / top * (B - T);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  for (let i = 0; i <= 4; i++) {
    const y = top * i / 4;
    svg.append(el("line", {x1: L, x2: W - R, y1: py(y), y2: py(y), class: i ? "grid" : "axis"}), text(L - 6, py(y) + 4, nf(y, 0), {"text-anchor": "end"}));
  }
  for (let h = 0; h * 3600 <= span; h += 3) svg.append(text(px(start + h * 3600), B + 18, String(h).padStart(2, "0") + ":00", {"text-anchor": "middle"}));
  svg.append(text(L, T - 4, "MW"));
  const stepLine = (list, value) => list.map(s => `${px(s.t).toFixed(1)},${py(value(s)).toFixed(1)} ${px(s.t + 600).toFixed(1)},${py(value(s)).toFixed(1)}`).join(" ");
  svg.append(el("path", {d: `M${px(start)},${B} L` + stepLine(steps, s => s.aanbod).replace(/ /g, " L") + ` L${px(steps[steps.length - 1].t + 600)},${B} Z`, fill: COLORS.wash, "fill-opacity": .7}));
  const big = threshold(v.capaciteit_mw, v), small = threshold(v.capaciteit_mw / n, v);
  svg.append(el("line", {x1: L, x2: W - R, y1: py(big), y2: py(big), stroke: COLORS.one, "stroke-dasharray": "6 4", "stroke-width": 1.2}),
    el("line", {x1: L, x2: W - R, y1: py(small), y2: py(small), stroke: COLORS.many, "stroke-dasharray": "6 4", "stroke-width": 1.2}));
  svg.append(el("polyline", {points: stepLine(one.stappen, s => s.verbruik), fill: "none", stroke: COLORS.one, "stroke-width": 2, "stroke-linejoin": "round"}),
    el("polyline", {points: stepLine(many.stappen, s => s.verbruik), fill: "none", stroke: COLORS.many, "stroke-width": 2, "stroke-linejoin": "round"}));
  const cursor = el("line", {x1: 0, x2: 0, y1: T, y2: B, stroke: COLORS.ink, "stroke-width": 1, visibility: "hidden"});
  // Gekozen moment voor het rekenvoorbeeld: band over de tien minuten plus stippen op beide lijnen.
  const pick = el("g", {class: "pick"});
  const hit = el("rect", {x: L, y: T, width: W - L - R, height: B - T, class: "hit"});
  const indexAt = event => {
    const box = hit.getBoundingClientRect();
    const t = start + (event.clientX - box.left) / box.width * span;
    const found = steps.findIndex(s => s.t + 600 > t);
    return found < 0 ? steps.length - 1 : found;
  };
  let dragging = false;
  hit.addEventListener("pointerdown", event => { dragging = true; hit.setPointerCapture(event.pointerId); selectStep(indexAt(event)); });
  hit.addEventListener("pointerup", () => { dragging = false; });
  hit.addEventListener("mousemove", event => {
    const i = indexAt(event);
    if (dragging) selectStep(i);
    const a = one.stappen[i], b = many.stappen[i];
    if (!a || !b) return;
    cursor.setAttribute("x1", px(a.t + 300)); cursor.setAttribute("x2", px(a.t + 300)); cursor.setAttribute("visibility", "visible");
    const clock = new Date(a.t * 1000).toLocaleTimeString("nl-NL", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam"});
    const active = s => s.stack.filter(x => x > 0).length, down = s => s.uit.filter(Boolean).length;
    showTip(event, `<b>${clock}</b> · aanbod ${nf(a.aanbod)} MW
      <div class="row">${swatch(COLORS.one)} 1 module: ${nf(a.verbruik)} MW, ${active(a) ? "aan" : "uit"}${down(a) ? " (onderhoud of storing)" : ""}</div>
      <div class="row">${swatch(COLORS.many)} ${n} modules: ${nf(b.verbruik)} MW, ${active(b)} aan${down(b) ? `, ${down(b)} in onderhoud of storing` : ""}</div>`);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); cursor.setAttribute("visibility", "hidden"); });
  const dots = el("g", {class: "pick-dots"});
  svg.insertBefore(pick, svg.querySelector("polyline"));
  svg.append(dots, cursor, hit);
  $("day-chart").replaceChildren(svg);
  day.marker = i => {
    const a = one.stappen[i], b = many.stappen[i];
    pick.replaceChildren(el("rect", {x: px(a.t), y: T, width: Math.max(2, px(a.t + 600) - px(a.t)), height: B - T, class: "pick-band"}));
    dots.replaceChildren(
      el("circle", {cx: px(a.t + 300), cy: py(a.verbruik), r: 5, fill: COLORS.one, stroke: "#fff", "stroke-width": 2}),
      el("circle", {cx: px(b.t + 300), cy: py(b.verbruik), r: 5, fill: COLORS.many, stroke: "#fff", "stroke-width": 2}));
  };
  $("day-legend").innerHTML = `<span><span class="key wash"></span> Windaanbod</span>
    <span>${swatch(COLORS.one)} Verbruik met 1 module</span><span>${swatch(COLORS.many)} Verbruik met ${n} modules</span>
    <span><span class="key dash"></span> Startdrempel: ${nf(big)} MW voor 1 module, ${nf(small)} MW per module bij ${n}</span>`;
  const used = cfg => cfg.stappen.reduce((s, x) => s + x.verbruik / 6, 0);
  const supply = steps.reduce((s, x) => s + x.aanbod / 6, 0);
  $("day-summary").textContent = `${new Date(data.datum + "T12:00:00").toLocaleDateString("nl-NL", {weekday: "long", day: "numeric", month: "long", year: "numeric"})}: `
    + `aanbod ${nf(supply, 0)} MWh. Met 1 module ${nf(used(one), 0)} MWh benut en ${nf(one.waterstof_kg / 1000)} ton waterstof; `
    + `met ${n} modules ${nf(used(many), 0)} MWh en ${nf(many.waterstof_kg / 1000)} ton.`;
}

async function post(url, body) {
  const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => ({error: "Onverwacht antwoord van de server."}));
  if (!response.ok) throw new Error(data.error || "Aanvraag mislukt.");
  return data;
}

async function runDay() {
  const n = Number($("day-count").value);
  const v = values();
  $("day-status").innerHTML = '<span class="spinner"></span>Dag berekenen…';
  $("day-status").classList.remove("error");
  try {
    const data = await post("/api/opsplitsing/dag", {aannames: v, strategie: selection().strategie, datum: $("day").value, modules: [1, n]});
    dayChart(data, n, v);
    Object.assign(day, {data, n, v});
    const slider = $("step");
    slider.max = String(data.wind.length - 1);
    selectStep(interestingStep(data, n));
    $("day-status").textContent = "";
  } catch (error) {
    $("day-status").textContent = error.message;
    $("day-status").classList.add("error");
  }
}

async function submit(event) {
  event.preventDefault();
  if (running) return;
  const inputs = [...document.querySelectorAll(".field input")];
  const bad = inputs.filter(input => !validate(input));
  const pick = selection();
  const status = $("status");
  status.classList.remove("error");
  if (bad.length) {
    status.textContent = `Controleer ${bad.length === 1 ? "het rood gemarkeerde veld" : bad.length + " rood gemarkeerde velden"}.`;
    status.classList.add("error");
    // Een dichte categorie verbergt het rode veld; open die eerst.
    for (const input of bad) input.closest("details.group").open = true;
    summarise();
    bad[0].focus();
    return;
  }
  if (!pick.jaren.length || !pick.modules.length) {
    status.textContent = "Kies minstens één windjaar en één moduleaantal.";
    status.classList.add("error");
    return;
  }
  running = true;
  $("run").disabled = true;
  const began = performance.now();
  status.innerHTML = '<span class="spinner"></span>Rekenen… De eerste keer haalt de server de windjaren bij KNMI op; daarna komen ze uit de lokale opslag.';
  try {
    const result = await post("/api/opsplitsing", {aannames: values(), ...pick});
    render(result);
    status.textContent = `Klaar in ${nf((performance.now() - began) / 1000)} s.`;
    $("results").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    running = false;
    $("run").disabled = false;
  }
}

async function start() {
  try {
    const response = await fetch("/api/opsplitsing/aannames");
    if (!response.ok) throw new Error();
    meta = await response.json();
  } catch {
    $("status").textContent = "Start de Python-server (python3 -m windprofiel.server) en open deze pagina via http://127.0.0.1:8000/opsplitsing.";
    $("status").classList.add("error");
    return;
  }
  buildForm(load());
  drawExplainers();
  renderSpeed(null);
  $("form").addEventListener("submit", submit);
  $("form").addEventListener("change", remember);
  $("reset").addEventListener("click", () => {
    buildForm({...selection(), technologie: tech, aannames: {}});
    remember();
    drawExplainers();
  });
  $("day-run").addEventListener("click", runDay);
  $("scenario-run").addEventListener("click", loadScenario);
  $("saved-refresh").addEventListener("click", loadSaved);
  loadSaved();
  $("step").addEventListener("input", event => selectStep(Number(event.target.value)));
  $("day-count").addEventListener("change", runDay);
  addEventListener("scroll", hideTip, {passive: true});
}

start();

// ---------------------------------------------------------------- rekenvoorbeeld van één moment

const clockOf = t => new Date(t * 1000).toLocaleTimeString("nl-NL", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam"});
const cfg = (data, n) => data.configuraties[n] || data.configuraties[String(n)];

// Begin bij een moment waarop één module stilstaat en meerdere modules wel draaien: daar zit het verschil.
function interestingStep(data, n) {
  const one = cfg(data, 1).stappen, many = cfg(data, n).stappen;
  const gaps = one.map((s, i) => ({i, gap: many[i].kg.reduce((a, b) => a + b, 0) - s.kg.reduce((a, b) => a + b, 0)}));
  const off = gaps.filter(g => one[g.i].verbruik === 0 && g.gap > 0);
  return (off.length ? off[Math.floor(off.length / 2)] : gaps.reduce((a, b) => b.gap > a.gap ? b : a)).i;
}

function selectStep(i) {
  if (!day.data) return;
  day.index = Math.max(0, Math.min(day.data.wind.length - 1, i));
  $("step").value = String(day.index);
  $("step-time").textContent = `${clockOf(cfg(day.data, 1).stappen[day.index].t)}–${clockOf(cfg(day.data, 1).stappen[day.index].t + 600)}`;
  day.marker?.(day.index);
  renderWalk();
}

function moduleBars(step, size, color) {
  const n = step.stack.length, W = 260, gap = 4, w = Math.min(40, (W - gap * (n - 1)) / n), H = 46;
  const svg = el("svg", {viewBox: `0 0 ${W} ${H + 14}`, class: "module-bars", "aria-hidden": "true"});
  step.stack.forEach((x, i) => {
    const left = i * (w + gap), fill = x / size;
    svg.append(el("rect", {x: left, y: 0, width: w, height: H, fill: step.uit[i] ? "#EFECE6" : "#fff", stroke: "#bcc8d2"}));
    if (step.uit[i]) svg.append(el("line", {x1: left, y1: H, x2: left + w, y2: 0, stroke: COLORS.muted}));
    if (fill > 0) svg.append(el("rect", {x: left + 1, y: H - fill * (H - 2) - 1, width: w - 2, height: fill * (H - 2), fill: color, "fill-opacity": step.opstart_min[i] ? .45 : 1}));
    if (n <= 16) svg.append(text(left + w / 2, H + 12, step.uit[i] ? "uit" : nf(fill * 100, 0) + "%", {"text-anchor": "middle", "font-size": 9}));
  });
  return svg;
}

function windSpark(data, index) {
  const W = 260, H = 70, T = 6, B = 62;
  const series = Object.keys(data.stations);
  const all = data.wind.flatMap(w => series.map(key => w.knmi[key]).filter(v => v != null));
  const top = niceTop(Math.max(...all, 1));
  const px = i => i / (data.wind.length - 1) * W, py = v => B - v / top * (B - T);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, class: "spark", "aria-hidden": "true"});
  svg.append(el("line", {x1: 0, x2: W, y1: B, y2: B, class: "axis"}));
  series.forEach((key, k) => {
    const color = k ? COLORS.many : COLORS.one;
    // Meetgaten onderbreken de lijn.
    let path = "", pen = false;
    data.wind.forEach((w, i) => {
      const v = w.knmi[key];
      if (v == null) { pen = false; return; }
      path += `${pen ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)} `;
      pen = true;
    });
    svg.append(el("path", {d: path, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round"}));
    const v = data.wind[index].knmi[key];
    if (v != null) svg.append(el("circle", {cx: px(index), cy: py(v), r: key === data.wind[index].gekozen ? 5.5 : 3.5, fill: color, stroke: "#fff", "stroke-width": 2}));
  });
  svg.append(el("line", {x1: px(index), x2: px(index), y1: T, y2: B, stroke: COLORS.ink, "stroke-width": 1}));
  return svg;
}

function renderWalk() {
  const {data, n, v, index} = day;
  const wind = data.wind[index];
  const one = cfg(data, 1), many = cfg(data, n);
  const a = one.stappen[index], b = many.stappen[index];
  const share = data.aandeel_fryslan;
  const parks = Object.keys(data.parken);
  const stations = Object.keys(data.stations);
  const sumKg = s => s.kg.reduce((x, y) => x + y, 0);
  const kWh = (x, size) => x > 0 ? (x * (1 + v.bop_variabel / 100) + v.bop_vast / 100 * size) * 1000 / 6 : 0;

  const card = (letter, title, body) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="flow-n">${letter}</span><h4>${title}</h4>`;
    for (const part of [].concat(body)) typeof part === "string" ? li.insertAdjacentHTML("beforeend", part) : li.append(part);
    return li;
  };
  const windLine = park => {
    const w = wind[park];
    return `<p class="calc"><b>${data.parken[park]}</b><br>${nf(w.v10)} × (${w.ashoogte}/10)<sup>${nf(w.alpha, 3)}</sup> = <b>${nf(w.v_as)} m/s</b> op ${w.ashoogte} m<br>
      − ${nf(w.zog * 100, 0)} % zog = ${nf(w.v_turbine)} m/s → ${nf(w.turbine_kw, 0)} kW per turbine<br>
      × ${w.turbines} turbines = <b>${nf(w.mw)} MW</b></p>`;
  };
  const deploy = (config, step, color, count) => {
    const size = config.module_mw;
    const active = step.stack.filter(x => x > 0).length;
    const reason = step.redenen.length ? `<br><span class="why">${step.redenen.join("; ")}</span>` : "";
    const verdict = active ? `${active} van ${count} ${active === 1 ? "draait" : "draaien"} op ${nf(step.stack.find(x => x > 0) / size * 100, 0)} % last` : "Staat stil";
    const box = document.createElement("div");
    box.className = "deploy";
    box.innerHTML = `<p class="calc"><b>${label(count)} van ${nf(size)} MW</b><br>Startdrempel ${nf(config.drempel_mw)} MW per module
      (${nf(v.minimumlast, 0)} % last + BoP). Er passen er ${step.passen}; de besturing kiest ${step.gewenst}${step.gewenst < step.passen && selection().strategie === "verdelen" ? ", omdat dat de meeste waterstof geeft" : ""}. ${verdict}.${reason}</p>`;
    box.append(moduleBars(step, size, color));
    return box;
  };
  const produce = (config, step, count) => {
    const size = config.module_mw;
    const lines = step.stack.map((x, i) => ({x, kg: step.kg[i], start: step.opstart_min[i]})).filter(m => m.x > 0);
    if (!lines.length) return `<p class="calc"><b>${label(count)}</b>: geen productie.</p>`;
    const m = lines[0];
    const spec = m.kg ? kWh(m.x, size) / m.kg : null;
    const startNote = lines.some(l => l.start) ? ` Opstarten kost ${nf(Math.max(...lines.map(l => l.start)), 0)} min productie.` : "";
    const many = lines.length > 1;
    return `<p class="calc"><b>${label(count)}</b>${many ? `, per module` : ""}<br>${nf(m.x)} MW stack + BoP, 10 min = ${nf(kWh(m.x, size), 0)} kWh
      ${spec ? `<br>÷ ${nf(spec, 1)} kWh/kg bij ${nf(m.x / size * 100, 0)} % last = <b>${nf(m.kg)} kg</b>` : "<br>Nog aan het opstarten: 0 kg"}${many ? `<br>× ${lines.length} modules = <b>${nf(sumKg(step))} kg</b>` : ""}.${startNote}</p>`;
  };
  const year = lastResult && (() => {
    const rowOf = k => lastResult.rijen.find(r => r.modules === k);
    const r1 = rowOf(1), rn = rowOf(n);
    return r1 && rn ? `<p class="calc">Een jaar heeft ${nf(52560, 0)} van zulke stappen. Gemiddeld over de windjaren:
      <b>${nf(r1.waterstof_t, 0)} t</b> met 1 module, <b>${nf(rn.waterstof_t, 0)} t</b> met ${n}. Kosten per kilo
      ${nf(r1.lcoh_eur_kg, 2)} en ${nf(rn.lcoh_eur_kg, 2)} € (stap 3).</p>` : "";
  })();

  const legend = `<p class="legend small">${stations.map((key, k) => `<span>${swatch(k ? COLORS.many : COLORS.one)} ${data.stations[key]}</span>`).join("")}</p>`;
  const measured = stations.map(key => `${data.stations[key]} ${wind.knmi[key] == null ? "geen meting" : `<b>${nf(wind.knmi[key])} m/s</b>`}`).join(" · ");
  $("walk").replaceChildren(
    card("A", "KNMI-wind op 10 m", [legend, windSpark(data, index),
      `<p class="calc">${measured}<br>Fryslân: de hoogste, <b>${nf(wind.fryslan.v10)} m/s</b> van ${data.stations[wind.gekozen]}.
       <br>Beabuorren: Stavoren, <b>${nf(wind.beabuorren.v10)} m/s</b>.</p>
       <p class="note">Tienminutengemiddelden van het KNMI. Voor Fryslân past de hoogste lijn beter bij wat het park zelf levert dan één station.</p>`]),
    card("B", "Wind op ashoogte en parkvermogen", parks.map(windLine)),
    card("C", "Aanbod voor de elektrolyser", `<p class="calc">${nf(share, 1)} × ${nf(wind.fryslan.mw)} + ${nf(wind.beabuorren.mw)}<br><b class="big">= ${nf(a.aanbod)} MW</b></p>
      <p class="note">10 % van Windpark Fryslân plus heel Beabuorren, zoals op mijnwindpark.nl.</p>`),
    card("D", "Modules inzetten", [deploy(one, a, COLORS.one, 1), deploy(many, b, COLORS.many, n)]),
    card("E", "Waterstof in deze tien minuten", [produce(one, a, 1), produce(many, b, n)]),
    card("F", "Optellen", `<p class="calc">Dit moment: <b>${nf(sumKg(a))} kg</b> met 1 module, <b>${nf(sumKg(b))} kg</b> met ${n}.</p>
      <p class="calc">De hele dag, ${nf(data.wind.length, 0)} stappen: <b>${nf(one.waterstof_kg / 1000, 2)} t</b> en <b>${nf(many.waterstof_kg / 1000, 2)} t</b>.</p>${year}`),
  );
}

// ---------------------------------------------------------------- hoe kan dit zo snel?

function renderSpeed(result) {
  const years = result ? result.jaren.length : selection().jaren.length || meta.jaren.length;
  const counts = result ? result.rijen.map(r => r.modules) : (selection().modules.length ? selection().modules : meta.modules);
  const steps = result?.omvang?.tijdstappen ?? years * 52560;
  const modules = counts.reduce((a, b) => a + b, 0);
  const total = steps * modules;
  const cores = result?.omvang?.processen;
  const timing = !result ? "Nog niet berekend."
    : result.uit_cache ? `Laatste berekening: ${nf(result.rekentijd_s, 2)} s, uit de cache. De eerste keer kostte ${nf(result.eerste_rekentijd_s, 1)} s.`
    : `Laatste berekening: ${nf(result.rekentijd_s, 1)} s, nieuw uitgerekend.`;
  $("speed-body").innerHTML = `
    <div class="sum">
      <div><strong>${nf(years, 0)}</strong><span>windjaren</span></div><i>×</i>
      <div><strong>${nf(steps / years, 0)}</strong><span>tijdstappen van 10 min per jaar, met meting</span></div><i>×</i>
      <div><strong>${nf(modules, 0)}</strong><span>modules in ${counts.length} configuraties</span></div><i>=</i>
      <div class="total"><strong>${nf(total / 1e6, 1)} mln</strong><span>keer: één module, één moment</span></div>
    </div>
    <p>Per module en per moment is het rekenwerk klein: aanbod verdelen, minimumlast controleren, kilo's uitrekenen en
      slijtage optellen. Dat zijn een paar tientallen rekenstappen; een computer doet er honderden miljoenen per seconde.</p>
    <ul class="reasons">
      <li><b>Wind één keer ophalen.</b> Elk windjaar komt in één KNMI-aanvraag binnen en wordt als aanbod bewaard.</li>
      <li><b>Keuzes onthouden.</b> Hoeveel modules het beste draaien bij een bepaald aanbod, wordt één keer uitgerekend en daarna opgezocht.</li>
      <li><b>Werk verdelen.</b> Elke combinatie van windjaar en configuratie is een losse taak, verdeeld over ${cores ? cores : "alle"} processorkernen.</li>
      <li><b>Uitkomsten bewaren.</b> Dezelfde aannames nog eens? Dan komt de uitkomst direct uit de cache.</li>
    </ul>
    <p class="note">${timing}</p>`;
}

// ---------------------------------------------------------------- waarom wint N modules?

const PARTS = [
  ["meer_waterstof", "Meer waterstof", "De vaste kosten worden over meer kilo's verdeeld."],
  ["duurdere_installatie", "Duurdere installatie", "Extra vaste kosten per module (gelijkrichter, transformator, besturing)."],
  ["stroom_per_kilo", "Stroom per kilo", "Rendement bij de gekozen last, vaste BoP per module, warmhouden en opstartverlies."],
  ["stackvervanging", "Stackvervanging", "Slijtage door bedrijfsuren en starts."],
];
let whyToken = 0;

function setupWhy(result) {
  const rows = result.rijen;
  const select = $("why-n");
  const others = rows.slice(1);
  document.querySelector(".why").hidden = !others.length;
  if (!others.length) return;
  const cheapest = rows.reduce((a, b) => (b.lcoh_eur_kg ?? Infinity) < (a.lcoh_eur_kg ?? Infinity) ? b : a);
  const chosen = cheapest === rows[0] ? others[0].modules : cheapest.modules;
  select.replaceChildren(...others.map(r => new Option(label(r.modules), r.modules, false, r.modules === chosen)));
  select.onchange = () => drawWhy(result, Number(select.value));
  $("why-base").textContent = label(rows[0].modules);
  drawWhy(result, chosen);
}

// Horizontale balken rond nul: rechts helpt het N modules, links niet.
function divergingBars(items, {height = 30, labelWidth = 170, marker = null} = {}) {
  const W = 520, L = labelWidth, R = 64, T = 22, H = T + items.length * height + 26;
  // Ruimte naast de balken voor de waardelabels, zodat ze nooit over de namen links vallen.
  const extent = Math.max(...items.flatMap(i => [Math.abs(i.from ?? 0), ...(i.segments || []).map(g => Math.abs(g.to)), Math.abs(i.to)]), 0.001) * 1.5;
  const px = v => L + (v + extent) / (2 * extent) * (W - L - R);
  const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true"});
  svg.append(el("line", {x1: px(0), x2: px(0), y1: T - 6, y2: H - 22, class: "axis"}),
    text(px(0) - 6, T - 8, "← nadeel", {"text-anchor": "end"}), text(px(0) + 6, T - 8, "voordeel →"),
    text(px(0), H - 6, "€/kg voor N modules", {"text-anchor": "middle"}));
  if (marker != null) {
    svg.append(el("line", {x1: px(marker), x2: px(marker), y1: T - 2, y2: H - 22, stroke: COLORS.ink, "stroke-dasharray": "4 3"}),
      text(px(marker), H - 22 + 12, `nu ${nf(marker, 3)}`, {"text-anchor": marker < 0 ? "end" : "start", class: "label", "font-size": 10}));
  }
  items.forEach((item, i) => {
    const y = T + i * height, from = item.from ?? 0;
    const x1 = px(Math.min(from, item.to)), x2 = px(Math.max(from, item.to));
    svg.append(text(L - 10, y + height / 2 + 4, item.label, {"text-anchor": "end", fill: COLORS.ink, "font-size": 12}));
    for (const segment of item.segments || [{from, to: item.to, color: item.to >= from ? COLORS.many : COLORS.one}]) {
      const a = px(Math.min(segment.from, segment.to)), b = px(Math.max(segment.from, segment.to));
      svg.append(el("rect", {x: a, y: y + 7, width: Math.max(1.5, b - a), height: height - 14, rx: 3, fill: segment.color}));
    }
    if (item.value != null) svg.append(text(item.to >= from ? x2 + 6 : x1 - 6, y + height / 2 + 4, item.value, {"text-anchor": item.to >= from ? "start" : "end", class: "label"}));
    const hit = el("rect", {x: 0, y, width: W, height, class: "hit"});
    hit.addEventListener("mousemove", event => showTip(event, item.tip));
    hit.addEventListener("mouseleave", hideTip);
    svg.append(hit);
  });
  return svg;
}

function drawWhy(result, n) {
  const rows = result.rijen, base = rows[0], row = rows.find(r => r.modules === n);
  const parts = row.uitsplitsing;
  for (const span of document.querySelectorAll(".why-n-label")) span.textContent = label(n);
  const advantage = base.lcoh_eur_kg - row.lcoh_eur_kg;
  $("why-total").innerHTML = `${label(base.modules)}: <b>${nf(base.lcoh_eur_kg, 3)} €/kg</b> · ${label(n)}: <b>${nf(row.lcoh_eur_kg, 3)} €/kg</b>.
    ${advantage >= 0 ? `${label(n)} is <b>${nf(advantage, 3)} €/kg goedkoper</b>.` : `${label(n)} is <b>${nf(-advantage, 3)} €/kg duurder</b>.`}
    De balken tellen precies op tot dat verschil.`;
  const sign = v => (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v), 3);
  $("waterfall").replaceChildren(divergingBars(PARTS.map(([key, name, why]) => {
    const value = -parts[key];   // voordeel voor N: lagere kosten per kilo is positief
    const extra = key === "stroom_per_kilo" ? `<br>${nf(parts.kwh_per_kg[0], 1)} → ${nf(parts.kwh_per_kg[1], 1)} kWh per kg` : "";
    return {label: name, to: value, value: sign(value),
      tip: `<b>${name}</b><br>${why}${extra}<br>${value >= 0 ? "Voordeel" : "Nadeel"} voor ${label(n)}: ${nf(Math.abs(value), 3)} €/kg`};
  })));
  loadSensitivity(result, n);
}

async function loadSensitivity(result, n) {
  const token = ++whyToken;
  const status = $("tornado-status");
  status.classList.remove("error");
  status.innerHTML = '<span class="spinner"></span>Gevoeligheid berekenen… elke aanname wordt twee keer doorgerekend; de eerste keer duurt dit even.';
  $("tornado").replaceChildren();
  $("tornado-legend").innerHTML = "";
  try {
    const data = await post("/api/opsplitsing/gevoeligheid", {aannames: values(), strategie: result.strategie, jaren: result.jaren, n});
    if (token !== whyToken) return;
    status.innerHTML = "";
    drawTornado(data, n);
  } catch (error) {
    if (token !== whyToken) return;
    status.textContent = error.message;
    status.classList.add("error");
  }
}

function drawTornado(data, n) {
  const items = data.aannames.slice(0, 10);
  if (!items.length) { $("tornado").textContent = "Geen aannames om te variëren."; return; }
  const base = data.voordeel;
  const unit = i => i.eenheid && !i.eenheid.startsWith("%") ? " " + i.eenheid : i.eenheid === "%" ? " %" : "";
  const value = (i, end) => nf(end.waarde, Math.abs(end.waarde) < 10 ? 2 : 0) + unit(i);
  $("tornado").replaceChildren(divergingBars(items.map(i => ({
    label: i.label, from: base, to: Math.abs(i.hoog.voordeel - base) >= Math.abs(i.laag.voordeel - base) ? i.hoog.voordeel : i.laag.voordeel,
    segments: [{from: base, to: i.laag.voordeel, color: COLORS.one}, {from: base, to: i.hoog.voordeel, color: COLORS.many}],
    tip: `<b>${i.label}</b> (nu ${nf(i.nu, Math.abs(i.nu) < 10 ? 2 : 0)}${unit(i)})
      <div class="row">${swatch(COLORS.one)} ${value(i, i.laag)}: voordeel ${nf(i.laag.voordeel, 3)} €/kg</div>
      <div class="row">${swatch(COLORS.many)} ${value(i, i.hoog)}: voordeel ${nf(i.hoog.voordeel, 3)} €/kg</div>
      ${i.soort === "kosten" ? "Kostenaanname: zelfde simulatie, andere kosten." : "Bedrijfsvoering: opnieuw gesimuleerd."}`,
  })), {marker: base}));
  const top = items[0];
  const signed = v => (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v), 3);
  $("tornado-legend").innerHTML = `<span>${swatch(COLORS.one)} Aanname 25 % lager</span><span>${swatch(COLORS.many)} 25 % hoger</span>`;
  $("tornado-status").innerHTML = `<span class="heaviest">Het zwaarst weegt: <b>${top.label}</b>. Bij ${value(top, top.laag)} is het voordeel
    ${signed(top.laag.voordeel)} €/kg, bij ${value(top, top.hoog)} ${signed(top.hoog.voordeel)} €/kg (nu ${signed(base)}).</span>`;
}
