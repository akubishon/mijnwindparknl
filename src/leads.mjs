// Aanvragen van de openbare pagina /waterstofscan: controleren, bewaren in R2 (leads/v1/) en tonen op /leads
// (achter de sitelogin). Er wordt geen IP-adres of browserinformatie bewaard, alleen wat de aanvrager invult.
export const LEAD_PREFIX = 'leads/v1/';
// Alleen de velden van het huidige formulier (src/scan-page.mjs); andere velden in een inzending worden genegeerd.
const LEAD_FIELDS = {naam: 120, organisatie: 160, email: 200, pakket: 20, toelichting: 2000, locatie: 300, vermogen: 20};
// Herkomst van een aanvraag (?bron=… op de link, of de Atlas zelf): kleine letters, cijfers en streepjes, anders 'direct'.
const LEAD_SOURCE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export function leadSource(value) { const s = String(value ?? '').trim().toLowerCase(); return LEAD_SOURCE.test(s) ? s : 'direct'; }
const LEAD_PLAN_IDS = ['opbrengst', 'keuze', 'onbekend'];
const LEAD_EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Uit een formulier (URLSearchParams) naar {lead, errors, values, spam}. Spam (ingevuld lokveld) wordt stil genegeerd.
export function parseLead(form) {
  const values = {};
  for (const [name, max] of Object.entries(LEAD_FIELDS)) values[name] = String(form.get(name) ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  values.bron = leadSource(form.get('bron'));
  // Vermogen alleen als getal (MW); tekst als 'veel' telt niet.
  const mw = Number(values.vermogen.replace(',', '.'));
  values.vermogen = values.vermogen && Number.isFinite(mw) && mw > 0 && mw < 100000 ? String(Math.round(mw * 10) / 10) : '';
  values.toestemming = form.get('toestemming') === 'ja';
  const spam = String(form.get('website') ?? '').trim() !== '';
  const errors = [];
  if (!values.naam) errors.push('Vul je naam in.');
  if (!values.organisatie) errors.push('Vul je organisatie in.');
  if (!LEAD_EMAIL.test(values.email)) errors.push('Vul een geldig e-mailadres in.');
  if (!values.toestemming) errors.push('Geef toestemming om contact met je op te nemen.');
  if (!LEAD_PLAN_IDS.includes(values.pakket)) values.pakket = 'onbekend';
  const lead = errors.length || spam ? null : {...values, ontvangen: null};
  return {lead, errors, values, spam};
}

// Sleutel die op tijd sorteert: nieuwste eerst met een omgekeerde tijdstempel.
export function leadKey(now, random) {
  const reverse = String(9999999999999 - now).padStart(13, '0');
  return `${LEAD_PREFIX}${reverse}-${random}.json`;
}

const leadEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LEAD_COLUMNS = [['ontvangen', 'Ontvangen'], ['bron', 'Bron'], ['naam', 'Naam'], ['organisatie', 'Organisatie'], ['email', 'E-mail'], ['pakket', 'Pakket'], ['locatie', 'Locatie'], ['vermogen', 'MW'], ['toelichting', 'Toelichting']];
// Velden van het eerste formulier (tot 24 november 2026). Een kolom verschijnt alleen als een bewaarde aanvraag er
// een waarde in heeft; 'anders' was de standaard van de aanvraagronde en telt niet als waarde.
const LEAD_LEGACY_COLUMNS = [['telefoon', 'Telefoon'], ['ronde', 'Aanvraag']];
const leadColumns = leads => [...LEAD_COLUMNS, ...LEAD_LEGACY_COLUMNS.filter(([k]) => leads.some(l => l[k] && !(k === 'ronde' && l[k] === 'anders')))];
const leadWhen = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat('nl-NL', {timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short'}).format(t) : ''; };

// CSV voor Nederlandse Excel: BOM, puntkomma's; formules in cellen worden onschadelijk gemaakt.
export function leadsCsv(leads) {
  const cell = value => { let s = String(value ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const columns = leadColumns(leads);
  return '﻿' + [columns.map(c => c[1]).join(';'), ...leads.map(l => columns.map(([k]) => cell(l[k])).join(';'))].join('\r\n') + '\r\n';
}

// Trechter van de Atlas (atlas.mijnwindpark.nl): dagtellers zonder cookies of persoonsgegevens, per dag één object in R2.
// De Atlas telt met lezen-ophogen-schrijven; bij gelijktijdige klikken kan een telling verloren gaan (indicatief).
export const ATLAS_EVENT_PREFIX = 'atlas/v1/events/';
export const ATLAS_EVENTS = [['kaart', 'Kaart geopend'], ['gedeeld', 'Via gedeelde link'], ['perceel', 'Perceel gekozen'], ['park', 'Windpark gekozen'], ['link', 'Link gekopieerd'], ['cta', 'Klik naar Waterstofscan'], ['profiel', 'Locatieprofiel aangevraagd']];
export const atlasEventKey = ms => ATLAS_EVENT_PREFIX + new Date(ms).toISOString().slice(0, 10) + '.json';
// Totalen over de laatste 7 en 30 dagen (inclusief vandaag, UTC).
export async function readAtlasFunnel(bucket, now = Date.now()) {
  const sum = {7: {}, 30: {}};
  const days = Array.from({length: 30}, (_, i) => i);
  const counts = await Promise.all(days.map(async i => { try { const o = await bucket.get(atlasEventKey(now - i * 86400000)); return o ? await o.json() : {}; } catch { return {}; } }));
  counts.forEach((c, i) => { for (const [k] of ATLAS_EVENTS) { const n = Number(c?.[k]) || 0; sum[30][k] = (sum[30][k] || 0) + n; if (i < 7) sum[7][k] = (sum[7][k] || 0) + n; } });
  return sum;
}
function atlasFunnelTable(funnel) {
  if (!funnel) return '';
  const rows = ATLAS_EVENTS.map(([k, label]) => `<tr><td>${leadEsc(label)}</td><td>${funnel[7][k] || 0}</td><td>${funnel[30][k] || 0}</td></tr>`).join('');
  return `<h2>Atlas-trechter</h2><p>Tellingen van atlas.mijnwindpark.nl, zonder cookies; indicatief.</p><div class="wrap funnel"><table><thead><tr><th>Stap</th><th>7 dagen</th><th>30 dagen</th></tr></thead><tbody>${rows}</tbody></table></div><h2>Aanvragen</h2>`;
}

export function leadsPage(leads, {error = '', funnel = null} = {}) {
  const columns = leadColumns(leads);
  const rows = leads.map(l => `<tr>${columns.map(([k]) => `<td>${k === 'ontvangen' ? leadEsc(leadWhen(l[k])) : k === 'email' ? `<a href="mailto:${leadEsc(l[k])}">${leadEsc(l[k])}</a>` : leadEsc(l[k]).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Aanvragen waterstofscan</title><style>
body{margin:0;padding:24px;background:#EFECE6;color:#0C2340;font-family:'Segoe UI',Arial,sans-serif;font-size:14px}h1{font-weight:500;margin:0 0 6px}p{color:#465970}a{color:#0C2340}
.bar{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 16px}.wrap{overflow-x:auto;background:#fff;border:1px solid #0C2340}table{border-collapse:collapse;min-width:900px;width:100%}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid #e1e6ea}th{background:#C3E4F2}.error{color:#84251e}h2{font-weight:500;margin:20px 0 6px}.funnel{max-width:520px;margin-bottom:12px}.funnel table{min-width:0}
</style></head><body><h1>Aanvragen waterstofscan</h1><p>${leads.length} aanvra${leads.length === 1 ? 'ag' : 'gen'}, nieuwste eerst. Verwijder gegevens uiterlijk twaalf maanden na ontvangst.</p>
<div class="bar"><a href="/leads.csv">Download CSV</a><a href="/waterstofscan">Openbare pagina</a><a href="/">Terug naar de site</a></div>${error ? `<p class="error">${leadEsc(error)}</p>` : ''}
${atlasFunnelTable(funnel)}${leads.length ? `<div class="wrap"><table><thead><tr>${columns.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Nog geen aanvragen.</p>'}</body></html>`;
}

// Alle aanvragen uit R2, nieuwste eerst (de sleutel sorteert al zo); hooguit `limit`.
export async function readLeads(bucket, limit = 500) {
  const leads = [];
  let cursor;
  do {
    const page = await bucket.list({prefix: LEAD_PREFIX, cursor, limit: Math.min(1000, limit - leads.length)});
    for (const object of page.objects) {
      const item = await bucket.get(object.key);
      if (item) try { leads.push(await item.json()); } catch { /* beschadigd object overslaan */ }
    }
    cursor = page.truncated && leads.length < limit ? page.cursor : undefined;
  } while (cursor);
  return leads;
}
