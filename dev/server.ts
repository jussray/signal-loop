/**
 * Local runner: serves the exact Worker fetch handler on Node with a SQLite-backed D1 shim.
 *   node --experimental-strip-types dev/server.ts
 * Env: PORT (8787), DB_FILE (:memory:), GITHUB_TOKEN, GITHUB_API_BASE
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../src/worker.ts';
import { createD1 } from './d1-sqlite.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  DB: createD1(process.env.DB_FILE || ':memory:', join(root, 'migrations')),
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_API_BASE: process.env.GITHUB_API_BASE,
};
const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  }
  const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body });
  const response = await worker.fetch(request, env);
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`signal-loop dev on http://localhost:${port}`));
