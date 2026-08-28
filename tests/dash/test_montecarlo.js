/* Monte Carlo retirement projection (src/dash/49_montecarlo.js).
 * Run: node --test tests/dash/test_montecarlo.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDom, loadModule } = require('./_dom');

function setup(overrides = {}) {
  installDom();
  global.fmtUsd = (v) => '$' + Math.round(v).toLocaleString();
  global.RET_CFG = { years: 20, iraC: 12000, bkC: 18000, iraER: 0.05, bkER: 0.085 };
  global.DATA = overrides.DATA || {
    ira: [{ ticker: 'SCHD', type: 'Equity/ETF', value: 120000, high: 30, low: 24 },
          { ticker: 'VOO', type: 'Equity/ETF', value: 80000, high: 560, low: 460 },
          { ticker: 'CASH', type: 'Cash', value: 8000 }],
    brokerage: [{ ticker: 'NVDA', type: 'Equity/ETF', value: 60000, high: 220, low: 86 },
                { ticker: 'MSFT', type: 'Equity/ETF', value: 40000, high: 520, low: 400 }],
    sp: [{ ticker: 'NVDA', high: 220, low: 86 }, { ticker: 'MSFT', high: 520, low: 400 }],
    nasdaq: [], dow: [], etfs: [{ ticker: 'SCHD', high: 30, low: 24 }, { ticker: 'VOO', high: 560, low: 460 }],
    thematic: [], mutualfunds: [],
  };
  // shared-modal globals normally defined by 74_fundamentals.js
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody = global.document.getElementById('modalBody');
  loadModule('49_montecarlo.js');
}

test('seeded RNG is deterministic — two runs of the same config match exactly', () => {
  setup();
  const a = mcRun(), b = mcRun();
  assert.equal(a.pct.p50[a.years], b.pct.p50[b.years], 'median identical across runs');
  assert.deepEqual(a.pct.p90, b.pct.p90, 'p90 path identical across runs');
});

test('percentiles are monotonically ordered at every horizon', () => {
  setup();
  const r = mcRun();
  for (let t = 0; t <= r.years; t++) {
    assert.ok(r.pct.p10[t] <= r.pct.p25[t] + 1e-6, `p10<=p25 @${t}`);
    assert.ok(r.pct.p25[t] <= r.pct.p50[t] + 1e-6, `p25<=p50 @${t}`);
    assert.ok(r.pct.p50[t] <= r.pct.p75[t] + 1e-6, `p50<=p75 @${t}`);
    assert.ok(r.pct.p75[t] <= r.pct.p90[t] + 1e-6, `p75<=p90 @${t}`);
  }
});

test('year 0 equals the current combined portfolio value', () => {
  setup();
  const r = mcRun();
  // 120k+80k+8k(cash excluded? cash IS a holding value in the sleeve start via _sum) ...
  // _sum sums ALL holding .value including cash; start = sum(ira)+sum(brokerage)
  const start = 208000 + 100000; // ira incl cash 8k, brokerage 100k
  assert.equal(Math.round(r.pct.p50[0]), start, 'median @ yr0 = start');
  assert.equal(Math.round(r.start), start, 'r.start = summed holdings');
});

test('mcEstVol stays within the clamped [0.06, 0.60] band', () => {
  setup();
  const est = mcEstimates();
  for (const k of ['ira', 'bk', 'all']) {
    assert.ok(est[k] >= 0.06 - 1e-9 && est[k] <= 0.60 + 1e-9, `${k} vol in band: ${est[k]}`);
  }
});

test('mcEstVol falls back to 0.18 when no usable 52-week ranges exist', () => {
  setup();
  const v = mcEstVol([{ ticker: 'X', type: 'Equity/ETF', value: 1000 }]); // no hi/lo, not in universe
  assert.equal(v, 0.18);
});

test('a higher volatility assumption widens the P10–P90 spread', () => {
  setup();
  MC.volIra = 0.10; MC._est = null; _mcMemo.k = null;
  const lo = mcRun(); const spreadLo = lo.pct.p90[lo.years] - lo.pct.p10[lo.years];
  MC.volIra = 0.40; _mcMemo.k = null;
  const hi = mcRun(); const spreadHi = hi.pct.p90[hi.years] - hi.pct.p10[hi.years];
  assert.ok(spreadHi > spreadLo, `spread grows with vol: ${Math.round(spreadHi)} > ${Math.round(spreadLo)}`);
});

test('mcMedian is memoized and equals the popup median (KPI/popup agree)', () => {
  setup();
  const m = mcMedian();
  const r = mcRun();
  assert.equal(m, r.pct.p50[r.years], 'KPI tile median == simulated median');
  // second call returns the memoized value (same key)
  assert.equal(mcMedian(), m);
});

test('fan chart uses the widened 780x232 viewBox and scales to 100% width', () => {
  setup();
  const svg = _mcFan(mcRun());
  assert.match(svg, /viewBox="0 0 780 232"/, 'widened viewBox');
  assert.match(svg, /width="100%"/, 'responsive width');
  assert.match(svg, /<path /, 'draws paths');
});

test('openMonteCarlo renders the body and widens the shared modal', () => {
  setup();
  openMonteCarlo();
  const body = global.mBody.innerHTML;
  assert.ok(body.length > 800, 'popup body rendered');
  assert.match(body, /P90/, 'percentile cards present');
  assert.match(body, /Chance of reaching goal/, 'goal probability present');
  const card = global.ov.querySelector('.modal');
  assert.ok(card.classList.contains('wide'), 'modal gets .wide on MC open');
  assert.ok(global.ov.classList.contains('open'), 'overlay opened');
});

test('probability helpers are bounded in [0,1] and directionally correct', () => {
  setup();
  const r = mcRun();
  assert.ok(r.pAbove(0) === 1, 'everything is above 0');
  assert.ok(r.pBelow(0) === 0, 'nothing is below 0');
  const pg = r.pAbove(r.pct.p50[r.years]);
  assert.ok(pg >= 0.4 && pg <= 0.6, `~half of outcomes beat the median: ${pg}`);
});
