/* __DATA_CLIENT__ */
/* __WIND_CLIENT__ */
const page = /* __PAGE__ */;
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#183c37"/><path d="M32 31v23M32 31L18 11M32 31l25-3M32 31L18 49" stroke="#c8ed79" stroke-width="5" stroke-linecap="round"/></svg>';
const securityHeaders = { 'Content-Security-Policy': /* __CSP__ */, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const answer = (value, status = 200) => Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return answer({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/' || url.pathname === '/beabuorren') return new Response(page, { headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
    if (url.pathname === '/favicon.svg') return new Response(favicon, { headers: { ...securityHeaders, 'Content-Type': 'image/svg+xml' } });
    try {
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
