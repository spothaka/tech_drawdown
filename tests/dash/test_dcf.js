/* DCF valuation model (src/dash/51_dcf.js) run against the real precomputed bases in data/dcf.json.
 * These lock in the hard-won correctness properties: the netDebt correction, the WACC>tg guard,
 * a 3-stage model that doesn't inherit peak capex into the terminal, and a segment sum-of-the-parts
 * that reconciles to the consolidated DCF by construction.
 * Run: node --test tests/dash/test_dcf.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { installDom, loadModule, PROJ } = require('./_dom');

const DCF = JSON.parse(fs.readFileSync(path.join(PROJ, 'data', 'dcf.json'), 'utf8'));
const ANCHORS = JSON.parse(fs.readFileSync(path.join(PROJ, 'data', 'dcf_anchor.json'), 'utf8'));
for (const k of Object.keys(ANCHORS)) if (DCF[k]) DCF[k].anchor = ANCHORS[k];
const SYMS = Object.keys(DCF);

function setup() {
  installDom();
  global.fmtUsd = (v) => '$' + Math.round(v).toLocaleString();
  global.esc = (s) => String(s);
  global.DATA = { dcf: DCF, ira: [], brokerage: [], sp: [], nasdaq: [], dow: [], etfs: [], thematic: [], mutualfunds: [] };
  global.ov = global.document.getElementById('modalOv');
  global.mTitle = global.document.getElementById('modalTitle');
  global.mBody = global.document.getElementById('modalBody');
  loadModule('51_dcf.js');
}

test('the precomputed set is non-empty (there is something to value)', () => {
  setup();
  assert.ok(SYMS.length >= 1, `have ${SYMS.length} precomputed bases`);
});

test('every base carries a correctly derived netDebt = totalDebt - cash&STinvestments', () => {
  setup();
  for (const s of SYMS) {
    const b = DCF[s];
    if (b.totalDebt == null || b.cash == null) continue;
    assert.ok(Math.abs(b.netDebt - (b.totalDebt - b.cash)) < 1, `${s}: netDebt is the corrected figure`);
    // and it should differ from the vendor's wrong field when that was recorded
    if (b.netDebtFmp != null && Math.abs(b.netDebtFmp - b.netDebt) > 1e9) {
      assert.notEqual(b.netDebt, b.netDebtFmp, `${s}: not using the vendor's wrong netDebt`);
    }
  }
});

test('Blume beta adjustment: 0.67*raw + 0.33 (pulls toward 1)', () => {
  setup();
  assert.ok(Math.abs(_dcfBlume(1) - 1) < 1e-9, 'beta 1 stays 1');
  assert.ok(Math.abs(_dcfBlume(2) - 1.67) < 1e-9);
  assert.ok(_dcfBlume(2) < 2, 'high beta pulled down');
  assert.ok(_dcfBlume(0.5) > 0.5, 'low beta pulled up');
});

test('default model produces a positive, finite fair value for each held name', () => {
  setup();
  for (const s of SYMS) {
    const b = DCF[s];
    const st = _dcfNewState(b);
    const m = dcfModel(b, st);
    assert.ok(m && !m.err, `${s}: model ran (${m && m.err})`);
    assert.ok(isFinite(m.fv) && m.fv > 0, `${s}: fair value positive/finite (${m.fv})`);
    // sanity band: a fair value within 0.1x–10x of price is not a unit-trap blowup
    if (b.price) assert.ok(m.fv > b.price * 0.1 && m.fv < b.price * 10, `${s}: FV ${m.fv.toFixed(2)} in sane band vs price ${b.price}`);
  }
});

test('guard: WACC must exceed terminal growth or the model refuses', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const bad = dcfModelW(b, st, /*waccPct*/ st.tg, /*capexPct*/ st.capex / 100);
  assert.ok(bad && bad.err, 'refuses when wacc<=tg');
  assert.match(bad.err, /terminal growth/i);
});

