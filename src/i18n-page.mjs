// Taalkeuze voor pagina's zonder React (/opsplitsing): vertaalt de pagina en zet de taalknop in de kopbalk.
import { initLanguage, languageButton } from './i18n.mjs';

initLanguage();
const place = () => {
  const bar = document.querySelector('.topbar');
  if (bar && !bar.querySelector('.language-toggle')) bar.append(languageButton());
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
else place();
