// Taalkeuze voor pagina's zonder React (/opsplitsing): vertaalt de pagina en zet de taalknop vóór Uitloggen, zoals op de andere pagina's.
import { initLanguage, languageButton } from './i18n.mjs';

initLanguage();
const place = () => {
  const bar = document.querySelector('.site-session');
  if (bar && !bar.querySelector('.language-toggle')) bar.prepend(languageButton());
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
else place();
