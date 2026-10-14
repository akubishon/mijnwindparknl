import React from 'react';
import { createRoot } from 'react-dom/client';
import Explorer from './explorer';
import Electrolyser from './electrolyser';
import Research from './research';
createRoot(document.getElementById('root')!).render(location.pathname==='/onderzoek'?<Research />:location.pathname==='/elektrolyser'?<Electrolyser />:<Explorer park={location.pathname==='/beabuorren'?'beabuorren':'fryslan'} />);
