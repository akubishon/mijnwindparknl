import React from 'react';
import { createRoot } from 'react-dom/client';
import Explorer from './explorer';
import Landing from './landing';
import Electrolyser from './electrolyser';
import Research from './research';
createRoot(document.getElementById('root')!).render(<><div className="site-session"><form method="post" action="/auth/logout"><button type="submit">Uitloggen</button></form></div>{location.pathname==='/'?<Landing />:location.pathname==='/onderzoek'?<Research />:location.pathname==='/elektrolyser'?<Electrolyser />:<Explorer park={location.pathname==='/beabuorren'?'beabuorren':'fryslan'} />}</>);
