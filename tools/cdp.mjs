// Drive the real app in headless Chrome over the DevTools protocol, with no dependencies (Node's built-in WebSocket and an
// installed Chrome; CHROME=<path> if it isn't at the macOS default). For what the Node tests can't reach: controls.js,
// main.js, the panel and the frame loop.
//
//   node tools/cdp.mjs tools/scenarios/refused.mjs
//
// A scenario module's default export gets {run, sleep}: run(expr) evaluates expr in the page (a promise is awaited) and
// returns its value; the page's own modules are reachable with import('/src/app/state.js') and the like, the same
// instances the app uses. The result is printed with the page's console errors; a page exception exits 1.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function withApp(fn, { port = 8765, debugPort = 9333, bootMs = 5000, chrome = process.env.CHROME || MAC_CHROME } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'apexlab-cdp-')), exceptions = [], errors = [];
  const server = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      await sleep(200);
      try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    }
    if (!page) throw new Error(`Chrome gave no page on port ${debugPort} (is ${chrome} right? set CHROME=<path>)`);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('DevTools socket failed to open')); });
    let id = 0; const waiting = new Map();
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').split('\n')[0]);
    };
    const call = (method, params = {}) => new Promise(r => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const run = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.error) throw new Error(`DevTools: ${r.error.message}`);
      if (r.result.exceptionDetails) throw new Error(`in the page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
      return r.result.result.value;
    };
    await call('Runtime.enable');
    await call('Page.navigate', { url: `http://localhost:${port}/` });
    await sleep(bootMs); // the worker builds the car and circuit and starts searching
    return { result: await fn({ run, sleep }), exceptions, errors };
  } finally {
    ws?.close(); browser.kill(); server.kill();
    await sleep(300); rmSync(profile, { recursive: true, force: true }); // our own temporary profile
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/cdp.mjs <scenario.mjs>'); process.exit(2); }
  const scenario = (await import(pathToFileURL(resolve(file)).href)).default;
  const { result, exceptions, errors } = await withApp(scenario);
  console.log(JSON.stringify(result, null, 1));
  if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
  if (exceptions.length) { console.log('PAGE EXCEPTIONS:\n  ' + exceptions.join('\n  ')); process.exit(1); }
}
