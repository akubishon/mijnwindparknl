const DATABASE = 'https://windpark-fryslan-default-rtdb.europe-west1.firebasedatabase.app';
let authPromise, authExpires = 0;
const cache = new Map();
async function json(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Data service returned HTTP ${response.status}`);
  return response.json();
}
async function token(env) {
  if (authPromise && Date.now() < authExpires) return authPromise;
  authExpires = Date.now() + 50 * 60 * 1000;
  authPromise = (async () => {
    const key = env.WPF_PUBLIC_CLIENT_KEY;
    const apiKey = env.WPF_FIREBASE_API_KEY;
    if (!key || !apiKey) throw new Error('Data service is not configured');
    const auth = await json('https://wpf-back-end.livemegawatt.com/auth/public-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
    });
    const session = await json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: auth.token, returnSecureToken: true }),
    });
    if (!session.idToken) throw new Error('Data service sign-in failed');
    return session.idToken;
  })();
  authPromise.catch(() => { authExpires = 0; });
  return authPromise;
}
export async function read(reference, { shallow = false, ttl = 30000, env } = {}) {
  const key = reference + ':' + shallow;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.promise;
  const promise = (async () => {
    const idToken = await token(env);
    const data = await json(`${DATABASE}/${reference}.json?auth=${encodeURIComponent(idToken)}${shallow ? '&shallow=true' : ''}`);
    if (data?.error) throw new Error('Data service denied access');
    return data;
  })();
  cache.set(key, { expires: Date.now() + ttl, promise });
  promise.catch(() => { cache.delete(key); authExpires = 0; });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return promise;
}
export function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
  const d = new Date(day + 'T12:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === day;
}
export function keys(data) {
  return Object.keys(data || {}).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
}
export function series(data) {
  const raw = data?.['energy-produced'];
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).filter(([i, v]) => /^\d+$/.test(i) && typeof v === 'number' && Number.isFinite(v))
    .map(([i, v]) => ({ hour: Number(i), kWh: v })).sort((a, b) => a.hour - b.hour);
}
