/* Phase 4 — conditional IF/THEN rules: predicates, actions, ordering, clamping, fired-reporting.
 *   run:  node tests/ranking/conditions.js
 */
const path = require("path");
const engine = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));

let fails = 0;
const check = (name, cond) => { if (!cond) { fails++; console.error("FAIL: " + name); } };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-12;

// ---- evalPredicate: operators ----
const ctx = { metrics: { pe: 20, cross: "Death Cross", roe: 0.3 }, factors: { fund: 0.8 }, dimensions: { risk: 0.4 }, composite: 0.6 };
check("lt true",  engine.evalPredicate({ field: "metric:pe", op: "lt", value: 25 }, ctx));
check("lt false", !engine.evalPredicate({ field: "metric:pe", op: "lt", value: 10 }, ctx));
check("gte true", engine.evalPredicate({ field: "metric:pe", op: "gte", value: 20 }, ctx));
check("eq string", engine.evalPredicate({ field: "metric:cross", op: "eq", value: "Death Cross" }, ctx));
check("ne", engine.evalPredicate({ field: "metric:cross", op: "ne", value: "Golden Cross" }, ctx));
check("in", engine.evalPredicate({ field: "metric:cross", op: "in", value: ["Death Cross", "—"] }, ctx));
check("between", engine.evalPredicate({ field: "metric:pe", op: "between", value: [10, 30] }, ctx));
check("factor field", engine.evalPredicate({ field: "factor:fund", op: "gt", value: 0.5 }, ctx));
check("dim field", engine.evalPredicate({ field: "dim:risk", op: "lt", value: 0.5 }, ctx));
check("composite field", engine.evalPredicate({ field: "composite", op: "gte", value: 0.6 }, ctx));
check("null metric is false", !engine.evalPredicate({ field: "metric:missing", op: "gt", value: 0 }, ctx));

// ---- composition ----
check("all", engine.evalPredicate({ all: [{ field: "metric:pe", op: "lt", value: 25 }, { field: "metric:roe", op: "gt", value: 0.2 }] }, ctx));
check("all false", !engine.evalPredicate({ all: [{ field: "metric:pe", op: "lt", value: 25 }, { field: "metric:roe", op: "gt", value: 0.5 }] }, ctx));
check("any", engine.evalPredicate({ any: [{ field: "metric:pe", op: "gt", value: 100 }, { field: "metric:roe", op: "gt", value: 0.2 }] }, ctx));
check("not", engine.evalPredicate({ not: { field: "metric:pe", op: "gt", value: 100 } }, ctx));

// ---- actions via scoreItem (absolute) ----
const RS = (conditions) => ({ factors: [{ id: "a", metric: "x", type: "high", good: 1, bad: 0 }], conditions: conditions });
// base: x=2 > good1 => +1 composite
check("base composite +1", near(engine.scoreItem({ x: 2 }, RS()).composite, 1));
// penalty -0.5
let r = engine.scoreItem({ x: 2, cross: "Death Cross" }, RS([{ id: "dc", when: { field: "metric:cross", op: "eq", value: "Death Cross" }, action: { type: "penalty", amount: 0.5 } }]));
check("penalty applied", near(r.composite, 0.5) && r.fired.indexOf("dc") >= 0);
// bonus +0.3 then clamp to [-1,1]
r = engine.scoreItem({ x: 2 }, RS([{ id: "b", when: { field: "metric:x", op: "gt", value: 1 }, action: { type: "bonus", amount: 0.3 } }]));
check("bonus clamped to 1", near(r.composite, 1) && r.fired.indexOf("b") >= 0);
// gate -> excluded, composite null
r = engine.scoreItem({ x: 2, m: -0.1 }, RS([{ id: "g", when: { field: "metric:m", op: "lt", value: 0 }, action: { type: "gate" } }]));
check("gate excludes", r.composite === null && r.excluded === true && r.fired.indexOf("g") >= 0);
// cap
r = engine.scoreItem({ x: 2 }, RS([{ id: "c", when: { field: "metric:x", op: "gt", value: 1 }, action: { type: "cap", value: 0.4 } }]));
check("cap applied", near(r.composite, 0.4));
// floor (composite +1, floor 0.7 -> stays 1; floor test with low base)
r = engine.scoreItem({ x: 0.5 }, RS([{ id: "f", when: { field: "metric:x", op: "lt", value: 1 }, action: { type: "floor", value: 0.5 } }]));
check("floor raises 0 -> 0.5", near(r.composite, 0.5));

// ---- ordering: gate wins over bonus; penalty before cap ----
r = engine.scoreItem({ x: 2, m: -1 }, RS([
  { id: "b", when: { field: "metric:x", op: "gt", value: 1 }, action: { type: "bonus", amount: 5 } },
  { id: "g", when: { field: "metric:m", op: "lt", value: 0 }, action: { type: "gate" } }]));
check("gate short-circuits bonus", r.composite === null && r.excluded);

// ---- rankGroup with a gate ----
const items = [{ id: "A", metrics: { t: 0.3, bad: 1 } }, { id: "B", metrics: { t: 0.1, bad: 0 } }, { id: "C", metrics: { t: 0.2, bad: 0 } }];
const gRS = { factors: [{ id: "t", metric: "t", norm: "percentile" }], conditions: [{ id: "x", when: { field: "metric:bad", op: "gt", value: 0 }, action: { type: "gate" } }] };
const gr = engine.rankGroup(items, gRS);
check("rankGroup gate nulls A", gr[0].composite === null && gr[0].excluded === true);
check("rankGroup keeps B,C", gr[1].composite != null && gr[2].composite != null);

// ---- validateRuleset: conditions schema ----
const okv = engine.validateRuleset({ factors: [{ id: "a", metric: "x", type: "high", good: 1, bad: 0 }],
  conditions: [{ id: "g", when: { field: "metric:x", op: "lt", value: 0 }, action: { type: "gate" } }] });
check("valid conditions pass", okv.ok);
const badv = engine.validateRuleset({ factors: [{ id: "a", metric: "x", type: "high", good: 1, bad: 0 }],
  conditions: [{ id: "g", when: { field: "factor:nope", op: "zz", value: 0 }, action: { type: "boom" } }] });
check("bad op/field/action flagged", !badv.ok && badv.errors.length >= 3);

if (fails) { console.error("\n" + fails + " condition checks FAILED"); process.exit(1); }
console.log("PASS — conditions engine: predicates, actions, ordering, clamping, validation, fired-reporting");
