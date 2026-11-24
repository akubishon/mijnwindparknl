// Aanvragen van de openbare pagina /waterstofscan: controleren, bewaren in R2 (leads/v1/) en tonen op /leads
// (achter de sitelogin). Er wordt geen IP-adres of browserinformatie bewaard, alleen wat de aanvrager invult.
export const LEAD_PREFIX = 'leads/v1/';
const LEAD_FIELDS = {naam: 120, organisatie: 160, email: 200, telefoon: 40, pakket: 20, ronde: 20, locatie: 200, vermogen: 20, toelichting: 2000};
const LEAD_PLAN_IDS = ['opbrengst', 'keuze', 'onbekend'], LEAD_ROUND_IDS = ['owe', 'hubs', 'anders'];
const LEAD_EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Uit een formulier (URLSearchParams) naar {lead, errors, values, spam}. Spam (ingevuld lokveld) wordt stil genegeerd.
export function parseLead(form) {
  const values = {};
  for (const [name, max] of Object.entries(LEAD_FIELDS)) values[name] = String(form.get(name) ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  values.toestemming = form.get('toestemming') === 'ja';
  const spam = String(form.get('website') ?? '').trim() !== '';
  const errors = [];
  if (!values.naam) errors.push('Vul je naam in.');
  if (!values.organisatie) errors.push('Vul je organisatie in.');
  if (!LEAD_EMAIL.test(values.email)) errors.push('Vul een geldig e-mailadres in.');
  if (!values.toestemming) errors.push('Geef toestemming om contact met je op te nemen.');
  if (!LEAD_PLAN_IDS.includes(values.pakket)) values.pakket = 'onbekend';
  if (!LEAD_ROUND_IDS.includes(values.ronde)) values.ronde = 'anders';
  if (values.vermogen && !/^\d{1,4}([.,]\d{1,2})?$/.test(values.vermogen)) errors.push('Vul het vermogen in als getal in MW, of laat het leeg.');
  const lead = errors.length || spam ? null : {...values, ontvangen: null};
  return {lead, errors, values, spam};
}

// Sleutel die op tijd sorteert: nieuwste eerst met een omgekeerde tijdstempel.
export function leadKey(now, random) {
  const reverse = String(9999999999999 - now).padStart(13, '0');
  return `${LEAD_PREFIX}${reverse}-${random}.json`;
}

const leadEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LEAD_COLUMNS = [['ontvangen', 'Ontvangen'], ['naam', 'Naam'], ['organisatie', 'Organisatie'], ['email', 'E-mail'], ['telefoon', 'Telefoon'], ['pakket', 'Pakket'], ['ronde', 'Aanvraag'], ['locatie', 'Locatie'], ['vermogen', 'MW'], ['toelichting', 'Toelichting']];
const leadWhen = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat('nl-NL', {timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short'}).format(t) : ''; };

// CSV voor Nederlandse Excel: BOM, puntkomma's; formules in cellen worden onschadelijk gemaakt.
export function leadsCsv(leads) {
  const cell = value => { let s = String(value ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [LEAD_COLUMNS.map(c => c[1]).join(';'), ...leads.map(l => LEAD_COLUMNS.map(([k]) => cell(l[k])).join(';'))].join('\r\n') + '\r\n';
}

export function leadsPage(leads, {error = ''} = {}) {
  const rows = leads.map(l => `<tr>${LEAD_COLUMNS.map(([k]) => `<td>${k === 'ontvangen' ? leadEsc(leadWhen(l[k])) : k === 'email' ? `<a href="mailto:${leadEsc(l[k])}">${leadEsc(l[k])}</a>` : leadEsc(l[k]).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Aanvragen waterstofscan</title><style>
body{margin:0;padding:24px;background:#EFECE6;color:#0C2340;font-family:'Segoe UI',Arial,sans-serif;font-size:14px}h1{font-weight:500;margin:0 0 6px}p{color:#465970}a{color:#0C2340}
.bar{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 16px}.wrap{overflow-x:auto;background:#fff;border:1px solid #0C2340}table{border-collapse:collapse;min-width:900px;width:100%}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid #e1e6ea}th{background:#C3E4F2}.error{color:#84251e}
</style></head><body><h1>Aanvragen waterstofscan</h1><p>${leads.length} aanvra${leads.length === 1 ? 'ag' : 'gen'}, nieuwste eerst. Verwijder gegevens uiterlijk twaalf maanden na ontvangst.</p>
<div class="bar"><a href="/leads.csv">Download CSV</a><a href="/waterstofscan">Openbare pagina</a><a href="/">Terug naar de site</a></div>${error ? `<p class="error">${leadEsc(error)}</p>` : ''}
${leads.length ? `<div class="wrap"><table><thead><tr>${LEAD_COLUMNS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Nog geen aanvragen.</p>'}</body></html>`;
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
