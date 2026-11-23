// Productnotitie voor pagina's zonder React (/opsplitsing): dezelfde opbouw en klassen als ProductNote in
// product-view.tsx, maar met gewone DOM-elementen. De vertaallaag vertaalt de tekst zodra hij in de pagina staat.
import {getView,onView} from './view-mode.mjs';
import {nextDemoStep,note,noteFor} from './product-content.mjs';

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
}

export function noteElement(path) {
  const content = noteFor(path);
  if (!content) return null;
  const next = nextDemoStep(path);
  const row = (label, text, className) => el('div', className ? {class: className} : {}, [el('dt', {}, [label]), el('dd', {}, [text])]);
  const links = el('div', {class: 'product-note-links'}, [el('a', {href: '/'}, [note.overview])]);
  if (next) links.append(el('a', {href: next.href}, [el('span', {}, [note.nextLabel]), el('strong', {}, [next.title])]));
  return el('aside', {class: 'product-note', 'aria-labelledby': 'product-note-title'}, [
    el('div', {class: 'product-note-head'}, [el('span', {class: 'product-note-eyebrow'}, [note.eyebrow]), el('p', {class: 'product-note-title', id: 'product-note-title'}, [content.title])]),
    el('dl', {class: 'product-note-grid'}, [row(note.showsLabel, content.shows), row(note.whyLabel, content.why), row(note.whoLabel, content.who), row(note.askLabel, content.ask, 'product-note-ask')]),
    links,
  ]);
}

// Zet de notitie direct na `anchor` (de hoofdnavigatie) zolang de productweergave aan staat.
export function mountProductNote(anchor, path = location.pathname) {
  let current = null;
  const sync = view => {
    if (view === 'product' && !current) {
      current = noteElement(path);
      if (current) anchor.after(current);
    } else if (view !== 'product' && current) {
      current.remove();
      current = null;
    }
  };
  onView(sync);
  sync(getView());
}
