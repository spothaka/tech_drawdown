/* Fund look-through roll-up (src/dash/52_lookthrough.js).
 * The whole feature exists to reveal hidden concentration, so the tests are mostly HONESTY
 * invariants: nothing dropped, the reconciliation gate holds, floors are labelled while coverage
 * is incomplete.  Run: node --test tests/dash/test_lookthrough.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDom, loadModule } = require('./_dom');

function setup(DATA) {
  installDom();
  global.fmtUsd = (v) => '$' + Math.round(v).toLocaleString();
  global.esc = (s) => String(s);
  global.DATA = DATA;
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody = global.document.getElementById('modalBody');
  loadModule('52_lookthrough.js');
}

// A household that owns NVDA ONLY through a fund (SMH) + a directly-held stock (AAPL) + an
// unmapped fund (VOO, known but not in funds{}) + cash.
function fixture() {
  return {
    ira: [
      { ticker: 'AAPL', type: 'Equity/ETF', value: 50000 },
      { ticker: 'SMH', type: 'Equity/ETF', value: 100000 },
      { ticker: 'VOO', type: 'Equity/ETF', value: 50000 },   // known-but-unmapped
      { ticker: 'MYCD', type: 'CD', value: 25000 },           // excluded
      { ticker: 'CASH', type: 'Cash', value: 10000 },         // excluded
    ],
    brokerage: [
      { ticker: 'FXAIX', type: 'Mutual Fund', value: 100000 },  // S&P tracker (dupe with VOO)
    ],
    lookthrough: {
      asOf: '2026-07-13',
      known: ['SMH', 'VOO', 'FXAIX'],
      funds: {
        // data contract (build_lookthrough.py): topW == sum(top[].w); topW+residualW+cashW == 100
        SMH: { asOf: '2026-07-13', topW: 42, residualW: 56, cashW: 2, top: [
          { sym: 'NVDA', name: 'NVIDIA', w: 22 },
          { sym: 'AVGO', name: 'Broadcom', w: 14 },
          { sym: 'AMD', name: 'AMD', w: 6 },
        ] },
        FXAIX: { asOf: '2026-05-01', topW: 19, residualW: 80, cashW: 1, top: [
          { sym: 'AAPL', name: 'Apple', w: 7 },
          { sym: 'NVDA', name: 'NVIDIA', w: 6 },
          { sym: 'MSFT', name: 'Microsoft', w: 6 },
        ] },
      },
    },
  };
}

test('reconciliation gate: named + remainder + cash + unmapped == household total', () => {
  setup(fixture());
  const r = ltRollup();
  const sum = r.named + r.remainder + r.cash + r.unmapped;
  assert.ok(Math.abs(sum - r.total) < 1e-6, `reconciles: ${sum} vs ${r.total}`);
  assert.ok(r.reconErr < 1, `reconErr small: ${r.reconErr}`);
});

test('marketable total excludes CDs and cash', () => {
  setup(fixture());
  const r = ltRollup();
  // 50k AAPL + 100k SMH + 50k VOO + 100k FXAIX = 300k ; CD + cash excluded
  assert.equal(Math.round(r.total), 300000);
});

test('a fund we have not mapped becomes an explicit unmapped bucket, never dropped', () => {
  setup(fixture());
  const r = ltRollup();
  assert.ok(r.unmapped > 0, 'unmapped bucket populated');
  assert.deepEqual(r.unmappedList.sort(), ['VOO']);            // VOO is known but not in funds{}
});

test('hidden exposure: a stock owned $0 directly still surfaces via funds', () => {
  setup(fixture());
  const r = ltRollup();
  const nvda = r.rows.find((x) => x.sym === 'NVDA');
  assert.ok(nvda, 'NVDA present in look-through');
  assert.equal(nvda.direct, 0, 'no direct NVDA');
  assert.ok(nvda.viaTotal > 0, 'reaches household via funds');
  assert.ok(r.hidden.some((h) => h.sym === 'NVDA'), 'flagged hidden');
});

test('coverage incomplete => partial flag set and figures are FLOORS', () => {
  setup(fixture());
  const r = ltRollup();
  // unmapped 50k / 300k = 16.7% > 5% => partial
  assert.equal(r.partial, true);
  const top = ltTopHidden();
  assert.ok(top && top.partial === true, 'ltTopHidden reports partial');
  assert.ok(top.unmappedPct > 5, `unmappedPct surfaced: ${top.unmappedPct}`);
});

test('duplicate S&P tracker detector fires when two trackers are held', () => {
  setup(fixture());
  const r = ltRollup();
  const dupe = r.dupes.find((d) => /S&P 500/.test(d.name));
  assert.ok(dupe, 'dupe group detected');
  assert.deepEqual(dupe.members.sort(), ['FXAIX', 'VOO']);
  assert.ok(Math.abs(dupe.value - 150000) < 1e-6, 'dupe value = VOO+FXAIX');
});

test('directly-held stock keeps its direct component', () => {
  setup(fixture());
  const r = ltRollup();
  const aapl = r.rows.find((x) => x.sym === 'AAPL');
  assert.ok(aapl.direct >= 50000, 'AAPL direct holding counted');
  assert.ok(aapl.viaTotal > 0, 'plus AAPL reaching via FXAIX');
});

test('null lookthrough => rollup returns null (popup shows the empty state, not a crash)', () => {
  const f = fixture(); f.lookthrough = null;
  setup(f);
  assert.equal(ltRollup(), null);
  // popup must not throw on the empty state
  assert.doesNotThrow(() => openLookthrough());
});

test('fully-mapped household has zero unmapped and is not partial', () => {
  const f = fixture();
  f.ira = f.ira.filter((h) => h.ticker !== 'VOO');       // drop the unmapped fund
  f.brokerage = [];                                       // drop FXAIX too
  f.lookthrough.known = ['SMH'];
  setup(f);
  const r = ltRollup();
  assert.equal(r.unmapped, 0);
  assert.equal(r.partial, false);
  const sum = r.named + r.remainder + r.cash + r.unmapped;
  assert.ok(Math.abs(sum - r.total) < 1e-6, 'still reconciles');
});

test('openLookthrough renders reconciliation + hidden alert', () => {
  setup(fixture());
  openLookthrough();
  const body = global.mBody.innerHTML;
  assert.match(global.mTitle.innerHTML, /actually own/i, 'title set');
  assert.match(body, /Reconciliation/, 'shows the reconciliation readout');
  assert.match(body, /NVDA/, 'names the hidden holding');
  assert.match(body, /at least/i, 'floors labelled while coverage incomplete');
  assert.ok(global.ov.classList.contains('open'));
});
