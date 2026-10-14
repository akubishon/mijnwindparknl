import React from 'react';
import { createRoot } from 'react-dom/client';
import Explorer from './explorer';
import Electrolyser from './electrolyser';
import Research from './research';
import {isStylePreview,originalPath} from './style-preview';
if(isStylePreview){
 document.body.classList.add('style-preview');
 document.title='Windparken · Proefversie huisstijl';
 document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href','/proefstijl/favicon.svg');
}
const content=originalPath==='/onderzoek'?<Research />:originalPath==='/elektrolyser'?<Electrolyser />:<Explorer park={originalPath==='/beabuorren'?'beabuorren':'fryslan'} />;
createRoot(document.getElementById('root')!).render(<>{isStylePreview&&<aside className="style-preview-notice" aria-label="Proefversie"><span>PROEFVERSIE HUISSTIJL · WITTEVEEN+BOS</span><a href={originalPath}>Bekijk dezelfde pagina in de huidige stijl →</a></aside>}{content}</>);
