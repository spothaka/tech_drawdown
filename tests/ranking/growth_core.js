/* Growth-core ruleset — worked-example sanity (new model; no prior formula to match).
 * Verifies rankGroup + growth_core.json: percentile blend, inverts on P/E & EV,
 * quality-tilted weights (2/1/1/1), dimension breakdown present.
 *   run:  node tests/ranking/growth_core.js
 */
const path = require("path");
const engine = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));
const RS = require(path.join(__dirname, "..", "..", "src", "ranking", "rulesets", "growth_core.json"));

let fails = 0;
const check = (name, cond) => { if (!cond) { fails++; console.error("FAIL: " + name); } };

const items = [
  { id: "QUAL",  metrics: { roe: 0.45, roa: 0.25, gm: 0.75, nm: 0.40, pe: 40, ev: 30, trend: 0.05,  upside: 0.05 } },
  { id: "CHEAP", metrics: { roe: 0.08, roa: 0.04, gm: 0.30, nm: 0.08, pe: 9,  ev: 7,  trend: -0.08, upside: 0.35 } },
  { id: "MOMO",  metrics: { roe: 0.20, roa: 0.12, gm: 0.50, nm: 0.20, pe: 22, ev: 16, trend: 0.20,  upside: 0.15 } }
];
const r = engine.rankGroup(items, RS);
const by = {}; r.forEach(x => by[x.id] = x);

check("composite present for all", r.every(x => x.composite != null));
check("dimensions present", ["quality", "valuation", "trend", "analyst"].every(d => by.QUAL.dimensions[d] != null));
check("QUAL leads Quality", by.QUAL.dimensions.quality > by.CHEAP.dimensions.quality && by.QUAL.dimensions.quality > by.MOMO.dimensions.quality);
check("CHEAP leads Valuation (inverted)", by.CHEAP.dimensions.valuation > by.QUAL.dimensions.valuation);
check("MOMO leads Trend", by.MOMO.dimensions.trend >= by.QUAL.dimensions.trend && by.MOMO.dimensions.trend >= by.CHEAP.dimensions.trend);
check("CHEAP leads Analyst", by.CHEAP.dimensions.analyst > by.QUAL.dimensions.analyst);

// Weighted blend (quality 2, others 1; percentiles 0/0.5/1): QUAL 0.50, CHEAP 0.40, MOMO 0.60.
const ranked = r.slice().sort((a, b) => b.composite - a.composite);
check("MOMO ranks #1 (balanced + trend)", ranked[0].id === "MOMO");
check("quality tilt lifts QUAL over CHEAP", by.QUAL.composite > by.CHEAP.composite);
check("composite math exact", Math.abs(by.QUAL.composite - 0.5) < 1e-12 && Math.abs(by.CHEAP.composite - 0.4) < 1e-12 && Math.abs(by.MOMO.composite - 0.6) < 1e-12);
check("growth_core.json validates", engine.validateRuleset(RS, null).ok);

if (fails) { console.error("\n" + fails + " growth_core checks FAILED"); process.exit(1); }
console.log("PASS — growth_core: percentile dims, inverts, quality-tilted weighting");
