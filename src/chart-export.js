// Grafieken downloaden als PNG. Zet onder iedere grafiek (een inline SVG) een kleine knop; die tekent
// de grafiek met de stijlen zoals ze op het scherm staan op een canvas en downloadt het resultaat.
// Werkt los van React: een MutationObserver houdt de knoppen bij als grafieken verschijnen of verdwijnen.
// Gedeeld door de hoofdsite (gebundeld in client.tsx) en de opsplitsingspagina (los script).

const SVG_NS = 'http://www.w3.org/2000/svg';
export const CHART_SELECTOR = 'svg.hour-chart, svg.live-chart, svg.class-chart-svg, .capacity-curve > svg, .chart > svg, svg#threshold-art';
const BUTTON_CLASS = 'chart-png-button';
const STYLE_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'paint-order', 'visibility'];
const SCALE = 2;
const PAD = 24;

let fontRule = null;
async function brandFontRule() {
  if (fontRule !== null) return fontRule;
  try {
    const res = await fetch('/assets/tasa-orbiter.ttf');
    if (!res.ok) throw new Error(String(res.status));
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    fontRule = `@font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${btoa(binary)}) format('truetype');font-weight:400 800}`;
  } catch { fontRule = ''; }
  return fontRule;
}

export function chartTitle(svg) {
  const isHeading = el => /^H[2-4]$/.test(el.tagName);
  let node = svg;
  for (let depth = 0; depth < 7 && node.parentElement; depth++) {
    node = node.parentElement;
    const headings = [...node.querySelectorAll('h2,h3,h4')].filter(h => isHeading(h) && (h.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (headings.length) return headings[headings.length - 1].textContent.replace(/\s+/g, ' ').trim();
  }
  return (svg.querySelector('title')?.textContent || svg.getAttribute('aria-label') || 'Grafiek').replace(/\s+/g, ' ').trim();
}

export function fileName(title, day) {
  const slug = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'grafiek';
  return `${slug}-${day}.png`;
}

function chartDay() {
  const day = new URLSearchParams(location.search).get('day');
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function size(svg) {
  const box = svg.viewBox?.baseVal;
  if (box && box.width && box.height) return {x: box.x, y: box.y, width: box.width, height: box.height};
  const rect = svg.getBoundingClientRect();
  return {x: 0, y: 0, width: rect.width || 600, height: rect.height || 300};
}

// Neemt de berekende stijl over van ieder element, zodat CSS-klassen ook in het losse beeld kloppen.
function inlineStyles(source, target) {
  const computed = getComputedStyle(source);
  if (computed.display === 'none') { target.remove(); return; }
  target.removeAttribute('class');
  target.setAttribute('style', STYLE_PROPS.map(p => `${p}:${computed.getPropertyValue(p)}`).join(';'));
  const from = source.children, to = [...target.children];
  for (let i = 0; i < to.length; i++) if (from[i]) inlineStyles(from[i], to[i]);
}

function escapeXml(s) { return s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]); }

export async function chartToPng(svg) {
  const {x, y, width, height} = size(svg);
  const title = chartTitle(svg);
  const clone = svg.cloneNode(true);
  inlineStyles(svg, clone);
  clone.querySelectorAll('title').forEach(t => t.remove());
  for (const a of ['class', 'style', 'role', 'aria-label', 'aria-labelledby', 'aria-hidden', 'tabindex']) clone.removeAttribute(a);
  clone.setAttribute('x', String(PAD));
  clone.setAttribute('y', String(PAD + 36));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  clone.setAttribute('overflow', 'visible');
  const outerW = width + PAD * 2, outerH = height + PAD * 2 + 36;
  const font = getComputedStyle(svg).fontFamily || 'sans-serif';
  const doc = `<svg xmlns="${SVG_NS}" width="${outerW * SCALE}" height="${outerH * SCALE}" viewBox="0 0 ${outerW} ${outerH}"><style>${await brandFontRule()}</style><rect width="100%" height="100%" fill="#ffffff"/><text x="${PAD}" y="${PAD + 14}" style="font-family:${escapeXml(font)};font-size:17px;font-weight:600;fill:#0C2340">${escapeXml(title)}</text>${new XMLSerializer().serializeToString(clone)}</svg>`;
  const image = new Image();
  image.decoding = 'sync';
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('De grafiek kon niet als afbeelding worden geladen.')); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc); });
  const canvas = document.createElement('canvas');
  canvas.width = outerW * SCALE; canvas.height = outerH * SCALE;
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG maken is mislukt.')), 'image/png'));
  return {blob, name: fileName(title, chartDay())};
}

async function download(svg, button) {
  button.disabled = true;
  try {
    const {blob, name} = await chartToPng(svg);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) {
    console.error(e);
    button.title = e instanceof Error ? e.message : 'PNG maken is mislukt.';
  } finally { button.disabled = false; }
}

function makeButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.setAttribute('aria-label', 'Grafiek downloaden als PNG');
  button.title = 'Grafiek downloaden als PNG';
  button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></svg><span>PNG</span>';
  button.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const svg = button.previousElementSibling;
    if (isChart(svg)) download(svg, button);
  });
  return button;
}

// Alleen grafieken met getekende inhoud; een lege SVG (nog geen gegevens) krijgt geen knop.
const isChart = el => el instanceof SVGSVGElement && el.matches(CHART_SELECTOR) && [...el.children].some(c => !['title', 'desc', 'defs', 'style'].includes(c.tagName.toLowerCase()));

function sync() {
  for (const button of document.querySelectorAll('.' + BUTTON_CLASS)) {
    if (!isChart(button.previousElementSibling)) button.remove();
  }
  for (const svg of document.querySelectorAll(CHART_SELECTOR)) {
    if (isChart(svg) && !svg.nextElementSibling?.classList.contains(BUTTON_CLASS)) svg.after(makeButton());
  }
}

const STYLE = `.${BUTTON_CLASS}{display:flex;align-items:center;gap:6px;margin:8px 0 0 auto;padding:6px 10px;border:1px solid #bcc8d2;border-radius:0 10px 0 0;background:#fff;color:#0C2340;font:inherit;font-size:12px;line-height:1.2;cursor:pointer;position:sticky;right:0}.${BUTTON_CLASS}:hover:not(:disabled){background:#f0f7fa;border-color:#0C2340}.${BUTTON_CLASS}:disabled{opacity:.5;cursor:progress}@media print{.${BUTTON_CLASS}{display:none}}`;

export function initChartExport() {
  if (typeof document === 'undefined' || document.documentElement.dataset.chartExport) return;
  document.documentElement.dataset.chartExport = '1';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sync(); }); } };
  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true});
  sync();
}
