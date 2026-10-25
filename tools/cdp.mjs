// Drive the real app in headless Chrome over the DevTools protocol, with no dependencies (Node's built-in WebSocket and an
// installed Chrome; CHROME=<path> if it isn't at the macOS default). For what the Node tests can't reach: controls.js,
// main.js, the panel and the frame loop.
//
//   node tools/cdp.mjs tools/scenarios/refused.mjs
//
// A scenario module's default export gets {run, sleep, call} (call: the raw DevTools protocol, e.g. for screenshots): run(expr) evaluates expr in the page (a promise is awaited) and
// returns its value; the page's own modules are reachable with import('/src/app/state.js') and the like, the same
// instances the app uses. The result is printed with the page's console errors.
//
// WebGL2 (task 0.5 of PLAN.md). --disable-gpu, the default, gives no WebGL2 at all (getContext('webgl2') is null). With
// `--use-angle=swiftshader --enable-unsafe-swiftshader` (GL_FLAGS below; `--use-angle=swiftshader` alone also worked here, the
// second flag is for Chrome versions that no longer fall back to SwiftShader without it) the page gets WebGL 2.0 (OpenGL ES 3.0
// Chromium) on "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)", and
// EXT_clip_control is available. tools/scenarios/webgl2.mjs checks this. tools/shot.mjs has the screenshot compare (tolerant: a
// software rasteriser differs from a GPU). Ports: APEX_PORT / APEX_DEBUG_PORT override the defaults (8765 / 9333) per run.
//
// Exit codes: 0 pass; 1 the scenario failed (a page exception, an exception from the scenario, or a result of the form
// {allTrue: false, checks}); 2 the driver couldn't run it (Chrome or serve.mjs didn't start, the page didn't load, the
// DevTools socket failed: a DriverError, with its reason printed). Errors are always printed, never swallowed.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The harness failed, not the app: Chrome, serve.mjs, the page load or the DevTools socket (exit 2).
export class DriverError extends Error {}

// WebGL2 is opt-in (webgl:true, or APEX_WEBGL=1, or a scenario module's `export const options = {webgl: true}`, which the CLI
// passes to withApp); every other scenario keeps --disable-gpu. These flags are what worked, on Chrome 155.0.8059.85, macOS:
const GL_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export async function withApp(fn, { port = +process.env.APEX_PORT || 8765, debugPort = +process.env.APEX_DEBUG_PORT || 9333, bootMs = 5000, callMs = 120000,
  chrome = process.env.CHROME || MAC_CHROME, webgl = process.env.APEX_WEBGL === '1' } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'apexlab-cdp-')), exceptions = [], errors = [];
  const server = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  const browser = spawn(chrome, ['--headless=new', ...(webgl ? GL_FLAGS : ['--disable-gpu']), '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null, serverErr = '', serverExit = null, chromeErr = null;
  server.stderr.on('data', d => { serverErr += d; });
  server.on('exit', code => { serverExit = code; });
  browser.on('error', e => { chromeErr = e; }); // a bad CHROME path: without a listener this would crash the process
  const harness = () => {
    if (chromeErr) throw new DriverError(`could not start Chrome at ${chrome}: ${chromeErr.message} (set CHROME=<path>)`);
    if (serverExit !== null) throw new DriverError(`serve.mjs exited (code ${serverExit}) on port ${port}${serverErr.trim() ? ': ' + (serverErr.split('\n').find(l => /Error/.test(l)) || serverErr.trim().split('\n').pop()).trim() : ''}`);
  };
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      await sleep(200); harness();
      try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    }
    if (!page) throw new DriverError(`Chrome gave no page on DevTools port ${debugPort} (in use? is ${chrome} right? set CHROME=<path>)`);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new DriverError('DevTools socket failed to open')); });
    let id = 0; const waiting = new Map();
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').split('\n')[0]);
    };
    // every DevTools call has a time limit (callMs, well above the slowest scenario), so a page that never answers can't hang the driver
    const call = (method, params = {}) => new Promise((r, fail) => {
      const i = ++id, timer = setTimeout(() => { waiting.delete(i); fail(new DriverError(`DevTools ${method} got no answer in ${callMs / 1000} s`)); }, callMs);
      waiting.set(i, m => { clearTimeout(timer); r(m); }); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const run = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.error) throw new DriverError(`DevTools: ${r.error.message}`);
      if (r.result.exceptionDetails) throw new Error(`in the page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
      return r.result.result.value;
    };
    await call('Runtime.enable');
    // our own server must be the one answering on the port: another process there would hang the load or serve another page
    // (127.0.0.1, the address serve.mjs binds: localhost can resolve to ::1 first, where another process may be listening)
    const url = `http://127.0.0.1:${port}/`, until = Date.now() + 6000;
    let ours = false;
    while (!ours && Date.now() < until) {
      harness();
      try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); ours = (await r.text()).includes('<title>Apex Lab</title>'); } catch {}
      if (!ours) await sleep(200);
    }
    if (!ours) { harness(); throw new DriverError(`port ${port} doesn't answer with the app: held by something else? (PORT is fixed per run; free it or pass another)`); }
    const nav = await call('Page.navigate', { url });
    if (nav.result?.errorText) { await sleep(300); harness(); throw new DriverError(`the page didn't load from port ${port}: ${nav.result.errorText}`); }
    await sleep(bootMs); // the worker builds the car and circuit and starts searching
    harness();
    return { result: await fn({ run, sleep, call }), exceptions, errors }; // call(method, params): raw DevTools protocol
  } finally {
    ws?.close(); browser.kill(); server.kill();
    await sleep(300); rmSync(profile, { recursive: true, force: true }); // our own temporary profile
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/cdp.mjs <scenario.mjs>'); process.exit(2); }
  let out;
  try { const mod = await import(pathToFileURL(resolve(file)).href); out = await withApp(mod.default, mod.options); }
  catch (e) {
    if (e instanceof DriverError) { console.error('DRIVER ERROR (exit 2): ' + e.message); process.exit(2); }
    console.error('SCENARIO FAILED (exit 1): ' + (e?.stack || e)); process.exit(1);
  }
  const { result, exceptions, errors } = out;
  console.log(JSON.stringify(result, null, 1));
  if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
  if (exceptions.length) { console.log('PAGE EXCEPTIONS:\n  ' + exceptions.join('\n  ')); process.exit(1); }
  if (result && result.allTrue === false) { console.log('FAILED: a check is false'); process.exit(1); } // scenarios that report {allTrue, checks}
}
