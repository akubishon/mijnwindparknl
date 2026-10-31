/* __DATA_CLIENT__ */
/* __WIND_CLIENT__ */
const opsAssets = /* __OPS_ASSETS__ */;
const opsPage = /* __OPS_PAGE__ */;
const opsPolicy = /* __OPS_POLICY__ */;
const page = /* __PAGE__ */;
const calculatorWorker = /* __CALC_WORKER__ */;
const brandFont = /* __BRAND_FONT__ */;
const favicon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h48a16 16 0 0 1 16 16v48H0z" fill="#0C2340"/><path d="M32 31v23M32 31L18 11M32 31l25-3M32 31L18 49" stroke="#00A6DE" stroke-width="5"/></svg>';
const securityHeaders = { 'Content-Security-Policy': /* __CSP__ */, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const answer = (value, status = 200) => Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
const authAttempts=new Map();
const atlasCatalogueKey='atlas/v1/catalogue.json',atlasDatasheetPrefix='atlas/v1/datasheets/',atlasDatasheetRoute='/api/atlas/datasheets/';
const atlasDatasheetPath=/^(?:ProtonExchangeMembrane|AlkalineElectroLysis|PressurisedAlkalineElectroLysis|AnionExchangeMembrane|SolidOxideElectrolysisCell|Anders)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:pdf|png)$/;
const encoder=new TextEncoder();
async function researchKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function researchToken(secret){const expires=String(Date.now()+2*3600000);const key=await researchKey(secret);const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('research:'+expires));return expires+'.'+Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');}
async function researchAllowed(request,env){
 if(!env.RESEARCH_PASSWORD)return false;
 const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');const [expires,signature]=token.split('.');
 if(!/^\d{13}$/.test(expires||'')||Number(expires)<Date.now()||Number(expires)>Date.now()+2*3600000||!/^([a-f0-9]{64})$/.test(signature||''))return false;
 const bytes=new Uint8Array(signature.match(/../g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify('HMAC',await researchKey(env.RESEARCH_PASSWORD),bytes,encoder.encode('research:'+expires));
}
const siteAttempts=new Map();
const siteSecret=env=>env.SITE_PASSWORD||env.RESEARCH_PASSWORD;
async function siteSession(secret){
 const expires=String(Date.now()+12*3600000);
 const signature=await crypto.subtle.sign('HMAC',await researchKey(secret),encoder.encode('site:'+expires));
 return expires+'.'+Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
async function siteAllowed(request,env){
 const secret=siteSecret(env);if(!secret)return false;
 const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-site_session='));
 const [expires,signature]=(cookie?.slice('__Host-site_session='.length)||'').split('.');
 if(!/^\d{13}$/.test(expires||'')||Number(expires)<Date.now()||Number(expires)>Date.now()+12*3600000||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 return crypto.subtle.verify('HMAC',await researchKey(secret),new Uint8Array(signature.match(/../g).map(s=>parseInt(s,16))),encoder.encode('site:'+expires));
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeNext(value){if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||/[\r\n]/.test(value))return '/';const u=new URL(value,'https://site.invalid');return u.origin==='https://site.invalid'&&!u.pathname.startsWith('/auth/')?u.pathname+u.search:'/';}
const loginText={
 nl:{title:'Welkom · Mijn Windpark',welcome:'Welkom!',intro:'Voer je wachtwoord in.',password:'Wachtwoord',submit:'Inloggen',other:'English',otherLang:'en',otherLabel:'Show this page in English'},
 en:{title:'Welcome · Mijn Windpark',welcome:'Welcome!',intro:'Enter your password.',password:'Password',submit:'Log in',other:'Nederlands',otherLang:'nl',otherLabel:'Toon deze pagina in het Nederlands'},
};
const loginMessages={'Toegang is nog niet ingesteld. Neem contact op met de beheerder.':'Access has not been set up yet. Please contact the administrator.','Te veel pogingen. Probeer over 15 minuten opnieuw.':'Too many attempts. Try again in 15 minutes.','Probeer het later opnieuw.':'Please try again later.','Ongeldige aanvraag.':'Invalid request.','Onjuist wachtwoord.':'Incorrect password.'};
// Taalkeuze uit de cookie die de taalknop zet; de loginpagina heeft geen scripts en wordt daarom op de server vertaald.
const requestLanguage=request=>/(?:^|;\s*)mwp_lang=en(?:;|$)/.test(request.headers.get('Cookie')||'')?'en':'nl';
function withLanguage(path,lang){const u=new URL(path,'https://site.invalid');u.searchParams.set('lang',lang);return u.pathname+u.search;}
function loginPage(message='',next='/',status=401,lang='nl'){
 const text=loginText[lang]||loginText.nl;if(lang==='en')message=loginMessages[message]||message;
 const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${text.title}</title><style>
 @font-face{font-family:'TASA Orbiter';src:url(data:font/ttf;base64,${brandFont}) format('truetype');font-style:normal;font-weight:400 800;font-display:swap}
 *{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px;background:#EFECE6;color:#0C2340;font-family:'TASA Orbiter','Segoe UI',Arial,sans-serif;line-height:1.5}
 main{width:100%;max-width:480px;padding:44px 42px;background:#fff;border:1px solid #bcc8d2;border-top:4px solid #00A6DE;border-radius:0 32px 0 0}
 .brand{margin:0 0 30px;font-size:15px;font-weight:600;display:flex;justify-content:space-between;gap:12px}.brand a{color:#0C2340;font-weight:500;font-size:14px}h1{margin:0 0 10px;font-size:42px;font-weight:500;line-height:1.15;letter-spacing:-1px}.intro{margin:0 0 30px;font-size:18px;color:#465970}
 label{display:block;margin-bottom:8px;font-size:16px;font-weight:600}input[type=password]{display:block;width:100%;min-height:60px;padding:14px 16px;border:1px solid #788b9f;border-radius:0 8px 0 0;background:#fff;color:#0C2340;font:inherit;font-size:20px}
 button{display:block;width:100%;min-height:58px;margin-top:22px;padding:14px 20px;border:1px solid #0C2340;border-radius:0 12px 0 0;background:#0C2340;color:#fff;font:inherit;font-size:18px;font-weight:600;cursor:pointer}button:hover{background:#193a5d}input:focus-visible,button:focus-visible{outline:3px solid #00A6DE;outline-offset:3px}
 .error{margin:18px 0 0;padding:12px 14px;border-left:3px solid #a32c22;background:#fff3f0;font-size:16px;color:#84251e}input[aria-invalid=true]{border-color:#a32c22}
 @media(max-width:520px){body{padding:20px}main{padding:32px 26px}h1{font-size:36px}.brand{margin-bottom:24px}}
 </style></head><body><main aria-labelledby="welcome-title"><p class="brand"><span>mijnwindpark.nl</span><a href="${escapeHtml(withLanguage(safeNext(next),text.otherLang))}" lang="${text.otherLang}" aria-label="${text.otherLabel}">${text.other}</a></p><h1 id="welcome-title">${text.welcome}</h1><p class="intro">${text.intro}</p><form method="post" action="/auth/site"><input type="hidden" name="next" value="${escapeHtml(safeNext(next))}"><label for="password">${text.password}</label><input id="password" type="password" name="password" required maxlength="1024" autocomplete="current-password" autofocus${message?' aria-describedby="password-error" aria-invalid="true"':''}>${message?`<p class="error" id="password-error" role="alert">${escapeHtml(message)}</p>`:''}<button type="submit">${text.submit}</button></form></main></body></html>`;
 const policy="default-src 'none'; style-src 'unsafe-inline'; font-src data:; form-action 'self'; base-uri 'none'; object-src 'none'";
 return new Response(html,{status,headers:{...securityHeaders,'Content-Security-Policy':policy,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
async function gateRequest(request,env,url){
 const secret=siteSecret(env);
 const choice=url.searchParams.get('lang');
 if(request.method==='GET'&&!url.pathname.startsWith('/api/')&&(choice==='en'||choice==='nl')){url.searchParams.delete('lang');return new Response(null,{status:303,headers:{...securityHeaders,Location:safeNext(url.pathname+url.search),'Cache-Control':'no-store','Set-Cookie':`mwp_lang=${choice}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`}});}
 const lang=requestLanguage(request),login=(message,next,status)=>loginPage(message,next,status,lang);
 if(url.pathname==='/auth/logout'&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:'/','Cache-Control':'no-store','Set-Cookie':'__Host-site_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});
 }
 if(url.pathname==='/auth/site'&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
  if(!secret)return login('Toegang is nog niet ingesteld. Neem contact op met de beheerder.','/',503);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',now=Date.now();
  const previous=siteAttempts.get(ip);const attempts=previous&&previous.until>now?previous:{count:0,until:now+900000};
  if(attempts.count>=5)return login('Te veel pogingen. Probeer over 15 minuten opnieuw.','/',429);
  if(siteAttempts.size>=10000&&!siteAttempts.has(ip))return login('Probeer het later opnieuw.','/',429);
  if(siteAttempts.size>1000)for(const [key,value] of siteAttempts)if(value.until<=now)siteAttempts.delete(key);
  attempts.count++;siteAttempts.set(ip,attempts);
  if(Number(request.headers.get('Content-Length')||0)>8192)return login('Ongeldige aanvraag.','/',400);
  let input;try{const body=await request.text();if(body.length>8192)throw Error();input=new URLSearchParams(body);}catch{return login('Ongeldige aanvraag.','/',400);}
  const password=input.get('password'),next=safeNext(input.get('next'));
  if(typeof password!=='string'||password.length>1024)return login('Onjuist wachtwoord.',next);
  const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(secret))),actual=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password)));
  let difference=0;for(let i=0;i<expected.length;i++)difference|=expected[i]^actual[i];
  if(difference)return login('Onjuist wachtwoord.',next);
  siteAttempts.delete(ip);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:next,'Cache-Control':'no-store','Set-Cookie':`__Host-site_session=${await siteSession(secret)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200`}});
 }
 if(await siteAllowed(request,env))return null;
 if(url.pathname.startsWith('/api/'))return answer({error:'Voer eerst het websitewachtwoord in.'},401);
 return login(secret?'':'Toegang is nog niet ingesteld. Neem contact op met de beheerder.',url.pathname+url.search,secret?401:503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The unattended writer has separate authorization and never opens visitor routes.
    if(url.pathname==='/api/internal/harmonie/update'){
      if(request.method!=='POST')return answer({error:'Method not allowed'},405);
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
      if(!env.FORECAST_WRITER_SHA256||digest!==env.FORECAST_WRITER_SHA256)return answer({error:'Unauthorized'},401);
      const model=url.searchParams.get('model')||'p1';if(!['p1','p2b'].includes(model))return answer({error:'Invalid model'},400);
      try{const selection={model,run:url.searchParams.get('run')||undefined,day:url.searchParams.get('day')||undefined};const result=await updateHarmonieSnapshot(env,model,selection);const saved=await readStoredHarmonie(env,selection);return answer({...result,verifiedRun:saved.run,storedHours:saved.rows.length});}
      catch(error){console.error('HARMONIE_UPDATE_FAILED',error.message);return answer({error:error.message},502);}
    }
    const gate=await gateRequest(request,env,url);if(gate)return gate;
    if(url.pathname==='/opsplitsing'||url.pathname==='/elektrolyser/opsplitsen'){
      // Cloudflare propagates header nonces to its injected JavaScript Detections script.
      // Generate a fresh nonce for each response, never in the shared page or asset policy.
      const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      const html=opsPage.replaceAll('<script ',`<script nonce="${nonce}" `);
      const policy=opsPolicy.replace('script-src ',`script-src 'nonce-${nonce}' `);
      return new Response(html,{headers:{...securityHeaders,'Content-Security-Policy':policy,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    if(url.pathname==='/api/opsplitsing/scenarios')return answer({scenarios:[]});
    if(url.pathname.startsWith('/opsplitsing-assets/')){const asset=opsAssets[url.pathname.slice('/opsplitsing-assets/'.length)];return asset?new Response(asset[0],{headers:{...securityHeaders,'Content-Security-Policy':opsPolicy,'Content-Type':asset[1]+'; charset=utf-8','Cache-Control':'private, max-age=3600'}}):answer({error:'Onbekend bestand.'},404);}
    if(url.pathname==='/api/research/auth'&&request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
      if(!env.RESEARCH_PASSWORD)return answer({error:'Onderzoek is vergrendeld: het wachtwoord is nog niet ingesteld.'},503);
      const ip=request.headers.get('CF-Connecting-IP')||'unknown',now=Date.now();
      const previous=authAttempts.get(ip);const attempts=previous&&previous.until>now?previous:{count:0,until:now+900000};
      if(attempts.count>=5)return answer({error:'Te veel pogingen. Probeer over 15 minuten opnieuw.'},429);
      attempts.count++;authAttempts.set(ip,attempts);if(authAttempts.size>1000)authAttempts.delete(authAttempts.keys().next().value);
      if(Number(request.headers.get('Content-Length')||0)>4096)return answer({error:'Ongeldige aanvraag.'},400);
      let input;try{const body=await request.text();if(body.length>4096)throw Error();input=JSON.parse(body);}catch{return answer({error:'Ongeldige aanvraag.'},400);}
      if(input.password===undefined)return answer({token:await researchToken(env.RESEARCH_PASSWORD)});
      if(typeof input.password!=='string'||input.password.length>1024)return answer({error:'Onjuist wachtwoord.'},401);
      const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(env.RESEARCH_PASSWORD)));
      const actual=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(input.password)));
      let difference=0;for(let i=0;i<expected.length;i++)difference|=expected[i]^actual[i];
      if(difference)return answer({error:'Onjuist wachtwoord.'},401);
      authAttempts.delete(ip);return answer({token:await researchToken(env.RESEARCH_PASSWORD)});
    }
    if (request.method !== 'GET') return answer({ error: 'Method not allowed' }, 405);
    if ((url.pathname === '/fonts/tasa-orbiter.ttf' || url.pathname === '/assets/tasa-orbiter.ttf' || url.pathname === '/proefstijl/font.ttf')) return new Response(Uint8Array.from(atob(brandFont),c=>c.charCodeAt(0)), {headers:{...securityHeaders,'Content-Type':'font/ttf','Cache-Control':'public, max-age=86400'}});
    if(url.pathname==='/slim-schakelen')return new Response(null,{status:302,headers:{...securityHeaders,Location:'/elektrolyser'+url.search,'Cache-Control':'no-store'}});
    const formerTrialPages={'/proefstijl':'/','/proefstijl/beabuorren':'/beabuorren','/proefstijl/elektrolyser':'/elektrolyser','/proefstijl/onderzoek':'/onderzoek'};
    if(Object.hasOwn(formerTrialPages,url.pathname))return new Response(null,{status:302,headers:{...securityHeaders,Location:formerTrialPages[url.pathname]+url.search,'Cache-Control':'no-store'}});
    if (url.pathname === '/' || url.pathname === '/fryslan' || url.pathname === '/beabuorren' || url.pathname === '/elektrolyser' || url.pathname === '/elektrolyser/catalogus' || url.pathname === '/elektrolyser/samenstellen' || url.pathname === '/elektrolyser/vergelijken' || url.pathname === '/onderzoek') return new Response(page, { headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
    if (url.pathname === '/assets/elektrolyser-rekenkern.js') return new Response(calculatorWorker, { headers: { ...securityHeaders, 'Content-Security-Policy': "default-src 'none'; connect-src 'self'", 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (url.pathname === '/favicon.svg') return new Response(favicon, { headers: { ...securityHeaders, 'Content-Type': 'image/svg+xml' } });
    try {
      if(url.pathname==='/api/harmonie'){
        const selectedModel=url.searchParams.get('model')||'p1';if(!['p1','p2b'].includes(selectedModel))return answer({error:'Kies HARMONIE P1 of P2b.'},400);
        const forecastOptions=url.searchParams.has('park')?modelOptions(url.searchParams):null;
        let history={};if(url.searchParams.has('run')){try{history=historicalHarmonieOptions(url.searchParams.get('run'),url.searchParams.get('day'));}catch{return answer({error:'Kies een geldig modeluur vanaf 8 januari 2026, niet in de toekomst en binnen de voorspellingshorizon van de gekozen grafiekdag.'},400);}}
        if(!history.historical&&url.searchParams.has('day')){try{harmonieDayWindow(url.searchParams.get('day'));}catch{return answer({error:'Kies een geldige grafiekdag.'},400);}}
        const forecast=await readStoredHarmonie(env,history.historical?{model:selectedModel,run:url.searchParams.get('run'),day:url.searchParams.get('day')}:{model:selectedModel,day:url.searchParams.get('day')||undefined});
        // Same height method as the KNMI curve: WINS50 table for this park and Dutch calendar month (see forecastFactor).
        return answer({...forecast,rows:forecast.rows.map(row=>{const day=dutchDay(Date.parse(row.time));const parks=row.parks.map(park=>{const options=forecastOptions?.park===park.id?forecastOptions:modelOptions(new URLSearchParams({park:park.id})),heightFactor=forecastFactor(day,options);return {...park,heightFactor,powerMW:windPowerModel(day,options,heightFactor)(park.windSpeedMS)};});return {...row,parks,allocatedMW:parks.find(p=>p.id==='fryslan').powerMW*.1+parks.find(p=>p.id==='beabuorren').powerMW};})});
      }
      // akubishon/datasheetextract uploads data.json and its datasheets to R2 (atlas/v1/...).
      if(url.pathname==='/api/atlas/catalogue'){
        if(!env.BUCKET)return answer({error:'De opslag voor de Waterstofatlas is niet gekoppeld.'},503);
        const object=await env.BUCKET.get(atlasCatalogueKey);
        if(!object)return answer({error:'De Waterstofatlas-catalogus is nog niet geüpload.'},503);
        const data=await object.json();
        if(data.schemaVersion!==1||!Array.isArray(data.models)||data.models.length>500)return answer({error:'Onbekend catalogusformaat.'},502);
        return answer(data);
      }
      if(url.pathname.startsWith(atlasDatasheetRoute)){
        let path;try{path=decodeURIComponent(url.pathname.slice(atlasDatasheetRoute.length));}catch{return answer({error:'Ongeldige datasheet.'},400);}
        if(!atlasDatasheetPath.test(path))return answer({error:'Ongeldige datasheet.'},400);
        if(!env.BUCKET)return answer({error:'De opslag voor de Waterstofatlas is niet gekoppeld.'},503);
        const object=await env.BUCKET.get(atlasDatasheetPrefix+path);
        if(!object)return answer({error:'Deze datasheet is nog niet geüpload.'},404);
        return new Response(object.body,{headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Type':path.endsWith('.png')?'image/png':'application/pdf','Content-Disposition':'inline','Cache-Control':'private, max-age=3600',ETag:object.httpEtag}});
      }
      if(url.pathname==='/api/electrolyser'||url.pathname==='/api/research/day') {
        if(url.pathname==='/api/research/day'&&!await researchAllowed(request,env))return answer({error:'Voer het onderzoekwachtwoord in.'},401);
        const day=url.searchParams.get('day');if(!validDay(day))return answer({error:'Kies een geldige datum.'},400);
        let a,b;try {a=modelOptions(new URLSearchParams({park:'fryslan',station:url.searchParams.get('fryslanStation')||'gemiddelde'}));b=modelOptions(new URLSearchParams({park:'beabuorren',station:url.searchParams.get('beabuorrenStation')||'gemiddelde'}));}catch{return answer({error:'Ongeldig meetstation.'},400);}
        if(!env.KNMI_EDR_API_KEY)return answer({error:'KNMI is nog niet gekoppeld.'},503);
        if(url.pathname==='/api/electrolyser'&&url.searchParams.get('comparison')==='1'){
          const [f,bp]=await Promise.all([readWindComparison(day,env,a),readWindComparison(day,env,b)]);
          const stavoren=combinedSupply(f.stavoren,bp.stavoren),houtribdijk=combinedSupply(f.houtribdijk,bp.houtribdijk);
          const combination=combinedSupply(f.combination,bp.combination).map((p,i)=>({...p,timestamp:p.end,
            highestStation:f.combination[i].highestStation,fallbackStation:f.combination[i].fallbackStation,
            stavorenPowerMW:stavoren[i].powerMW,houtribdijkPowerMW:houtribdijk[i].powerMW,
            differenceMW:stavoren[i].powerMW===null||houtribdijk[i].powerMW===null?null:Math.abs(stavoren[i].powerMW-houtribdijk[i].powerMW)}));
          return answer({day,rule:f.rule,windSource:{fryslan:f.windSource,beabuorren:bp.windSource},stavoren,houtribdijk,combination,unavailable:[...new Set([...f.unavailable,...bp.unavailable])]});
        }
        const [fryslan,beabuorren]=await Promise.all([readWind(day,env,a),readWind(day,env,b)]);
        return answer({day,windSource:{fryslan:fryslan.windSource,beabuorren:beabuorren.windSource},intervals:combinedSupply(fryslan.intervals,beabuorren.intervals)});
      }
      if(url.pathname==='/api/stations'){const park=url.searchParams.get('park')||'fryslan';if(!['fryslan','beabuorren'].includes(park))return answer({error:'Ongeldig windpark.'},400);return answer({stations:stationsByDistance(park)});}
      if (url.pathname === '/api/wind') {
        const day=url.searchParams.get('day');
        if(!validDay(day))return answer({error:'Kies een geldige datum.'},400);
        if(!env.KNMI_EDR_API_KEY)return answer({error:'KNMI-windgegevens zijn nog niet gekoppeld.'},503);
        let options;
        try {options=modelOptions(url.searchParams);}catch{return answer({error:'Ongeldige modelinstellingen. Controleer de waarden en de volgorde van de windsnelheidsgrenzen.'},400);}
        return answer(await (url.searchParams.get('comparison')==='1'?readWindComparison(day,env,options):readWind(day,env,options)));
      }
      if (url.pathname === '/api/history') {
        const day = url.searchParams.get('day');
        if (!validDay(day)) return answer({ error: 'Kies een geldige datum.' }, 400);
        const [y, m, d] = day.split('-').map(Number);
        const data = await read(`historical-data/${y}/${m}/${d}/data`, { env });
        return answer({ day, hours: series(data), totals: finite(data?.['calculated-values']?.production) ? { production: data['calculated-values'].production } : null, available: data !== null });
      }
      if (url.pathname === '/api/catalog') {
        const year = url.searchParams.get('year'), month = url.searchParams.get('month');
        if ((year && !/^\d{4}$/.test(year)) || (month && (!year || !/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12))) return answer({ error: 'Ongeldige kalenderselectie.' }, 400);
        const reference = 'historical-data' + (year ? '/' + Number(year) : '') + (month ? '/' + Number(month) : '');
        return answer({ values: keys(await read(reference, { shallow: true, ttl: 60000, env })) });
      }
      if (url.pathname === '/api/live') {
        const data = await read('live-data/park', { ttl: 800, env });
        if (!data || !finite(data.power) || typeof data.timestamp !== 'string' || data.timestamp.length > 100 || !Number.isFinite(Date.parse(data.timestamp))) throw Error('No live power');
        return answer({ powerKW: data.power, timestamp: new Date(data.timestamp).toISOString(), windSpeed: finite(data.windspeed) ? data.windspeed : null, windDirection: finite(data.winddirection) ? data.winddirection : null, sourceError: data.error ? 'De bron meldt een fout.' : null, receivedAt: new Date().toISOString() });
      }
      return answer({ error: 'Not found' }, 404);
    } catch (error) {
      if(url.pathname==='/api/harmonie'){console.error('HARMONIE_REQUEST_FAILED',error?.message?.startsWith('HARMONIE_')?error.message:'CONNECTION');const messages={HARMONIE_PENDING:'Deze voorspelling bevat nog geen opgeslagen uren voor deze dag. De achtergrondtaak verwerkt nieuwe runs automatisch.',HARMONIE_STORAGE:'De voorspellingenopslag is nog niet beschikbaar.',HARMONIE_P2B_ARCHIVE:'P2b-runs worden door KNMI slechts 72 uur bewaard. Kies een recente run of gebruik P1 voor het archief vanaf 8 januari 2026.',HARMONIE_MEMBER_CONFLICT:'Het P2b-bestand bevat niet eenduidig te scheiden ensembleleden. Er wordt geen gemengde voorspelling getoond.',HARMONIE_RUN_NOT_FOUND:'Deze historische HARMONIE-run ontbreekt in het KNMI-archief. Kies een ander modeluur.',HARMONIE_INVALID_HISTORY:'De historische modelrun of grafiekdag is ongeldig.',HARMONIE_NOT_CONFIGURED:'De KNMI Open Data API-key is nog niet ingesteld.',HARMONIE_AUTH:'De KNMI Open Data API-key geeft geen toegang tot HARMONIE.',HARMONIE_RATE_LIMIT:'Het KNMI-aanvraaglimiet is bereikt. Probeer later opnieuw.',HARMONIE_INCOMPLETE:'De modelrun bevat nog onvoldoende complete voorspellingsuren.',HARMONIE_DOWNLOAD_HOST:'Het downloadadres van KNMI wordt nog niet ondersteund.'};return answer({error:messages[error?.message]||'HARMONIE ophalen of lezen is niet gelukt. Probeer later opnieuw. Er worden geen voorbeeldwaarden als voorspelling getoond.'},502);}
      if(url.pathname==='/api/atlas/catalogue'){console.error('ATLAS_CATALOG_REQUEST_FAILED',error?.name||'Error');return answer({error:'De Waterstofatlas-catalogus kon niet uit de opslag worden gelezen. Probeer opnieuw.'},502);}
      if(url.pathname==='/api/wind') {
        const code=error?.message;
        console.error('KNMI_REQUEST_FAILED', ['KNMI_AUTH','KNMI_CONNECTION','KNMI_UNAVAILABLE','Invalid KNMI data','Invalid KNMI time axis'].includes(code)?code:error?.name||'Error');
        if(code==='KNMI_AUTH')return answer({error:'KNMI weigert de API-sleutel. Controleer of dit een EDR-sleutel is.'},502);
      }
      // Do not expose upstream URLs, tokens, or response bodies to visitors.
      return answer({ error: 'De gegevensbron is tijdelijk niet beschikbaar. Probeer het opnieuw.' }, 502);
    }
  },
  // Cloudflare Cron Trigger: store the newest HARMONIE run of each model; a stored run is skipped.
  async scheduled(event, env, ctx) {
    for(const model of ['p1','p2b']){
      try{const result=await updateHarmonieSnapshot(env,model,{});console.info('HARMONIE_SCHEDULED',JSON.stringify({model,run:result?.run}));}
      catch(error){console.error('HARMONIE_SCHEDULED_FAILED',model,error.message);}
    }
  },
};
