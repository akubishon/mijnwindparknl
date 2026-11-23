// Taal- en weergavekeuze voor pagina's zonder React (/opsplitsing): vertaalt de pagina, zet de knoppen
// Productweergave en taal vóór Uitloggen, zoals op de andere pagina's, en toont in de productweergave de
// productnotitie onder de hoofdnavigatie.
import { initLanguage, languageButton } from './i18n.mjs';
import { initView, viewButton } from './view-mode.mjs';
import { mountProductNote } from './product-note-dom.mjs';

initLanguage();
initView();
const place = () => {
  const bar = document.querySelector('.site-session');
  if (bar && !bar.querySelector('.language-toggle')) bar.prepend(languageButton());
  if (bar && !bar.querySelector('.view-toggle')) bar.prepend(viewButton());
  const nav = document.querySelector('.park-nav');
  if (nav && !nav.dataset.productNote) { nav.dataset.productNote = 'ja'; mountProductNote(nav); }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
else place();
