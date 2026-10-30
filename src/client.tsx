import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Explorer from './explorer';
import Landing from './landing';
import ElectrolyserApp from './electrolyser-hub';
import Research from './research';
import { getLanguage, initLanguage, onLanguage, setLanguage } from './i18n.mjs';
initLanguage();
function LanguageToggle(){const [lang,setLang]=useState(getLanguage());useEffect(()=>{const off=onLanguage(setLang);return()=>{off();};},[]);const en=lang==='en';return <button type="button" className="language-toggle notranslate" lang={en?'nl':'en'} aria-label={en?'Toon de website in het Nederlands':'Show the website in English'} onClick={()=>setLanguage(en?'nl':'en')}>{en?'Nederlands':'English'}</button>;}
createRoot(document.getElementById('root')!).render(<><div className="site-session"><LanguageToggle/><form method="post" action="/auth/logout"><button type="submit">Uitloggen</button></form></div>{location.pathname==='/'?<Landing />:location.pathname==='/onderzoek'?<Research />:location.pathname==='/elektrolyser'||location.pathname.startsWith('/elektrolyser/')?<ElectrolyserApp />:<Explorer park={location.pathname==='/beabuorren'?'beabuorren':'fryslan'} />}</>);
