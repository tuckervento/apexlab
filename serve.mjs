// Zero-dependency static server for local development. Browsers don't load ES modules (or Web Workers) from
// file://, so the app is served over HTTP:  node serve.mjs  →  http://localhost:8000  (PORT=… to change).
// Listens on 127.0.0.1 only; paths are confined to the repo and dot-paths (.git etc.) are refused.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url)), PORT = Number(process.env.PORT || 8000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || file.slice(ROOT.length).split(sep).some(s => s.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch (e) {
    const missing = e.code === 'ENOENT' || e.code === 'EISDIR';
    res.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : `Error: ${e.code || e.message}`);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Apex Lab: http://localhost:${PORT}/`));
