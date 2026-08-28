/* Dividend calendar (47_dividends.js) + change-alert badge/popup (10_helpers.js alertBadge,
 * 48_alerts.js openAlert).  Run: node --test tests/dash/test_features.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { installDom, loadModule, extractFn, PROJ, makeSandbox } = require('./_dom');

function base() {
  installDom();
  global.fmtUsd = (v) => '$' + Math.round(v).toLocaleString();
  global.esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody = global.document.getElementById('modalBody');
}

// ---------------- dividends ----------------
test('openDividends renders metrics, a chart canvas, and declared/estimated tags', () => {
  base();
  global.DATA = {
    dividends: {
      asOf: '2026-07-13', annual: 3418.54, yield: 0.021, next30: 240.5,
      months: Array.from({ length: 12 }, (_, i) => ({ label: 'M' + i, ira: 100, brokerage: 80 })),
      upcoming: [
        { ticker: 'MSFT', payDate: '2026-08-14', amount: 0.83, shares: 30, income: 24.9, declared: true },
        { ticker: 'SCHD', payDate: '2026-09-25', income: 120.0, declared: false },
      ],
    },
  };
  loadModule('47_dividends.js');
  openDividends();
  const b = global.mBody.innerHTML;
  assert.match(b, /Projected annual income/);
  assert.match(b, /\$3,419/, 'annual income formatted');
  assert.match(b, /divCanvas/, 'chart canvas present');
  assert.match(b, /declared/, 'declared tag');
  assert.match(b, /est\./, 'estimated tag');
  assert.match(b, /MSFT/, 'lists an upcoming payer');
  assert.ok(global.ov.classList.contains('open'));
});

test('openDividends no-ops safely when there is no dividend data', () => {
  base();
  global.DATA = { dividends: null };
  loadModule('47_dividends.js');
  assert.doesNotThrow(() => openDividends());
  assert.ok(!global.ov.classList.contains('open'), 'modal stays closed');
});

// ---------------- change alerts ----------------
test('alertBadge returns a colour-coded badge only for tickers with an alert', () => {
  base();
  global.DATA = {
    alerts: {
      NVO: { kind: 'death', label: 'Death Cross', date: '2026-07-10' },
      META: { kind: 'recover', label: 'recovered to Correction', date: '2026-07-10' },
    },
  };
  // alertBadge lives in 10_helpers.js, which eagerly builds panels at load; eval JUST this function.
  vm.runInThisContext(extractFn('10_helpers.js', 'alertBadge'));
  const held = alertBadge('NVO');
  assert.match(held, /alertb/, 'badge element');
  assert.match(held, /data-alert="NVO"/, 'carries the ticker');
  assert.match(held, /Death Cross/, 'tooltip has the label');
  assert.equal(alertBadge('AAPL'), '', 'no badge when no alert');
});

test('openAlert renders the from→to transition for a held name', () => {
  base();
  global.tkrCell = (v) => String(v);
  global.DATA = {
    alerts: {
      ASML: {
        kind: 'correction', sev: 'warn', label: 'entered Correction', date: '2026-07-10',
        account: 'Brokerage', text: 'Entered Correction (-10% off high)',
        from: { status: 'Normal', off: -0.0829 }, to: { status: 'Correction', off: -0.1013, price: 1797.32 },
        history: [{ date: '2026-07-10', label: 'entered Correction' }],
      },
    },
  };
  loadModule('48_alerts.js');
  openAlert('ASML');
  const b = global.mBody.innerHTML;
  assert.match(b, /ASML/);
  assert.match(b, /Correction/i, 'names the new status');
  assert.ok(global.ov.classList.contains('open'));
});

// ---------------- fundamentals popup (snapshot / no live connector) ----------------
const DCF_BASES = JSON.parse(fs.readFileSync(path.join(PROJ, 'data', 'dcf.json'), 'utf8'));
const FUND_SRC = ['05_debug.js', '70_connector.js', '51_dcf.js', '74_fundamentals.js']
  .map((n) => fs.readFileSync(path.join(PROJ, 'src', 'dash', n), 'utf8')).join('\n');

function offlinePopup(data) {
  const sb = makeSandbox();
  sb.DATA = data;
  sb.fmtUsd = (v) => '$' + Math.round(v).toLocaleString();
  sb.esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
  vm.createContext(sb);
  vm.runInContext(FUND_SRC, sb, { filename: 'offline-fund.js' });
  return sb;
}

test('openTicker without a live connector paints DCF + embedded snapshot, not a dead-end note', async () => {
  const sb = offlinePopup({
    dcf: DCF_BASES,
    sp: [{ ticker: 'MSFT', company: 'Microsoft', sector: 'Information Technology', price: 505.06, status: 'Normal', cross: 'Golden Cross', off: -0.04 }],
    nasdaq: [], dow: [], etfs: [], thematic: [], mutualfunds: [], ira: [], brokerage: [],
  });
  assert.equal(sb.hasLiveConnector(), false);
  await sb.openTicker('MSFT', false);
  const body = sb.document.getElementById('modalBody').innerHTML;
  assert.ok(sb.document.getElementById('modalOv').classList.contains('open'));
  assert.doesNotMatch(body, /Live fundamentals need a live connector/);
  assert.match(body, /embedded snapshot|isn.t reachable|cached tearsheet/i);
  assert.match(body, /Microsoft/, 'snapshot names the company');
  const strip = sb.document.getElementById('dcfStrip');
  assert.match(strip.innerHTML, /DCF fair value/, 'precomputed DCF strip painted');
});

test('openTicker without a connector reuses a cached company tearsheet', async () => {
  const sb = offlinePopup({
    dcf: {},
    sp: [{ ticker: 'AAPL', company: 'Apple', sector: 'Information Technology', price: 314.58, status: 'Normal', off: -0.02 }],
    nasdaq: [], dow: [], etfs: [], thematic: [], mutualfunds: [], ira: [], brokerage: [],
  });
  sb.pcSet('CT:AAPL', {
    k: {}, ad: {}, mc: 3e12, esg: null,
    p: { name: 'Apple Inc.', sector: 'Information Technology', industry: 'Consumer Electronics', desc: 'Designs consumer electronics and services. Headquartered in Cupertino.', hq: 'Cupertino', founded: '1976', mcap: 3e12 },
  });
  await sb.openTicker('AAPL', false);
  const body = sb.document.getElementById('modalBody').innerHTML;
  assert.match(body, /Apple Inc\./);
  assert.match(body, /cached tearsheet/i);
  assert.match(body, /Consumer Electronics|Cupertino|1976/);
});
