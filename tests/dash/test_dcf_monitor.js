/* Loop 5 · DCF drift monitor (scripts/dcf_monitor.js).
 * Runs the monitor and checks the artifact shape + the honesty-flag semantics.
 * Run: node --test tests/dash/test_dcf_monitor.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const { PROJ } = require('./_dom');

const SCRIPT = path.join(PROJ, 'scripts', 'dcf_monitor.js');
const OUT = path.join(PROJ, 'data', 'dcf_monitor.json');

function run() {
  const stdout = execFileSync('node', [SCRIPT], { cwd: PROJ, encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('monitor runs deterministically and emits a well-shaped artifact', () => {
  const a = run();
  const b = run();
  assert.ok(a.asOf && typeof a.tol === 'number', 'has asOf + tolerance');
  assert.ok(Object.keys(a.names).length >= 1, 'covers the anchored names');
  assert.deepEqual(a.names, b.names, 'deterministic across runs');
  assert.ok(fs.existsSync(OUT), 'writes data/dcf_monitor.json');
});

test('each entry carries the gap, reconcilability and a flag', () => {
  const a = run();
  for (const [sym, v] of Object.entries(a.names)) {
    if (v.error) continue;
    assert.equal(typeof v.gapPct, 'number', `${sym}: gap`);
    assert.equal(typeof v.reconcilable, 'boolean', `${sym}: reconcilable`);
    assert.equal(typeof v.flag, 'boolean', `${sym}: flag`);
  }
});

test('honesty gate: a name is flagged only when the gap exceeds tolerance AND nothing reconciles', () => {
  const a = run();
  for (const [sym, v] of Object.entries(a.names)) {
    if (v.error) continue;
    const expected = Math.abs(v.gapPct) > a.tol && !v.reconcilable;
    assert.equal(v.flag, expected, `${sym}: flag == (gap>tol && !reconcilable)`);
    // a big gap that IS reconcilable within bands must NOT be flagged (it's explicable, not suspect)
    if (v.reconcilable) assert.equal(v.flag, false, `${sym}: reconcilable => not flagged`);
  }
});
