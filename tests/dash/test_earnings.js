/* Earnings memo badge + popup (src/dash/53_earnings.js).
 * Run: node --test tests/dash/test_earnings.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDom, loadModule } = require('./_dom');

// Anchor to LOCAL midnight and format from local calendar parts, mirroring how the badge parses
// reportDate ('<date>T00:00:00' — local midnight, see _earnAgeDays in 53_earnings.js). This makes
// _earnAgeDays(rec) === n exactly, independent of the current time-of-day: a naive
// `new Date(Date.now()-n*day).toISOString()` bakes in the wall-clock time and mixes UTC vs local,
// so daysAgoISO(31) could age to 30 and flake the boundary assertions below.
function daysAgoISO(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);      // local midnight today
  d.setDate(d.getDate() - n);  // n local calendar days back, still at local midnight
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setup(earnings) {
  installDom();
  global.esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
  global.DATA = { earnings };
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody = global.document.getElementById('modalBody');
  loadModule('53_earnings.js');
}

function rec(overrides) {
  return Object.assign({
    symbol: 'GS', reportDate: daysAgoISO(1), fiscalYear: 2026, fiscalPeriod: 'Q2', currency: 'USD',
    eps: { actual: 20.98, est: 14.47, surprisePct: 44.99 },
    revenue: { actual: 20338000000, est: 16224980000, surprisePct: 25.35 },
    netIncome: 6628000000, taxRate: 22.6, dilutedSharesYoYPct: -4.2, epsYoYPct: 91.6,
    epsTrend: [{ label: '25 Q2', eps: 10.95 }, { label: '25 Q3', eps: 12.25 }, { label: '26 Q1', eps: 17.55 }, { label: '26 Q2', eps: 20.98 }],
    fwd: { nextPeriod: 'Q3 2026', nextEpsEst: 15.31, view: 'normalizing' },
    rating: { consensus: 'Hold', buy: 22, hold: 29, sell: 4, targetConsensus: 1142.67 },
    memoPath: 'reports/earnings/GS_2026_Q2.md', asOf: '2026-07-15',
  }, overrides || {});
}

test('badge shows for a report within the 30-day window', () => {
  setup({ GS: rec({ reportDate: daysAgoISO(1) }) });
  const b = earnMemoBadge('GS');
  assert.match(b, /earnb/, 'badge element');
  assert.match(b, /data-earn="GS"/, 'carries ticker');
  assert.match(b, /reported 1d ago/, 'freshness in tooltip');
});

test('badge is hidden once the report is older than 30 days', () => {
  setup({ GS: rec({ reportDate: daysAgoISO(31) }) });
  assert.equal(earnMemoBadge('GS'), '', 'no badge past the window');
});

test('badge boundary: exactly 30 days still shows, 31 does not', () => {
  setup({ GS: rec({ reportDate: daysAgoISO(30) }) });
  assert.notEqual(earnMemoBadge('GS'), '', '30 days is inside the window');
  setup({ GS: rec({ reportDate: daysAgoISO(31) }) });
  assert.equal(earnMemoBadge('GS'), '', '31 days is outside');
});

test('badge is empty for a ticker with no earnings record', () => {
  setup({ GS: rec() });
  assert.equal(earnMemoBadge('AAPL'), '', 'no record => no badge');
});

test('a future reportDate does not render a badge (guards clock skew / bad data)', () => {
  setup({ GS: rec({ reportDate: daysAgoISO(-3) }) });
  assert.equal(earnMemoBadge('GS'), '', 'future date is not "fresh"');
});

test('openEarnings renders beat cards, surprise %, EPS trend, forward read and memo link', () => {
  setup({ GS: rec() });
  openEarnings('GS');
  const b = global.mBody.innerHTML;
  assert.match(b, /\$20\.98/, 'reported EPS');
  assert.match(b, /vs \$14\.47/, 'consensus EPS');
  assert.match(b, /beat \+45\.0%/, 'EPS surprise');
  assert.match(b, /\$20\.34B/, 'revenue in billions');
  assert.match(b, /<svg/, 'EPS trend chart');
  assert.match(b, /spike, not a new baseline/, 'normalizing forward read');
  assert.match(global.mTitle.innerHTML, /earnings/, 'title set');
  assert.ok(global.ov.classList.contains('open'));
});

test('a miss renders red with a "miss" label', () => {
  setup({ GS: rec({ eps: { actual: 1.0, est: 2.0, surprisePct: -50 } }) });
  openEarnings('GS');
  assert.match(global.mBody.innerHTML, /miss -50\.0%/, 'miss labelled');
});

test('openEarnings no-ops safely for an unknown ticker', () => {
  setup({ GS: rec() });
  assert.doesNotThrow(() => openEarnings('ZZZZ'));
  assert.ok(!global.ov.classList.contains('open'), 'modal stays closed');
});
