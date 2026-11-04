/* ============================================
   UniTab test harness — CDP headless Chromium
   Shared by every test in test/*.mjs. Each test
   imports launch() and gets a live page to drive.
   ============================================ */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/snap/bin/chromium';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..');           // project root
export const PAGE_URL = 'file://' + join(ROOT, 'newtab.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Launch a headless Chromium with a fresh profile, wired for CDP. Resolves
   with { evalJs, send, close } once the page is navigated and ready. */
export async function launch() {
  const cdpPort = 50000 + Math.floor(Math.random() * 2000);
  const profile = mkdtempSync(join(tmpdir(), 'unitab-test-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files',
    '--window-size=1200,900', 'about:blank'
  ], { stdio: 'ignore', detached: true });

  let ws = null, msgId = 0;
  const pending = new Map();

  /* Find the page target and open a websocket. */
  let pageWs = null;
  for (let i = 0; i < 60 && !pageWs; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p && p.webSocketDebuggerUrl) pageWs = p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!pageWs) await sleep(250);
  }
  ws = new WebSocket(pageWs);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  };
  await new Promise((r) => ws.onopen = r);

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evalJs = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true
    });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
    return result && result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1200, height: 900, deviceScaleFactor: 1, mobile: false
  });

  /* Kill the whole process group (the browser spawns children). */
  const close = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* already dead */ } };
  process.on('exit', close);

  return { send, evalJs, sleep, close };
}

/* Inject the chrome.runtime shim before the page scripts run. `sendMessage`
   defaults to a Bing JSONP stub; pass `stub` to override. */
export async function stubRuntime({ evalJs, send }, stub) {
  const sendMessage = stub || `((m,cb)=>{ if(cb)cb({ok:true,text:'({"images":[{"url":"http://x/y.jpg","copyright":"c","copyrightlink":"https://cn.bing.com/search?q=x"}]})'}) })`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{
    window.chrome=window.chrome||{};window.chrome.runtime=window.chrome.runtime||{};
    if(!window.chrome.runtime.getURL)window.chrome.runtime.getURL=(p)=>'file://'+encodeURI('${ROOT}/'+String(p).replace(/^\\/+/, ''));
    if(!window.chrome.runtime.sendMessage)window.chrome.runtime.sendMessage=${sendMessage};
  })();` });
}

/* Result collector. */
export function results() {
  const list = [];
  const ok = (name, cond) => {
    list.push({ name, pass: !!cond });
    console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  };
  const finish = () => {
    const fails = list.filter((r) => !r.pass).length;
    console.log(`\n${list.length - fails}/${list.length} passed`);
    return fails ? 1 : 0;
  };
  return { ok, finish };
}