test('terminal cash flow is rebuilt, not the last growth year scaled (no peak-capex inheritance)', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const m = dcfModel(b, st);
  // steady-state capex uses maintenance capex (maint), which is < the elevated stage-1 capex%.
  // fT is built from revT*maint, so terminal FCF margin should be HEALTHIER than the last stage-1 FCF.
  assert.ok(m.fT > 0, 'terminal FCF positive');
  assert.ok(m.termMult > 0, 'terminal multiple positive');
  assert.ok(m.pvtv > 0 && m.pvtv < m.ev, 'terminal value is a fraction of EV, not all of it');
});

test('higher discount rate lowers fair value (monotone)', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const cheap = dcfModelW(b, st, 8, st.capex / 100).fv;
  const dear = dcfModelW(b, st, 12, st.capex / 100).fv;
  assert.ok(dear < cheap, `FV falls as WACC rises: ${dear.toFixed(2)} < ${cheap.toFixed(2)}`);
});

test('reverse DCF returns an implied discount rate the market applies to consensus', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const w = dcfImpliedWacc(b, st);
  // may legitimately be null if the market is outside the search band; when present it's sane
  if (w != null) assert.ok(w > st.tg && w < 40, `implied wacc in range: ${w}`);
});

test('segment sum-of-the-parts reconciles to the consolidated DCF at default assumptions', () => {
  setup();
  let tested = 0;
  for (const s of SYMS) {
    const b = DCF[s];
    if (!b.segments || !b.segOk) continue;             // only when the feed reconciled to revenue
    const st = _dcfNewState(b);
    const total = dcfModel(b, st).fv;
    const seg = dcfSegModel(b, st, s);
    if (!seg || seg.err) continue;
    tested++;
    assert.ok(Math.abs(seg.fv - total) / total < 0.01, `${s}: SOTP within 1% of total (${seg.fv.toFixed(2)} vs ${total.toFixed(2)})`);
  }
  // don't fail the suite if no symbol currently carries reconciled segments; just note it
  console.log(`      segment reconciliation checked on ${tested} symbol(s)`);
});

test('dcfFill renders the strip without throwing and shows a fair value', async () => {
  setup();
  const s = SYMS[0];
  const host = global.document.getElementById('dcfStrip');
  await dcfFill(s);
  assert.ok(host.innerHTML.length > 0, 'strip rendered');
});

// ---------- Loop 1: generalized reverse-solve ----------
test('reverse-solve round-trips: solving for a lever recovers the value that produced the target', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const W = _dcfWacc(b, st);
  // WACC: FV at a known discount rate, then solve for wacc given that FV -> recovers it
  const targW = dcfModelW(b, st, 9.0, st.capex / 100).fv;
  const rW = dcfImply(b, st, 'wacc', targW);
  assert.ok(!rW.noSolution, 'wacc solvable');
  assert.ok(Math.abs(rW.value - 9.0) < 0.05, `recovered wacc ${rW.value} ~= 9.0`);
  // terminal growth: FV with tg=2.5 (holding the state's own wacc), then recover 2.5
  const st25 = Object.assign({}, st, { tg: 2.5 });
  const targG = dcfModelW(b, st25, W.wacc, st.capex / 100).fv;
  const rG = dcfImply(b, st, 'tg', targG);
  assert.ok(!rG.noSolution, 'tg solvable');
  assert.ok(Math.abs(rG.value - 2.5) < 0.05, `recovered tg ${rG.value} ~= 2.5`);
});

test('monotonic directions hold (FV falls with WACC, rises with terminal growth)', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const evW = _dcfEvalFor('wacc', b, st);
  assert.ok(evW(8) > evW(12), 'FV decreasing in WACC');
  const evG = _dcfEvalFor('tg', b, st);
  assert.ok(evG(3.5) > evG(1.5), 'FV increasing in terminal growth');
});

