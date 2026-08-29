/* Corporate Actions section (46_corp_actions.js) unit tests.
 * Tests corpActionsSection(ticker) HTML rendering against stub DATA.
 * Run: node --test tests/dash/test_corp_actions.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDom, loadModule } = require('./_dom');

function base() {
  installDom();
  global.esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
  // modal globals (referenced at top-level load of 74_fundamentals — not needed here,
  // but some helpers guard against missing them; provide stubs)
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody  = global.document.getElementById('modalBody');
}

// ── Split row ────────────────────────────────────────────────────────────────

test('corpActionsSection renders a forward split row', () => {
  base();
  global.DATA = {
    splits: { NVDA: { ratio: '10:1', date: '2024-06-10', type: 'split' } },
    dividends: null,
    corp_actions: {},
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('NVDA');
  assert.match(html, /Corporate actions/, 'section heading');
  assert.match(html, /10:1/, 'split ratio');
  assert.match(html, /Split/, 'split label');
  assert.match(html, /2024/, 'effective year');
  assert.doesNotMatch(html, /Reverse Split/, 'not a reverse');
});

test('corpActionsSection renders a reverse split row with amber styling', () => {
  base();
  global.DATA = {
    splits: { HOOD: { ratio: '1:10', date: '2023-03-01', type: 'reverse' } },
    dividends: null,
    corp_actions: {},
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('HOOD');
  assert.match(html, /Reverse Split/, 'reverse split label');
  assert.match(html, /1:10/, 'ratio');
  assert.match(html, /#b45309/, 'amber colour for reverse');
});

// ── Dividend rows ────────────────────────────────────────────────────────────

test('corpActionsSection renders declared and estimated dividend rows for the ticker', () => {
  base();
  global.DATA = {
    splits: {},
    dividends: {
      upcoming: [
        { ticker: 'MSFT', exDate: '2026-08-07', payDate: '2026-08-14', amount: 0.83, shares: 30, income: 24.9, declared: true },
        { ticker: 'AAPL', exDate: '2026-08-09', payDate: '2026-08-15', amount: 0.25, shares: 100, income: 25, declared: false },
        { ticker: 'NVDA', payDate: '2026-09-01', income: 10, declared: false }, // different ticker — must not appear
      ],
    },
    corp_actions: {},
  };
  loadModule('46_corp_actions.js');

  const msft = corpActionsSection('MSFT');
  assert.match(msft, /Dividend/, 'dividend chip');
  assert.match(msft, /08-14/, 'pay date');
  assert.match(msft, /declared/, 'declared badge');
  assert.doesNotMatch(msft, />est\.</, 'no estimated badge for declared payment');

  const aapl = corpActionsSection('AAPL');
  assert.match(aapl, /est\./, 'estimated badge');
  // footer contains "declared" as a word — check the badge span specifically does NOT have green declared
  assert.doesNotMatch(aapl, /color:#16a34a[^<]*>declared</, 'no green declared badge for estimated payment');
});

test('corpActionsSection excludes dividend rows belonging to other tickers', () => {
  base();
  global.DATA = {
    splits: {},
    dividends: {
      upcoming: [
        { ticker: 'GOOG', payDate: '2026-09-01', income: 50, declared: true },
      ],
    },
    corp_actions: {},
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('AAPL');
  assert.equal(html, '', 'no output for ticker with no data');
});

// ── Manual corp-actions notes ────────────────────────────────────────────────

test('corpActionsSection renders acquisition note with purple chip', () => {
  base();
  global.DATA = {
    splits: {},
    dividends: null,
    corp_actions: {
      ATVI: [{ type: 'acquisition', date: '2023-10-13', note: 'Acquired by Microsoft for $68.7B.' }],
    },
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('ATVI');
  assert.match(html, /Acquisition/, 'acquisition chip label');
  assert.match(html, /Acquired by Microsoft/, 'note text');
  assert.match(html, /2023/, 'date year');
  assert.match(html, /#7c3aed/, 'purple colour for acquisition');
});

test('corpActionsSection renders spinoff note with teal chip', () => {
  base();
  global.DATA = {
    splits: {},
    dividends: null,
    corp_actions: {
      GE: [{ type: 'spinoff', date: '2024-04-02', note: 'GE Vernova spun off as GEV.' }],
    },
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('GE');
  assert.match(html, /Spin-off/, 'spinoff chip label');
  assert.match(html, /GE Vernova/, 'note text');
  assert.match(html, /#0891b2/, 'teal colour for spinoff');
});

test('corpActionsSection renders delisting note with red chip', () => {
  base();
  global.DATA = {
    splits: {},
    dividends: null,
    corp_actions: {
      WBA: [{ type: 'delisting', date: '2025-03-11', note: 'Walgreens delisted from Nasdaq.' }],
    },
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('WBA');
  assert.match(html, /Delisting/, 'delisting chip label');
  assert.match(html, /Walgreens/, 'note text');
  assert.match(html, /#dc2626/, 'red colour for delisting');
});

// ── Empty-state / guard cases ────────────────────────────────────────────────

test('corpActionsSection returns empty string when no data for ticker', () => {
  base();
  global.DATA = { splits: {}, dividends: null, corp_actions: {} };
  loadModule('46_corp_actions.js');
  assert.equal(corpActionsSection('ZZZZZ'), '', 'empty string for unknown ticker');
});

test('corpActionsSection handles missing DATA keys gracefully', () => {
  base();
  global.DATA = {}; // no splits, dividends, or corp_actions keys at all
  loadModule('46_corp_actions.js');
  assert.doesNotThrow(() => corpActionsSection('AAPL'), 'no throw on missing DATA keys');
  assert.equal(corpActionsSection('AAPL'), '', 'empty string when DATA is bare');
});

test('corpActionsSection handles null / falsy ticker gracefully', () => {
  base();
  global.DATA = { splits: {}, dividends: null, corp_actions: {} };
  loadModule('46_corp_actions.js');
  assert.doesNotThrow(() => corpActionsSection(null), 'no throw on null');
  assert.doesNotThrow(() => corpActionsSection(''), 'no throw on empty string');
  assert.equal(corpActionsSection(null), '', 'empty string on null ticker');
});

// ── Multiple rows rendered together ─────────────────────────────────────────

test('corpActionsSection renders split + M&A note together for same ticker', () => {
  base();
  global.DATA = {
    splits: { AVGO: { ratio: '10:1', date: '2024-07-15', type: 'split' } },
    dividends: null,
    corp_actions: {
      AVGO: [{ type: 'acquisition', date: '2023-11-22', note: 'Acquired VMware for $69B.' }],
    },
  };
  loadModule('46_corp_actions.js');
  const html = corpActionsSection('AVGO');
  assert.match(html, /10:1/, 'split ratio present');
  assert.match(html, /Acquisition/, 'acquisition chip present');
  assert.match(html, /VMware/, 'M&A note present');
});
