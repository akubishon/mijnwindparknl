import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
const project = fileURLToPath(new URL('..', import.meta.url));
// Runtime secrets come from the environment or a local .env; variables already set take precedence.
try { process.loadEnvFile(resolve(project, '.env')); } catch {}
const names = ['WPF_PUBLIC_CLIENT_KEY', 'WPF_FIREBASE_API_KEY', 'SITE_PASSWORD', 'RESEARCH_PASSWORD', 'KNMI_EDR_API_KEY', 'KNMI_OPEN_DATA_API_KEY'];
const env = Object.fromEntries(names.filter(name => process.env[name]).map(name => [name, process.env[name]]));
if (!env.WPF_PUBLIC_CLIENT_KEY || !env.WPF_FIREBASE_API_KEY) {
  const apk = resolve(project, '../WP Fryslân.apk');
  const extract = name => { const r = spawnSync('unzip', ['-p', apk, name], { maxBuffer: 64 * 1024 * 1024 }); if (r.status) throw Error('Supply runtime environment variables or keep WP Fryslân.apk in the parent directory.'); return r.stdout; };
  const dex = extract('classes4.dex'), strings = [];
  for (let i = 0; i < dex.readUInt32LE(56); i++) { let p = dex.readUInt32LE(dex.readUInt32LE(60) + i * 4); while (dex[p++] & 128) {} strings.push(dex.toString('utf8', p, dex.indexOf(0, p))); }
  env.WPF_PUBLIC_CLIENT_KEY = strings.find(s => s.startsWith('A!uis'));
  const resources = extract('resources.arsc');
  // Firebase's API key is ASCII in the global Android resource string pool.
  env.WPF_FIREBASE_API_KEY = resources.toString('latin1').match(/AIza[\w-]{35}/)?.[0];
}
if (!env.WPF_PUBLIC_CLIENT_KEY || !env.WPF_FIREBASE_API_KEY) throw Error('The APK does not contain the expected client configuration.');
const port = Number(process.env.PORT || 8787);
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Local server error' })); }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Fryslân explorer: http://localhost:${port}`);
  if (!env.SITE_PASSWORD && !env.RESEARCH_PASSWORD) console.log('SITE_PASSWORD is not set: the site stays locked.');
});