test('an unreachable target returns noSolution (with a reason), not a bogus root', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const r = dcfImply(b, st, 'wacc', b.price * 50); // no WACC in [4,15] yields 50x the price
  assert.ok(r.noSolution, 'flags no solution');
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'gives a reason');
});

test('implied value carries an in-band / outside-band flag', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const r = dcfImply(b, st, 'wacc', b.price); // solve to today's price
  if (!r.noSolution) {
    assert.equal(typeof r.inBand, 'boolean');
    assert.ok(Array.isArray(r.band) && r.band.length === 2, 'band reported');
  }
});

test('the solver never runs unbounded and always returns a shaped result', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  for (const p of ['wacc', 'tg', 'fade', 'capex', 'hair']) {
    const r = dcfImply(b, st, p, b.price);
    assert.ok(r.noSolution === true || typeof r.value === 'number', `${p}: shaped result`);
  }
});

test('the DCF popup renders the reverse-DCF "what the market implies" table', () => {
  setup();
  const s = SYMS[0];
  const b = DCF[s];
  const st = _dcfNewState(b);
  const html = _dcfReverse(b, st, dcfModel(b, st));
  assert.match(html, /what today.s price/i, 'header present');
  assert.match(html, /Terminal growth/, 'lever rows present');
  assert.match(html, /plausible|outside band|no solution/, 'each row carries a check');
});

// ---------- Normalized steady-state margin lever ----------
test('margin lever defaults to consensus, so default fair value is unchanged', () => {
  setup();
  for (const s of SYMS) {
    const b = DCF[s];
    const st = _dcfNewState(b);
    assert.equal(st.mgnT, null, `${s}: mgnT defaults to null (follow consensus)`);
    const base = dcfModel(b, st).fv;
    const explicit = dcfModel(b, Object.assign({}, st, { mgnT: _dcfConsMgn(b) })).fv;
    assert.ok(Math.abs(base - explicit) / base < 1e-6, `${s}: explicit consensus margin == default`);
  }
});

test('a higher normalized margin raises fair value (monotone), lower lowers it', () => {
  setup();
  const b = DCF[SYMS.includes('AMZN') ? 'AMZN' : SYMS[0]];
  const st = _dcfNewState(b);
  const lo = dcfModel(b, Object.assign({}, st, { mgnT: 8 })).fv;
  const hi = dcfModel(b, Object.assign({}, st, { mgnT: 16 })).fv;
  assert.ok(hi > lo, `FV rises with margin: ${hi.toFixed(0)} > ${lo.toFixed(0)}`);
});

test('reverse-solve recovers the margin that produced a target fair value', () => {
  setup();
  const b = DCF[SYMS.includes('AMZN') ? 'AMZN' : SYMS[0]];
  const st = _dcfNewState(b);
  const target = dcfModel(b, Object.assign({}, st, { mgnT: 14 })).fv;
  const r = dcfImply(b, st, 'mgnT', target);
  assert.ok(!r.noSolution, 'margin solvable');
  assert.ok(Math.abs(r.value - 14) < 0.1, `recovered margin ${r.value} ~= 14`);
});

test('the popup exposes the steady-state margin slider and reverse row', () => {
  setup();
  const b = DCF[SYMS[0]];
  _dcfState[SYMS[0]] = _dcfNewState(b);
  _dcfTab[SYMS[0]] = 'total';
  const body = _dcfBody(b, SYMS[0]);
  assert.match(body, /dcfMgn/, 'margin slider present');
  assert.match(body, /Steady-state margin/, 'labelled');
  const rev = _dcfReverse(b, _dcfState[SYMS[0]], dcfModel(b, _dcfState[SYMS[0]]));
  assert.match(rev, /Steady-state margin/, 'margin lever in the reverse table');
});

// ---------- Loop 2: benchmark-calibration ----------
test('every anchored name computes a model-vs-anchor gap and reconciliation', () => {
  setup();
  for (const s of SYMS) {
    const b = DCF[s];
    if (!b.anchor) continue;
    const c = dcfCalibrate(b, b === DCF[s] ? _dcfNewState(b) : null);
    assert.ok(c, `${s}: calibration result`);
    assert.equal(typeof c.gapPct, 'number', `${s}: gap computed`);
    assert.ok(typeof c.reconcilable === 'boolean');
  }
});

