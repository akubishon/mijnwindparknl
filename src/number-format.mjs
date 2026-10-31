// Weergave van berekende uitkomsten: twee à drie significante cijfers, in Nederlandse notatie.
// Invoervelden, waarden uit datasheets en bronnen, en CSV-exports gebruiken dit niet: die houden hun precisie.
const formats = new Map();
const nl = (decimals, pad) => { const key = decimals + (pad ? 'p' : ''); let f = formats.get(key); if (!f) formats.set(key, f = new Intl.NumberFormat('nl-NL', {maximumFractionDigits: decimals, minimumFractionDigits: pad ? decimals : 0})); return f; };
const finite = n => typeof n === 'number' && Number.isFinite(n);

// Decimalen voor `digits` significante cijfers bij de grootte van n. Negatief: afronden op tientallen, honderdtallen …
export function decimalsFor(n, digits = 3, maxDecimals = 3) {
 if (!finite(n) || n === 0) return 0;
 return Math.min(maxDecimals, digits - 1 - Math.floor(Math.log10(Math.abs(n))));
}
// Eén afronding voor een groep waarden die naast elkaar staan (een tabelregel, een tooltip): bepaald door de grootste.
export const sharedDecimals = (values, digits = 3, maxDecimals = 3) => decimalsFor(Math.max(0, ...values.filter(finite).map(Math.abs)), digits, maxDecimals);
export const roundTo = (n, decimals) => decimals >= 0 ? Number(n.toFixed(decimals)) : Math.round(n / 10 ** -decimals) * 10 ** -decimals;

// pad: nullen aan het eind houden, zodat waarden in een groep dezelfde decimalen tonen (4,39 van 4,40).
export function formatFixed(n, decimals, pad = false) {
 if (!finite(n)) return '—';
 const text = nl(Math.max(0, decimals), pad).format(decimals < 0 ? roundTo(n, decimals) : n);
 return /^-0(,0*)?$/.test(text) ? text.slice(1) : text;
}
export const formatSignificant = (n, {digits = 3, maxDecimals = 3} = {}) => formatFixed(n, decimalsFor(n, digits, maxDecimals));
// Verschil met teken, op de afronding van de waarden die het vergelijkt. Het teken volgt de afgeronde waarde.
export function formatSigned(n, decimals, pad = false) {
 if (!finite(n)) return '—';
 const rounded = roundTo(n, decimals);
 return (rounded > 0 ? '+' : rounded < 0 ? '−' : '±') + formatFixed(Math.abs(rounded), decimals, pad);
}
// Het verschil tussen twee getoonde waarden: eerst afronden, dan aftrekken, zodat het verschil klopt met wat er staat.
export const shownDifference = (a, b, decimals) => roundTo(roundTo(a, decimals) - roundTo(b, decimals), decimals);

// Energie in MWh, vanaf 1.000 MWh in GWh.
export const energyUnit = maxMWh => Math.abs(roundTo(maxMWh || 0, decimalsFor(maxMWh || 0, 3, 3))) >= 1000 ? {unit: 'GWh', factor: 1e-3} : {unit: 'MWh', factor: 1};
export function energyParts(mwh) {
 const {unit, factor} = energyUnit(mwh);
 return {value: formatSignificant(mwh * factor), unit};
}
