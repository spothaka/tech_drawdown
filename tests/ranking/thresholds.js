/* Threshold-editing regression — Phase 3 optional subset.
 * Proves scoreItem honors edited good/bad thresholds on company_fundamentals,
 * and that the UNEDITED ruleset reproduces the baseline exactly.
 *   run:  node tests/ranking/thresholds.js
 */
const path = require("path");
const engine = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));
const baseRS = require(path.join(__dirname, "..", "..", "src", "ranking", "rulesets", "company_fundamentals.json"));

const clone = o => JSON.parse(JSON.stringify(o));
function eq(a, b) { if (a == null && b == null) return true; if (a == null || b == null) return false; return Math.abs(a - b) < 1e-12; }

let fails = 0;
const check = (name, cond) => { if (!cond) { fails++; console.error("FAIL: " + name); } };

// A company that is a borderline P/E case: PE=20 → baseline (good 15 / bad 30) = 0 (neutral).
const k = {
  price_to_earnings_ratio_ttm: 20, price_to_sales_ratio_ttm: 3, price_to_book_ratio_ttm: 4,
  ev_to_ebitda_ttm: 14, free_cash_flow_yield_ttm: 0.04, dividend_yield_ttm: 0.01,
  return_on_equity_ttm: 0.18, return_on_assets_ttm: 0.08, gross_profit_margin_ttm: 0.45,
  net_profit_margin_ttm: 0.12, debt_to_equity_ratio_ttm: 0.8, current_ratio_ttm: 1.3
};

// 1) unedited ruleset: pe factor must be neutral (0) at PE=20
const base = engine.scoreItem(k, baseRS);
check("baseline pe factor neutral (0) at PE=20", base.breakdown.pe === 0);

// 2) tighten PE good to 18 (still >? no: low type, good=18 means PE<18 => +1). PE=20 with good 18/bad 30 → 0 still.
//    Now loosen bad to 19: PE=20 > 19 => -1.
const tighter = clone(baseRS);
tighter.factors.find(f => f.id === "pe").bad = 19;
const t = engine.scoreItem(k, tighter);
check("editing PE bad=19 flips pe factor to -1", t.breakdown.pe === -1);
check("tighter composite < baseline composite", t.composite < base.composite);

// 3) make PE lenient: good=25 → PE=20 < 25 => +1
const looser = clone(baseRS);
looser.factors.find(f => f.id === "pe").good = 25;
const l = engine.scoreItem(k, looser);
check("editing PE good=25 flips pe factor to +1", l.breakdown.pe === 1);
check("looser composite > baseline composite", l.composite > base.composite);

// 4) boolAbove threshold edit: dividend 0.01, baseline threshold 0.03 → 0. Lower to 0.005 → 1.
const divEdit = clone(baseRS);
divEdit.factors.find(f => f.id === "div").threshold = 0.005;
const dv = engine.scoreItem(k, divEdit);
check("lowering dividend threshold to 0.005 flips div factor to 1", dv.breakdown.div === 1);

// 5) unedited clone still equals baseline (no drift)
check("clone of baseline reproduces composite", eq(engine.scoreItem(k, clone(baseRS)).composite, base.composite));

if (fails) { console.error("\n" + fails + " threshold checks FAILED"); process.exit(1); }
console.log("PASS — scoreItem honors edited good/bad/threshold; unedited ruleset unchanged");