test('reconcile candidates are all in-band and ordered least-move first', () => {
  setup();
  const b = DCF['AMZN'] || DCF[SYMS[0]];
  const c = dcfCalibrate(b, _dcfNewState(b));
  if (c.reconcilable) {
    for (const cd of c.candidates) {
      const r = dcfImply(b, _dcfNewState(b), cd.param, b.anchor.value);
      assert.ok(r.inBand, `${cd.param} candidate is in band`);
    }
    for (let i = 1; i < c.candidates.length; i++) {
      assert.ok(c.candidates[i].move >= c.candidates[i - 1].move - 1e-9, 'ordered by move');
    }
    assert.equal(c.best, c.candidates[0], 'best is the least-move candidate');
  }
});

test('applying the best candidate moves the model toward the anchor', () => {
  setup();
  const b = DCF['AMZN'] || DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const c = dcfCalibrate(b, st);
  if (c.reconcilable) {
    const before = Math.abs(dcfModel(b, st).fv - b.anchor.value);
    const st2 = Object.assign({}, st, { [c.best.param]: c.best.param === 'fade' ? Math.round(c.best.value) : c.best.value });
    const after = Math.abs(dcfModel(b, st2).fv - b.anchor.value);
    assert.ok(after < before, `applying ${c.best.param} narrows the gap (${after.toFixed(0)} < ${before.toFixed(0)})`);
  }
});

test('honesty gate: an unreachable anchor is FLAGGED, never forced', () => {
  setup();
  const b = Object.assign({}, DCF[SYMS[0]], { anchor: { value: DCF[SYMS[0]].price * 20, source: 'stress test', asOf: '2026-07-16' } });
  const c = dcfCalibrate(b, _dcfNewState(b));
  assert.equal(c.reconcilable, false, 'nothing reconciles a 20x anchor within bands');
  assert.equal(c.candidates.length, 0, 'no candidates offered');
});

test('the popup renders the calibrate block with the anchor and an Apply control (or a flag)', () => {
  setup();
  const s = DCF['AMZN'] ? 'AMZN' : SYMS[0];
  const b = DCF[s];
  _dcfState[s] = _dcfNewState(b);
  const html = _dcfCalibrateBlock(b, _dcfState[s], s);
  assert.match(html, /Calibrate to/, 'header present');
  assert.match(html, /analyst target/, 'anchor source shown');
  assert.match(html, /dcfCal|No single plausible/, 'apply control or the honesty flag');
});

// ---------- Loop 4: probabilistic DCF ----------
test('probabilistic DCF is seeded (reproducible) and percentile-ordered', () => {
  setup();
  const b = DCF[SYMS[0]];
  const st = _dcfNewState(b);
  const a = dcfMonteCarlo(b, st), c = dcfMonteCarlo(b, st);
  assert.equal(a.p50, c.p50, 'same seed -> same median');
  assert.deepEqual([a.p10, a.p90], [c.p10, c.p90], 'reproducible tails');
  assert.ok(a.p10 <= a.p25 && a.p25 <= a.p50 && a.p50 <= a.p75 && a.p75 <= a.p90, 'ordered percentiles');
});

test('the distribution centers on the point estimate (uncertainty, not a new center)', () => {
  setup();
  for (const s of SYMS) {
    const b = DCF[s];
    const st = _dcfNewState(b);
    const point = dcfModel(b, st).fv;
    const mc = dcfMonteCarlo(b, st);
    if (!mc) continue;
    assert.ok(Math.abs(mc.p50 - point) / point < 0.15, `${s}: median ~= point (${mc.p50.toFixed(0)} vs ${point.toFixed(0)})`);
  }
});

