/* __DATA_CLIENT__ */
/* __WIND_CLIENT__ */
const page = /* __PAGE__ */;
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#183c37"/><path d="M32 31v23M32 31L18 11M32 31l25-3M32 31L18 49" stroke="#c8ed79" stroke-width="5" stroke-linecap="round"/></svg>';
const securityHeaders = { 'Content-Security-Policy': /* __CSP__ */, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(url.pathname==='/api/research/auth'&&request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return answer({error:'Ongeldige aanvraag.'},403);
      if(!env.RESEARCH_PASSWORD)return answer({error:'Onderzoek is vergrendeld: het wachtwoord is nog niet ingesteld.'},503);
      const ip=request.headers.get('CF-Connecting-IP')||'unknown',now=Date.now();
      const previous=authAttempts.get(ip);const attempts=previous&&previous.until>now?previous:{count:0,until:now+900000};
      if(attempts.count>=5)return answer({error:'Te veel pogingen. Probeer over 15 minuten opnieuw.'},429);
      attempts.count++;authAttempts.set(ip,attempts);if(authAttempts.size>1000)authAttempts.delete(authAttempts.keys().next().value);
      if(Number(request.headers.get('Content-Length')||0)>4096)return answer({error:'Ongeldige aanvraag.'},400);
      let input;try{const body=await request.text();if(body.length>4096)throw Error();input=JSON.parse(body);}catch{return answer({error:'Ongeldige aanvraag.'},400);}
      if(typeof input.password!=='string'||input.password.length>1024)return answer({error:'Onjuist wachtwoord.'},401);
      const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(env.RESEARCH_PASSWORD)));
      const actual=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(input.password)));
      let difference=0;for(let i=0;i<expected.length;i++)difference|=expected[i]^actual[i];
      if(difference)return answer({error:'Onjuist wachtwoord.'},401);
      authAttempts.delete(ip);return answer({token:await researchToken(env.RESEARCH_PASSWORD)});
    }
    if (request.method !== 'GET') return answer({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/' || url.pathname === '/beabuorren' || url.pathname === '/elektrolyser' || url.pathname === '/onderzoek') return new Response(page, { headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
    if (url.pathname === '/favicon.svg') return new Response(favicon, { headers: { ...securityHeaders, 'Content-Type': 'image/svg+xml' } });
    try {
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
