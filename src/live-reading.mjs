// Actueel vermogen: hoe oud de laatste meting is en of de bron nog nieuwe metingen levert.
// De bron levert normaal ongeveer elke 10 s een nieuwe meting. Na 2 minuten zonder nieuwe meting (ruim tien keer
// dat ritme, zodat een paar gemiste metingen niet meetellen) is het niet meer het vermogen op dit moment.
export const STALE_AFTER_S = 120;
const ZONE = 'Europe/Amsterdam';
const dayOf = t => new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).format(t);

// Leeftijd in één eenheid, naar beneden afgerond: 45 s, 12 min, 3 uur, 9 dagen.
// Een eenheid begint pas bij twee, zodat er geen enkelvoud nodig is en de waarde niet te grof wordt.
export function readingAge(seconds) {
 if (!Number.isFinite(seconds) || seconds < 0) return null;
 if (seconds < 120) return {value: String(Math.floor(seconds)), unit: 's'};
 if (seconds < 7200) return {value: String(Math.floor(seconds / 60)), unit: 'min'};
 if (seconds < 172800) return {value: String(Math.floor(seconds / 3600)), unit: 'uur'};
 return {value: new Intl.NumberFormat('nl-NL').format(Math.floor(seconds / 86400)), unit: 'dagen'};
}

// Tijdstip van de meting, met de datum erbij als het niet vandaag is (Nederlandse tijd).
export function readingMoment(timestamp, now = Date.now()) {
 const t = Date.parse(timestamp);
 if (Number.isNaN(t)) return null;
 const time = new Intl.DateTimeFormat('nl-NL', {timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit'}).format(t);
 if (dayOf(t) === dayOf(now)) return {date: null, time};
 const year = dayOf(t).slice(0, 4) !== dayOf(now).slice(0, 4) ? {year: 'numeric'} : {};
 return {date: new Intl.DateTimeFormat('nl-NL', {timeZone: ZONE, day: 'numeric', month: 'long', ...year}).format(t), time};
}
export function measuredNote(timestamp, now = Date.now()) {
 const m = readingMoment(timestamp, now);
 return !m ? 'Tijdstip onbekend' : m.date ? `Gemeten op ${m.date} om ${m.time}` : `Gemeten om ${m.time}`;
}
export function sinceText(timestamp, now = Date.now()) {
 const m = readingMoment(timestamp, now);
 return !m ? '' : m.date ? `${m.date} om ${m.time}` : m.time;
}

// Verouderd volgens de klok van de kijker: dan heet het niet meer “vermogen op dit moment”.
export const isStale = (timestamp, now = Date.now()) => (now - Date.parse(timestamp)) / 1000 > STALE_AFTER_S;
// De bron zelf levert niets nieuws: toen de server de bron las, was de meting al ouder dan de drempel.
// Dit hangt niet af van pauzeren of een mislukte verbinding aan de kant van de kijker.
export const sourceSilent = live => !!live && (Date.parse(live.receivedAt) - Date.parse(live.timestamp)) / 1000 > STALE_AFTER_S;

// "1 meting", "2 metingen".
export const readingsLabel = n => n === 1 ? 'meting' : 'metingen';
