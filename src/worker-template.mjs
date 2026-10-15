/* __DATA_CLIENT__ */
/* __WIND_CLIENT__ */
const page = /* __PAGE__ */;
const brandFont = /* __BRAND_FONT__ */;
const favicon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h48a16 16 0 0 1 16 16v48H0z" fill="#0C2340"/><path d="M32 31v23M32 31L18 11M32 31l25-3M32 31L18 49" stroke="#00A6DE" stroke-width="5"/></svg>';
const securityHeaders = { 'Content-Security-Policy': /* __CSP__ */, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const answer = (value, status = 200) => Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
const authAttempts=new Map();
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
function loginPage(message='',next='/',status=401){
 const html=`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Wachtwoord</title></head><body><form method="post" action="/auth/site"><input type="hidden" name="next" value="${escapeHtml(safeNext(next))}"><label for="password">Wachtwoord</label> <input id="password" type="password" name="password" required maxlength="1024" autocomplete="current-password" autofocus${message?` title="${escapeHtml(message)}" aria-description="${escapeHtml(message)}" aria-invalid="true"`:''}></form></body></html>`;
 return new Response(html,{status,headers:{...securityHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
async function gateRequest(request,env,url){
 const secret=siteSecret(env);
 if(url.pathname==='/auth/logout'&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:'/','Cache-Control':'no-store','Set-Cookie':'__Host-site_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});
 }
 if(url.pathname==='/auth/site'&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
  if(!secret)return loginPage('Toegang is nog niet ingesteld. Neem contact op met de beheerder.','/',503);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',now=Date.now();
  const previous=siteAttempts.get(ip);const attempts=previous&&previous.until>now?previous:{count:0,until:now+900000};
  if(attempts.count>=5)return loginPage('Te veel pogingen. Probeer over 15 minuten opnieuw.','/',429);
  if(siteAttempts.size>=10000&&!siteAttempts.has(ip))return loginPage('Probeer het later opnieuw.','/',429);
  if(siteAttempts.size>1000)for(const [key,value] of siteAttempts)if(value.until<=now)siteAttempts.delete(key);
  attempts.count++;siteAttempts.set(ip,attempts);
  if(Number(request.headers.get('Content-Length')||0)>8192)return loginPage('Ongeldige aanvraag.','/',400);
  let input;try{const body=await request.text();if(body.length>8192)throw Error();input=new URLSearchParams(body);}catch{return loginPage('Ongeldige aanvraag.','/',400);}
  const password=input.get('password'),next=safeNext(input.get('next'));
  if(typeof password!=='string'||password.length>1024)return loginPage('Onjuist wachtwoord.',next);
  const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(secret))),actual=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password)));
  let difference=0;for(let i=0;i<expected.length;i++)difference|=expected[i]^actual[i];
  if(difference)return loginPage('Onjuist wachtwoord.',next);
  siteAttempts.delete(ip);
  return new Response(null,{status:303,headers:{...securityHeaders,Location:next,'Cache-Control':'no-store','Set-Cookie':`__Host-site_session=${await siteSession(secret)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200`}});
 }
 if(await siteAllowed(request,env))return null;
 if(url.pathname.startsWith('/api/'))return answer({error:'Voer eerst het websitewachtwoord in.'},401);
 return loginPage(secret?'':'Toegang is nog niet ingesteld. Neem contact op met de beheerder.',url.pathname+url.search,secret?401:503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const gate=await gateRequest(request,env,url);if(gate)return gate;
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
    if ((url.pathname === '/assets/tasa-orbiter.ttf' || url.pathname === '/proefstijl/font.ttf')) return new Response(Uint8Array.from(atob(brandFont),c=>c.charCodeAt(0)), {headers:{...securityHeaders,'Content-Type':'font/ttf','Cache-Control':'public, max-age=86400'}});
    const formerTrialPages={'/proefstijl':'/','/proefstijl/beabuorren':'/beabuorren','/proefstijl/elektrolyser':'/elektrolyser','/proefstijl/onderzoek':'/onderzoek'};
    if(Object.hasOwn(formerTrialPages,url.pathname))return new Response(null,{status:302,headers:{...securityHeaders,Location:formerTrialPages[url.pathname]+url.search,'Cache-Control':'no-store'}});
    if (url.pathname === '/' || url.pathname === '/beabuorren' || url.pathname === '/elektrolyser' || url.pathname === '/onderzoek') return new Response(page, { headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
    if (url.pathname === '/favicon.svg') return new Response(favicon, { headers: { ...securityHeaders, 'Content-Type': 'image/svg+xml' } });
    try {
      if(url.pathname==='/api/atlas/catalogue'){
        if(!env.WINDPARK_CATALOG_TOKEN)return answer({error:'Waterstofatlas is nog niet gekoppeld.'},503);
        const r=await fetch('https://waterstofatlas.nl/api/integrations/mijnwindpark/catalogue',{headers:{Authorization:'Bearer '+env.WINDPARK_CATALOG_TOKEN},redirect:'manual'});
        if(!r.ok){console.error('ATLAS_CATALOG_UPSTREAM_STATUS',r.status);return answer({error:'Waterstofatlas is tijdelijk niet beschikbaar.'},502);}
        const data=await r.json();
        if(data.schemaVersion!==1||!Array.isArray(data.models)||data.models.length>500)return answer({error:'Onbekend catalogusformaat.'},502);
        return answer(data);
      }
      if(url.pathname==='/api/electrolyser'||url.pathname==='/api/research/day') {
        if(url.pathname==='/api/research/day'&&!await researchAllowed(request,env))return answer({error:'Voer het onderzoekwachtwoord in.'},401);
        const day=url.searchParams.get('day');if(!validDay(day))return answer({error:'Kies een geldige datum.'},400);
        let a,b;try {a=modelOptions(new URLSearchParams({park:'fryslan',station:url.searchParams.get('fryslanStation')||'0-20000-0-06267'}));b=modelOptions(new URLSearchParams({park:'beabuorren',station:url.searchParams.get('beabuorrenStation')||'0-20000-0-06267'}));}catch{return answer({error:'Ongeldig meetstation.'},400);}
        if(!env.KNMI_EDR_API_KEY)return answer({error:'KNMI is nog niet gekoppeld.'},503);
        const [fryslan,beabuorren]=await Promise.all([readWind(day,env,a),readWind(day,env,b)]);
        return answer({day,intervals:combinedSupply(fryslan.intervals,beabuorren.intervals)});
      }
      if(url.pathname==='/api/stations'){const park=url.searchParams.get('park')||'fryslan';if(!['fryslan','beabuorren'].includes(park))return answer({error:'Ongeldig windpark.'},400);return answer({stations:stationsByDistance(park)});}
      if (url.pathname === '/api/wind') {
        const day=url.searchParams.get('day');
        if(!validDay(day))return answer({error:'Kies een geldige datum.'},400);
        if(!env.KNMI_EDR_API_KEY)return answer({error:'KNMI-windgegevens zijn nog niet gekoppeld.'},503);
        let options;
        try {options=modelOptions(url.searchParams);}catch{return answer({error:'Ongeldige modelinstellingen. Controleer de waarden en de volgorde van de windsnelheidsgrenzen.'},400);}
        return answer(await readWind(day,env,options));
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
      if(url.pathname==='/api/wind') {
        const code=error?.message;
        console.error('KNMI_REQUEST_FAILED', ['KNMI_AUTH','KNMI_CONNECTION','KNMI_UNAVAILABLE','Invalid KNMI data','Invalid KNMI time axis'].includes(code)?code:error?.name||'Error');
        if(code==='KNMI_AUTH')return answer({error:'KNMI weigert de API-sleutel. Controleer of dit een EDR-sleutel is.'},502);
      }
      // Do not expose upstream URLs, tokens, or response bodies to visitors.
      return answer({ error: 'De gegevensbron is tijdelijk niet beschikbaar. Probeer het opnieuw.' }, 502);
    }
  },
};
