// P&L for the Pulse `pnl` tool — TEMPORARY COPY of the P&L page logic (docs/BACKLOG.md: replace with a shared module).
// It runs the dashboard's own PnLPage component (vendor/pnl/pnl-bundle.mjs, built from origin/main by
// scripts/build-pnl-bundle.mjs) in a headless DOM in its existing `summaryOnly` mode, with the same /api/bq payload the
// P&L screen gets, and reads the numbers the page itself computes (gross, net, COGS, SnD, CM1, CM1 %, COGS %, marketing %).
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { getBQ } from './bigquery.js';
import { dashAuth } from './dashboardApi.js';

const DASH = process.env.DASHBOARD_URL || 'https://frido-navigator.vercel.app';
const CACHE_MS = 30 * 60 * 1000;
const payloadCache = new Map();
let PnLPage = null;
let domReady = false;

const realFetch = globalThis.fetch.bind(globalThis);

// The page's authFetch passes `headers` as a Headers object. Spreading one gives {} and silently dropped Content-Type, so
// /api/cogs-monthly got no body and answered 400; the page treats that as "no COGS rows" and falls back to its estimate
// (found 2026-11-24: D2C Oct COGS 47.3% on the canary vs 41.9% on the page). Merge through Headers instead.
export function mergeHeaders(h) {
  const out = new Headers(h || {});
  for (const [k, v] of Object.entries(dashAuth())) out.set(k, v);
  return out;
}
const installed = [];   // DOM globals we added, removed again after every run (the Anthropic SDK refuses to start when window exists)
let chain = Promise.resolve();   // one headless render at a time

function setupDom() {
  if (domReady) return;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `${DASH}/`, pretendToBeVisual: true });
  const w = dom.window;
  const def = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); installed.push(k); } catch { /* ignore */ } };
  def('window', w); def('document', w.document); def('navigator', w.navigator);
  def('localStorage', w.localStorage); def('sessionStorage', w.sessionStorage);
  // Only what the page needs. Event / CustomEvent / Node are left alone: Node's fetch (undici) extends the global Event.
  for (const k of ['HTMLElement', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (w[k]) def(k, typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k]);
  }
  w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  def('matchMedia', w.matchMedia);
  class RO { observe() {} unobserve() {} disconnect() {} }
  def('ResizeObserver', RO); w.ResizeObserver = RO;
  def('IntersectionObserver', RO); w.IntersectionObserver = RO;
  // The page fetches relative URLs (/api/cogs-monthly, /snd-rates.json); point them at the dashboard.
  globalThis.fetch = (url, opts) => (typeof url === 'string' && url.startsWith('/') ? realFetch(DASH + url, { ...opts, headers: mergeHeaders(opts && opts.headers) }) : realFetch(url, opts));
  w.fetch = globalThis.fetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  domReady = true;
}

function teardownDom() {
  for (const k of installed) { try { delete globalThis[k]; } catch { /* ignore */ } }
  installed.length = 0;
  globalThis.fetch = realFetch;
  domReady = false;
}

async function loadPayload(start, end) {
  const key = `${start}|${end}`;
  const hit = payloadCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const r = await fetch(`${DASH}/api/bq`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...dashAuth() }, body: JSON.stringify({ start, end }), signal: AbortSignal.timeout(170000) });
  if (!r.ok) throw new Error(`dashboard /api/bq returned ${r.status}`);
  const data = await r.json();
  payloadCache.set(key, { at: Date.now(), data });
  return data;
}

// tab: shopify (D2C) | amazon | flipkart | ebo | offline | blinkit | zepto | instamart | cred | firstcry | myntra
async function runPnlOnce({ tab, start, end }) {
  setupDom();
  if (!PnLPage) PnLPage = (await import('../vendor/pnl/pnl-bundle.mjs')).default;
  const data = await loadPayload(start, end);
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const root = createRoot(mount);
  try {
    const summary = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('P&L page did not report a summary in time')), 90000);
      root.render(React.createElement(PnLPage, {
        data, filters: { start, end }, setFilters() {}, activeTab: tab, setActiveTab() {},
        amzChannelView: 'all', setAmzChannelView() {}, offlineSub: 'all', setOfflineSub() {}, d2cSubCh: 'all', setD2cSubCh() {},
        summaryOnly: true, withMargins: true,
        onSummary: values => { clearTimeout(timer); resolve(values); },
      }));
    });
    return summary;
  } finally {
    root.unmount();
    mount.remove();
  }
}

export function runPnl(args) {
  const run = chain.then(async () => {
    try { return await runPnlOnce(args); } finally { teardownDom(); }
  });
  chain = run.catch(() => {});
  return run;
}
