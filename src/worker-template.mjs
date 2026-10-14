/* __DATA_CLIENT__ */
const page = /* __PAGE__ */;
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#183c37"/><path d="M32 31v23M32 31L18 11M32 31l25-3M32 31L18 49" stroke="#c8ed79" stroke-width="5" stroke-linecap="round"/></svg>';
const answer = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return answer({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/') return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });
    if (url.pathname === '/favicon.svg') return new Response(favicon, { headers: { 'Content-Type': 'image/svg+xml' } });
    try {
      if (url.pathname === '/api/history') {
        const day = url.searchParams.get('day');
        if (!validDay(day)) return answer({ error: 'Choose a valid date.' }, 400);
        const [y, m, d] = day.split('-').map(Number);
        const data = await read(`historical-data/${y}/${m}/${d}/data`, { env });
        return answer({ day, hours: series(data), totals: data?.['calculated-values'] || null, available: data !== null });
      }
      if (url.pathname === '/api/catalog') {
        const year = url.searchParams.get('year'), month = url.searchParams.get('month');
        if ((year && !/^\d{4}$/.test(year)) || (month && (!year || !/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12))) return answer({ error: 'Invalid calendar selection.' }, 400);
        const reference = 'historical-data' + (year ? '/' + Number(year) : '') + (month ? '/' + Number(month) : '');
        return answer({ values: keys(await read(reference, { shallow: true, ttl: 60000, env })) });
      }
      if (url.pathname === '/api/live') {
        const data = await read('live-data/park', { ttl: 800, env });
        if (!data || typeof data.power !== 'number') throw Error('No live power');
        return answer({ powerKW: data.power, timestamp: data.timestamp, windSpeed: data.windspeed ?? null, windDirection: data.winddirection ?? null, sourceError: data.error || null, receivedAt: new Date().toISOString() });
      }
      return answer({ error: 'Not found' }, 404);
    } catch {
      // Do not expose upstream URLs, tokens, or response bodies to visitors.
      return answer({ error: 'The data service is temporarily unavailable. Please retry.' }, 502);
    }
  },
};