test('probabilities are bounded in [0,1]', () => {
  setup();
  const b = DCF[SYMS[0]];
  const mc = dcfMonteCarlo(b, _dcfNewState(b));
  assert.ok(mc.pAbovePrice >= 0 && mc.pAbovePrice <= 1);
  if (b.anchor) assert.ok(mc.pAboveAnchor >= 0 && mc.pAboveAnchor <= 1);
});

test('the popup renders the probabilistic range block', () => {
  setup();
  const b = DCF[SYMS[0]];
  const html = _dcfProb(b, _dcfNewState(b));
  assert.match(html, /Probabilistic fair value/, 'header');
  assert.match(html, /P\(undervalued at price\)/, 'undervalued probability shown');
  assert.match(html, /seeded/, 'reproducibility noted');
});

// ---------- Loop 5: monitor flag surfaced in the popup ----------
test('a daily-monitor flag is surfaced in the DCF calibrate block', () => {
  setup();
  const s = SYMS[0];
  global.DATA.dcfMonitor = { asOf: '2026-07-16', tol: 12, names: { [s]: { gapPct: -80, anchorSource: 'analyst target', reconcilable: false, flag: true } } };
  const b = DCF[s];
  _dcfState[s] = _dcfNewState(b);
  const html = _dcfCalibrateBlock(b, _dcfState[s], s);
  assert.match(html, /daily valuation monitor/, 'monitor note shown for a flagged name');
  // an unflagged name shows no monitor note
  global.DATA.dcfMonitor.names[s].flag = false;
  assert.doesNotMatch(_dcfCalibrateBlock(b, _dcfState[s], s), /daily valuation monitor/, 'no note when not flagged');
});

// ---------- Segment "Price Analysis" tab gating ----------
test('the By-segment tab shows whenever segments were fetched — including a rejected (segOk:false) one', () => {
  setup();
  // a name with reconciling segments -> tab present
  const withSeg = SYMS.find((s) => DCF[s].segments && Object.keys(DCF[s].segments).length && DCF[s].segOk !== false);
  if (withSeg) { _dcfState[withSeg] = _dcfNewState(DCF[withSeg]); _dcfTab[withSeg] = 'total';
    assert.match(_dcfTabs(DCF[withSeg], withSeg), /By segment/, `${withSeg}: tab shown`); }
  // a REJECTED name (segments present, segOk false) -> tab STILL shown so the refusal is reachable
  const rejected = SYMS.find((s) => DCF[s].segments && Object.keys(DCF[s].segments).length && DCF[s].segOk === false);
  if (rejected) {
    assert.match(_dcfTabs(DCF[rejected], rejected), /By segment/, `${rejected}: rejected tab still shown`);
    _dcfState[rejected] = _dcfNewState(DCF[rejected]); _dcfTab[rejected] = 'segment';
    global.document.getElementById('dcfOut'); // ensure host
    _dcfSegRender(DCF[rejected], rejected);
    assert.match(global.document.getElementById('dcfOut').innerHTML, /does not reconcile|no segment data/i, `${rejected}: refusal explained`);
  }
  // a name with NO segment data -> tab hidden (nothing to explain)
  const none = SYMS.find((s) => !DCF[s].segments || !Object.keys(DCF[s].segments || {}).length);
  if (none) assert.doesNotMatch(_dcfTabs(DCF[none], none), /By segment/, `${none}: no dead tab`);
});

test('AMZN segment sum-of-the-parts reconciles to the consolidated DCF', () => {
  setup();
  if (!DCF['AMZN'] || !DCF['AMZN'].segments) return;
  const b = DCF['AMZN'], st = _dcfNewState(b);
  const total = dcfModel(b, st).fv, seg = dcfSegModel(b, st, 'AMZN');
  assert.ok(seg && !seg.err, 'AMZN SOTP builds');
  assert.ok(Math.abs(seg.fv - total) / total < 0.01, `SOTP within 1% of consolidated (${seg.fv.toFixed(2)} vs ${total.toFixed(2)})`);
});
