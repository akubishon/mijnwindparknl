import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translate } from '../src/i18n.mjs';

test('translates fixed text, keeping surrounding whitespace',()=>{
 assert.equal(translate('Uitloggen'),'Log out');
 assert.equal(translate('  Vorige dag '),'  Previous day ');
 assert.equal(translate('Mijnwindpark.nl · Windenergie & waterstof'),'Mijnwindpark.nl · Wind energy & hydrogen');
});

test('fills templates and translates the inserted text',()=>{
 assert.equal(translate('Rust op 3 bronwaarden en 2 aannames.'),'Based on 3 source values and 2 assumptions.');
 assert.equal(translate('1 oktober 2026, geen gegevens'),'1 October 2026, no data');
 assert.equal(translate('donderdag 30 oktober 2026'),'Thursday 30 October 2026');
});

test('short templates do not rewrite place names or unknown text',()=>{
 assert.equal(translate('3 van 5'),'3 of 5');
 assert.equal(translate('Hoek van Holland'),'Hoek van Holland');
 assert.equal(translate('Vlakte van de Raan'),'Vlakte van de Raan');
 assert.equal(translate('Fryslân'),'Fryslân');
 assert.equal(translate('12,5'),'12,5');
});

test('login page follows the language cookie and the lang link',async()=>{
 const source=await readFile(new URL('../worker/index.js',import.meta.url),'utf8');
 const worker=(await import(`data:text/javascript;base64,${Buffer.from(source+'\n// i18n').toString('base64')}`)).default;
 const env={SITE_PASSWORD:'fixture-site-password',WPF_PUBLIC_CLIENT_KEY:'fixture-client',WPF_FIREBASE_API_KEY:'fixture-api'};
 const dutch=await (await worker.fetch(new Request('https://fixture.test/fryslan'),env)).text();
 assert.match(dutch,/<html lang="nl">/);assert.match(dutch,/Welkom!/);assert.match(dutch,/href="\/fryslan\?lang=en"/);
 const english=await (await worker.fetch(new Request('https://fixture.test/fryslan',{headers:{Cookie:'mwp_lang=en'}}),env)).text();
 assert.match(english,/<html lang="en">/);assert.match(english,/Welcome!/);assert.match(english,/<button type="submit">Log in<\/button>/);
 const wrong=await (await worker.fetch(new Request('https://fixture.test/auth/site',{method:'POST',headers:{Origin:'https://fixture.test',Cookie:'mwp_lang=en','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:'nope',next:'/'})}),env)).text();
 assert.match(wrong,/Incorrect password\./);
 const choose=await worker.fetch(new Request('https://fixture.test/fryslan?day=2026-10-01&lang=en'),env);
 assert.equal(choose.status,303);assert.equal(choose.headers.get('Location'),'/fryslan?day=2026-10-01');assert.match(choose.headers.get('Set-Cookie'),/^mwp_lang=en; Path=\//);
 assert.equal((await worker.fetch(new Request('https://fixture.test/api/stations?lang=en'),env)).status,401);
});
