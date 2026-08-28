/* Whole-artifact integration + contract tests.
 *
 * This is the regression net for the two classes of bug that actually shipped:
 *   1. a silently TRUNCATED module — passes `node --check` and the byte-for-byte golden-master, then
 *      throws at runtime and blanks every panel. Evaluating the FULL assembled <script> in a stubbed
 *      DOM is the only thing that catches it.
 *   2. a STALE / partial DATA snapshot injected at deploy — drops KPI tiles. The contract tests below
 *      assert the deployed artifact carries the full 19-key DATA and the Retirement KPI tiles that
 *      the current book can actually paint (look-through is conditional on a mapped held fund).
 *
 * Run: node --test tests/dash/test_integration.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox, PROJ } = require('./_dom');

const DEPLOYED = path.join(PROJ, 'dashboard', 'tech_drawdown_dashboard.html');
const html = fs.readFileSync(DEPLOYED, 'utf8');

// Pull the main inline <script> (the last script block, no src attribute).
function mainScript(h) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, last = null;
  while ((m = re.exec(h)) !== null) last = m[1];
  return last;
}

// Extract the `const DATA = {...};` object by brace-matching (regex is unsafe on nested braces).
function extractDATA(h) {
  const key = 'const DATA = ';
  const start = h.indexOf(key) + key.length;
  let depth = 0, i = start, inStr = false, q = '', esc = false;
  for (; i < h.length; i++) {
    const c = h[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; }
    else if (c === '"' || c === "'") { inStr = true; q = c; }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return JSON.parse(h.slice(start, i));
}

// Run the WHOLE inline script ONCE in an isolated vm context and cache it. Isolation matters: the
// script has top-level `const DATA`/`const C`, so a second run in the same lexical scope would throw
// "already declared". A fresh context also lets `self`/UMD (RankingEngine, RankingStore) attach to
// the sandbox global; prepending `var module;` forces their browser branch (no phantom module.exports).
let _ctx = null, _ctxErr = null;
function dash() {
  if (_ctx || _ctxErr) { if (_ctxErr) throw _ctxErr; return _ctx; }
  try {
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    vm.runInContext('var module;\n' + mainScript(html), sandbox, { filename: 'dashboard_inline.js' });
    _ctx = { sandbox, store: sandbox._store };
  } catch (e) { _ctxErr = e; throw e; }
  return _ctx;
}

// ---------- contract tests (static, on the deployed file) ----------

test('deployed artifact is well-formed (closing tags, no placeholder, 2 script tags)', () => {
  assert.ok(html.trimEnd().endsWith('</html>'), 'ends with </html>');
  assert.equal((html.match(/<\/script>/g) || []).length, 2, 'exactly two script tags');
  assert.ok(!html.includes('__DATA__'), 'DATA placeholder was substituted');
});

test('embedded DATA carries the full 19-key contract (no stale/partial snapshot)', () => {
  const D = extractDATA(html);
  const required = ['sp', 'nasdaq', 'dow', 'etfs', 'thematic', 'mutualfunds', 'ira', 'brokerage',
    'coreRank', 'splits', 'indexHistory', 'macroHistory', 'history', 'alerts', 'dividends', 'dcf', 'lookthrough', 'earnings', 'dcfMonitor'];
  for (const k of required) assert.ok(k in D, `DATA.${k} present`);
  assert.ok(D.ira.length && D.brokerage.length && D.coreRank.length, 'core account keys non-empty');
});

test('the tile-driving keys are populated (dividends / dcf / lookthrough)', () => {
  const D = extractDATA(html);
  assert.ok(D.dividends && D.dividends.annual > 0, 'dividends.annual drives .kpidiv');
  assert.ok(Object.keys(D.dcf || {}).length > 0, 'dcf map non-empty (fair-value strip)');
  assert.ok((D.lookthrough && D.lookthrough.funds) && Object.keys(D.lookthrough.funds).length > 0, 'lookthrough.funds drives .kpilt');
  assert.ok(D.earnings && Object.keys(D.earnings).length > 0, 'earnings map non-empty (memo badge)');
});

test('Monte Carlo widen-modal changes are present in the shipped file', () => {
  assert.ok(html.includes('.modal.wide{max-width:1180px}'), 'wide modal CSS');
  assert.ok(html.includes("_mcCard.classList.add('wide')"), 'wide toggle on MC open');
  assert.ok(html.includes("_c.classList.remove('wide')"), 'wide cleared on close');
  assert.ok(html.includes('var W=780,H=232'), 'fan viewBox widened');
});

// ---------- grouped-nav IA contract (Markets / Portfolio consolidation) ----------

test('top nav is exactly the four grouped tabs (Overview / Markets / Portfolio / Retirement)', () => {
  const tabs = [...html.matchAll(/<button class="tab[^"]*" data-p="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['overview', 'markets', 'portfolio', 'retire']);
});

test('the six old flat market/portfolio tabs are gone from the top nav', () => {
  for (const k of ['sp', 'nasdaq', 'dow', 'etfs', 'thematic', 'mutualfunds', 'ira', 'brokerage'])
    assert.ok(!html.includes(`data-p="${k}"`), `no top-level tab for ${k}`);
});

test('Markets panel groups all six universe sub-tabs + sub-panels (S&P default)', () => {
  assert.ok(html.includes('<div class="panel" id="markets">'), '#markets panel present');
  for (const k of ['sp', 'nasdaq', 'dow', 'etfs', 'thematic', 'mutualfunds']) {
    assert.ok(html.includes(`data-sp="${k}"`), `sub-tab for ${k}`);
    assert.ok(new RegExp(`<div class="subpanel[^"]*" id="${k}">`).test(html), `sub-panel #${k}`);
  }
  assert.ok(/<div class="subpanel active" id="sp">/.test(html), 'S&P is the default active universe');
});

test('Portfolio panel groups IRA + Brokerage sub-tabs + sub-panels (IRA default)', () => {
  assert.ok(html.includes('<div class="panel" id="portfolio">'), '#portfolio panel present');
  for (const k of ['ira', 'brokerage']) {
    assert.ok(html.includes(`data-sp="${k}"`), `sub-tab for ${k}`);
    assert.ok(new RegExp(`<div class="subpanel[^"]*" id="${k}">`).test(html), `sub-panel #${k}`);
  }
  assert.ok(/<div class="subpanel active" id="ira">/.test(html), 'IRA is the default active portfolio');
});

test('sub-tab handler is wired and preserves live-price autoLive for IRA/Brokerage', () => {
  const s = mainScript(html);
  assert.ok(/querySelectorAll\('\.subtab'\)/.test(s), 'sub-tab click handler present');
  assert.ok(s.includes('.subpanel.active'), 'top-tab handler resolves the active sub-panel');
  assert.ok(/autoLive\(_s\)/.test(s), 'sub-tab click fires autoLive for portfolio sub-panels');
});

// ---------- runtime integration (eval the whole script in a stubbed DOM) ----------

test('the entire assembled script evaluates without throwing (catches truncated modules)', () => {
  assert.ok(mainScript(html).length > 50000, 'main script extracted');
  let store;
  assert.doesNotThrow(() => { store = dash().store; }, 'full script runs clean against the stubbed DOM');
  // panels built at load
  assert.ok((store['sp'] && store['sp'].innerHTML.length > 0), '#sp universe panel built');
  assert.ok((store['retK'] && store['retK'].innerHTML.length > 0), '#retK retirement KPIs built');
});

test('Retirement KPI tiles render (dividend, Monte Carlo; look-through when a held fund is mapped)', () => {
  const { store } = dash();
  const ret = store['retK'].innerHTML;
  assert.match(ret, /kpidiv/, 'Dividend income tile');
  assert.match(ret, /kpimc/, 'Monte Carlo median tile');
  assert.match(ret, /Combined value now/, 'base retirement KPIs still present');
  const D = extractDATA(html);
  const held = new Set();
  for (const key of ['ira', 'brokerage']) {
    for (const r of D[key] || []) if (r && r.ticker) held.add(r.ticker);
  }
  const funds = (D.lookthrough && D.lookthrough.funds) || {};
  const mappedHeld = [...held].filter((t) => funds[t]);
  if (mappedHeld.length) {
    assert.match(ret, /kpilt/, 'Hidden exposure tile when a held fund is mapped');
  }
});

test('a fresh earnings memo badge renders in an eagerly-built panel (load-order regression)', () => {
  const { store } = dash();
  const D = extractDATA(html);
  const fresh = Object.keys(D.earnings || {}).filter((t) => {
    const rd = D.earnings[t].reportDate; if (!rd) return false;
    const age = Math.floor((Date.now() - new Date(rd + 'T00:00:00').getTime()) / 86400000);
    return age >= 0 && age <= 30;
  });
  if (!fresh.length) return; // nothing within the window right now — nothing to assert
  const anyBadge = Object.keys(store).some((k) => store[k] && /class="earnb"/.test(store[k].innerHTML || ''));
  assert.ok(anyBadge, 'a memo badge appears in at least one panel built at load');
});

test('every popup opens without throwing (MC, look-through, dividends, DCF strip, earnings)', async () => {
  const { sandbox } = dash();
  assert.doesNotThrow(() => sandbox.openMonteCarlo(), 'openMonteCarlo');
  assert.doesNotThrow(() => sandbox.openLookthrough(), 'openLookthrough');
  assert.doesNotThrow(() => sandbox.openDividends(), 'openDividends');
  const _e = Object.keys(extractDATA(html).earnings || {})[0];
  if (_e && typeof sandbox.openEarnings === 'function') assert.doesNotThrow(() => sandbox.openEarnings(_e), 'openEarnings');
  // DCF strip for the first precomputed symbol
  const D = extractDATA(html);
  const sym = Object.keys(D.dcf || {})[0];
  if (sym && typeof sandbox.dcfFill === 'function') {
    await assert.doesNotReject(Promise.resolve().then(() => sandbox.dcfFill(sym)), 'dcfFill');
  }
});

test('openTicker without a live connector shows embedded DCF, not a dead-end note', async () => {
  const { sandbox } = dash();
  const D = extractDATA(html);
  const sym = Object.keys(D.dcf || {})[0];
  assert.ok(sym, 'have a precomputed DCF name');
  assert.equal(sandbox.hasLiveConnector(), false);
  await sandbox.openTicker(sym, false);
  const body = sandbox.document.getElementById('modalBody').innerHTML;
  assert.doesNotMatch(body, /Live fundamentals need a live connector/);
  assert.match(body, /embedded snapshot|isn.t reachable/i);
  const strip = sandbox.document.getElementById('dcfStrip');
  assert.match(strip.innerHTML, /DCF fair value|No valuation for/);
});
