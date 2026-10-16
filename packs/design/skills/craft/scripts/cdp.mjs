// A minimal Chrome DevTools Protocol client for detect.mjs and shoot.mjs: launches headless Chrome, Edge, or
// Chromium with a throwaway profile (never the user's own), opens one page, and closes everything afterwards.
// No npm packages: Node's built-in WebSocket (Node 22+) speaks the protocol.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function findBrowser(explicit) {
  const candidates = [
    explicit, process.env.FLOWSTATE_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

// A target is a URL (http, https, file) or a path to a local HTML file.
export function toUrl(target) {
  if (/^(https?|file):/i.test(target)) return target;
  const p = resolve(target);
  if (!existsSync(p)) throw new Error(`Not a URL and no such file: ${target}`);
  return pathToFileURL(p).href;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withPage(fn, { browser: explicit, timeout = 45000 } = {}) {
  const browser = findBrowser(explicit);
  if (!browser) throw Object.assign(new Error('No Chrome, Edge, or Chromium found. Install one, or pass --browser <path> (or set FLOWSTATE_BROWSER).'), { code: 'NO_BROWSER' });
  const profile = mkdtempSync(join(tmpdir(), 'flowstate-cdp-'));
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  const deadline = setTimeout(() => proc.kill(), timeout);
  try {
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('The browser did not start its DevTools endpoint in 20s.')), 20000);
      proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); res(m[1]); }
      });
      proc.on('exit', (code) => { clearTimeout(t); rej(new Error(`The browser exited (code ${code}) before it was ready.`)); });
    });
    ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('Could not connect to the browser.')); });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
      } else if (msg.method) for (const l of [...listeners]) l(msg);
    };
    const call = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => call(method, params, sessionId);
    const once = (method) => new Promise((res) => { const l = (m) => { if (m.method === method && m.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); res(m.params); } }; listeners.push(l); });
    await send('Page.enable');
    await send('Runtime.enable');
    const page = {
      send,
      async viewport(width, height, mobile = false) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
        if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      },
      async goto(url) {
        const loaded = once('Page.loadEventFired');
        const nav = await send('Page.navigate', { url });
        if (nav.errorText) throw new Error(`Could not open ${url}: ${nav.errorText}`);
        await Promise.race([loaded, sleep(20000)]);
        await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
        await sleep(300);
      },
      async evaluate(expression) {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(`In-page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
        return r.result.value;
      },
      async screenshot(full = true) {
        let clip;
        if (full) {
          const m = await send('Page.getLayoutMetrics');
          const size = m.cssContentSize ?? m.contentSize;
          clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 16000), scale: 1 };
        }
        const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
        return Buffer.from(r.data, 'base64');
      },
    };
    return await fn(page);
  } finally {
    clearTimeout(deadline);
    try { ws?.close(); } catch { /* already closed */ }
    proc.kill();
    await sleep(150);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temp profile is harmless */ }
  }
}
