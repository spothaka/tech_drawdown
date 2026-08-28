//__RANKING_BEGIN__  (generated from src/ranking by scripts/sync_engine.js — DO NOT EDIT HERE)
/* Rules-based ranking engine — v0.3 (V2 Phase 1 + 2 + 3)
 * Pure and dependency-free; runs in Node (tests) and the browser (inlined into the artifact).
 *
 *   scoreItem(metrics, ruleset)  ABSOLUTE per-item: typed scorers (+1/0/-1), weighted-averaged.
 *   rankGroup(items, ruleset)    GROUP-RELATIVE: percentile-within-group (optional invert),
 *                                grouped into dimensions, weighted-averaged.
 *   validateRuleset(rs, names)   Structural validation for the editor / import.
 *
 * Weights: factors and dimensions may carry an optional numeric `weight` (default 1). With all
 * weights at their default, weighted means equal plain means exactly — so baseline output is
 * unchanged (guarded by the golden-master tests).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RankingEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function scLow(v, g, b)  { return v == null ? null : (v < g ? 1 : (v > b ? -1 : 0)); }
  function scHigh(v, g, b) { return v == null ? null : (v > g ? 1 : (v < b ? -1 : 0)); }
  function boolAbove(v, t) { return v == null ? null : (v > t ? 1 : 0); }

  function passesGate(gate, v) {
    if (!gate) return true;
    if (gate === "positiveEarnings") return v != null && v > 0;
    if (gate === "notNull") return v != null;
    return true;
  }

  function factorScore(f, metrics) {
    var v = metrics ? metrics[f.metric] : null;
    if (v === undefined) v = null;
    if (!passesGate(f.gate, v)) return null;
    switch (f.type) {
      case "low":       return scLow(v, f.good, f.bad);
      case "high":      return scHigh(v, f.good, f.bad);
      case "boolAbove": return boolAbove(v, f.threshold);
      default:          return null;
    }
  }

  function meanOfAvailable(scores) {
    var xs = scores.filter(function (s) { return s != null; });
    if (!xs.length) return null;
    return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  }

  // weighted mean of {v,w} pairs; drops v==null and w<=0; null if none. All w=1 => plain mean.
  function weightedMeanOfAvailable(pairs) {
    var num = 0, den = 0, any = false;
    for (var i = 0; i < pairs.length; i++) {
      var v = pairs[i].v, w = pairs[i].w == null ? 1 : pairs[i].w;
      if (v == null || w <= 0) continue;
      num += w * v; den += w; any = true;
    }
    return any ? num / den : null;
  }

  function pctRanks(vals) {
    var idx = vals.map(function (v, i) { return [v, i]; })
                  .filter(function (p) { return p[0] != null; })
                  .sort(function (a, b) { return a[0] - b[0]; });
    var out = new Array(vals.length).fill(null), n = idx.length;
    idx.forEach(function (p, r) { out[p[1]] = n > 1 ? r / (n - 1) : 1; });
    return out;
  }

  function getMetric(item, name) {
    var m = item && item.metrics ? item.metrics[name] : null;
    return m === undefined ? null : m;
  }
  function fw(f) { return f && f.weight != null ? f.weight : 1; }

  // ---- conditions (IF/THEN): predicates + actions ----
  function _cmp(op, a, b) {
    if (a == null) return false;
    switch (op) {
      case "lt":  return a <  b;
      case "lte": return a <= b;
      case "gt":  return a >  b;
      case "gte": return a >= b;
      case "eq":  return a === b;
      case "ne":  return a !== b;
      case "in":  return Array.isArray(b) && b.indexOf(a) >= 0;
      case "between": return Array.isArray(b) && a >= b[0] && a <= b[1];
      default: return false;
    }
  }
  function _fieldVal(field, ctx) {
    if (field === "composite") return ctx.composite;
    var i = field.indexOf(":"), kind = field.slice(0, i), name = field.slice(i + 1);
    if (kind === "metric") { var m = ctx.metrics ? ctx.metrics[name] : null; return m === undefined ? null : m; }
    if (kind === "factor") return ctx.factors ? ctx.factors[name] : null;
    if (kind === "dim")    return ctx.dimensions ? ctx.dimensions[name] : null;
    return null;
  }
  function evalPredicate(p, ctx) {
    if (!p || typeof p !== "object") return false;
    if (p.all) return p.all.every(function (x) { return evalPredicate(x, ctx); });
    if (p.any) return p.any.some(function (x) { return evalPredicate(x, ctx); });
    if (p.not) return !evalPredicate(p.not, ctx);
    return _cmp(p.op, _fieldVal(p.field, ctx), p.value);
  }
  // Apply ruleset.conditions in fixed order: gates -> bonuses/penalties -> caps/floors, then clamp.
  // ctx is read-only (composite = base). Returns {composite, fired[], excluded}. No conditions => inert.
  function applyConditions(base, ctx, ruleset, clamp) {
    var conds = ruleset.conditions || [];
    if (!conds.length) return { composite: base, fired: [], excluded: false };
    var fired = [], i, c, a;
    for (i = 0; i < conds.length; i++) {
      c = conds[i]; a = c.action || {};
      if (a.type === "gate" && evalPredicate(c.when, ctx)) { fired.push(c.id); return { composite: null, fired: fired, excluded: true }; }
    }
    var comp = base;
    if (comp != null) {
      for (i = 0; i < conds.length; i++) {
        c = conds[i]; a = c.action || {};
        if ((a.type === "bonus" || a.type === "penalty") && evalPredicate(c.when, ctx)) {
          comp += (a.type === "bonus" ? 1 : -1) * (a.amount || 0); fired.push(c.id);
        }
      }
      for (i = 0; i < conds.length; i++) {
        c = conds[i]; a = c.action || {};
        if (a.type === "cap" && evalPredicate(c.when, ctx) && comp > a.value) { comp = a.value; fired.push(c.id); }
        else if (a.type === "floor" && evalPredicate(c.when, ctx) && comp < a.value) { comp = a.value; fired.push(c.id); }
      }
      if (clamp) comp = Math.max(clamp[0], Math.min(clamp[1], comp));
    }
    return { composite: comp, fired: fired, excluded: false };
  }
  function _validatePred(p, factorIds, tag) {
    var e = [];
    if (!p || typeof p !== "object") return [tag + " missing/invalid when"];
    if (p.all || p.any) {
      var arr = p.all || p.any;
      if (!Array.isArray(arr) || !arr.length) e.push(tag + " all/any must be a non-empty array");
      else arr.forEach(function (x) { _validatePred(x, factorIds, tag).forEach(function (m) { e.push(m); }); });
      return e;
    }
    if (p.not) return _validatePred(p.not, factorIds, tag);
    if (!p.field || typeof p.field !== "string") { e.push(tag + " predicate missing field"); return e; }
    if (p.field !== "composite") {
      var i = p.field.indexOf(":"), kind = i < 0 ? "" : p.field.slice(0, i), name = p.field.slice(i + 1);
      if (["metric", "factor", "dim"].indexOf(kind) < 0) e.push(tag + " invalid field: " + p.field);
      else if (kind === "factor" && factorIds && !factorIds[name]) e.push(tag + " unknown factor: " + name);
    }
    if (["lt", "lte", "gt", "gte", "eq", "ne", "in", "between"].indexOf(p.op) < 0) e.push(tag + " invalid op: " + p.op);
    return e;
  }

  // ---- ABSOLUTE (per-item) ----
  function scoreItem(metrics, ruleset) {
    var breakdown = {};
    var pairs = (ruleset.factors || []).map(function (f) {
      var s = factorScore(f, metrics);
      breakdown[f.id] = s;
      return { v: s, w: fw(f) };
    });
    var comp = weightedMeanOfAvailable(pairs);
    var adj = applyConditions(comp, { metrics: metrics, factors: breakdown, dimensions: {}, composite: comp }, ruleset, [-1, 1]);
    return { composite: adj.composite, breakdown: breakdown, fired: adj.fired, excluded: adj.excluded };
  }

  function rank(items, ruleset) {
    return items.map(function (it) {
      var r = scoreItem(it.metrics, ruleset);
      return { id: it.id, composite: r.composite, breakdown: r.breakdown };
    }).sort(function (a, b) {
      return (b.composite == null ? -Infinity : b.composite) - (a.composite == null ? -Infinity : a.composite);
    });
  }

  // ---- GROUP-RELATIVE (percentile). Aligned to input order. ----
  function rankGroup(items, ruleset) {
    var factors = ruleset.factors || [];
    var byId = {}; factors.forEach(function (f) { byId[f.id] = f; });
    var norm = {};
    factors.forEach(function (f) {
      if ((f.norm || "absolute") === "percentile") {
        var p = pctRanks(items.map(function (it) { return getMetric(it, f.metric); }));
        norm[f.id] = p.map(function (x) { return f.invert ? (x == null ? null : 1 - x) : x; });
      } else {
        norm[f.id] = items.map(function (it) { return factorScore(f, it.metrics); });
      }
    });
    var dims = ruleset.dimensions ||
      factors.map(function (f) { return { id: f.id, factors: [f.id] }; });
    return items.map(function (it, i) {
      var fb = {}, dimBreak = {}, dimPairs = [];
      factors.forEach(function (f) { fb[f.id] = norm[f.id][i]; });
      dims.forEach(function (d) {
        var ds = weightedMeanOfAvailable(d.factors.map(function (fid) {
          return { v: norm[fid][i], w: fw(byId[fid]) };
        }));
        dimBreak[d.id] = ds;
        dimPairs.push({ v: ds, w: d.weight == null ? 1 : d.weight });
      });
      var comp = weightedMeanOfAvailable(dimPairs);
      var adj = applyConditions(comp, { metrics: it.metrics, factors: fb, dimensions: dimBreak, composite: comp }, ruleset, [0, 1]);
      return { id: it.id, composite: adj.composite, factors: fb, dimensions: dimBreak, fired: adj.fired, excluded: adj.excluded };
    });
  }

  // ---- validation (editor / import) ----
  function validateRuleset(rs, metricNames) {
    var e = [];
    if (!rs || typeof rs !== "object") return { ok: false, errors: ["ruleset must be an object"] };
    if (!Array.isArray(rs.factors) || !rs.factors.length) e.push("factors must be a non-empty array");
    var ids = {};
    (rs.factors || []).forEach(function (f, i) {
      var tag = "factor " + ((f && f.id) || ("#" + i));
      if (!f || typeof f !== "object") { e.push(tag + " must be an object"); return; }
      if (!f.id) e.push(tag + " missing id");
      else if (ids[f.id]) e.push("duplicate factor id: " + f.id); else ids[f.id] = 1;
      if (!f.metric || typeof f.metric !== "string") e.push(tag + " missing metric");
      var norm = f.norm || "absolute";
      if (norm === "absolute") { if (["low", "high", "boolAbove"].indexOf(f.type) < 0) e.push(tag + " invalid type: " + f.type); }
      else if (norm !== "percentile") e.push(tag + " invalid norm: " + norm);
      if (f.weight != null && (typeof f.weight !== "number" || !isFinite(f.weight) || f.weight < 0)) e.push(tag + " weight must be a number >= 0");
      if (metricNames && f.metric && metricNames.indexOf(f.metric) < 0) e.push(tag + " unknown metric: " + f.metric);
    });
    if (rs.dimensions != null) {
      if (!Array.isArray(rs.dimensions)) e.push("dimensions must be an array");
      else rs.dimensions.forEach(function (d, i) {
        var tag = "dimension " + ((d && d.id) || ("#" + i));
        if (!d.id) e.push(tag + " missing id");
        if (!Array.isArray(d.factors) || !d.factors.length) e.push(tag + " must list factors");
        else d.factors.forEach(function (fid) { if (!ids[fid]) e.push(tag + " references unknown factor: " + fid); });
        if (d.weight != null && (typeof d.weight !== "number" || !isFinite(d.weight) || d.weight < 0)) e.push(tag + " weight must be a number >= 0");
      });
    }
    if (rs.conditions != null) {
      if (!Array.isArray(rs.conditions)) e.push("conditions must be an array");
      else {
        var cids = {};
        rs.conditions.forEach(function (c, i) {
          var tag = "condition " + ((c && c.id) || ("#" + i));
          if (!c || typeof c !== "object") { e.push(tag + " must be an object"); return; }
          if (!c.id) e.push(tag + " missing id");
          else if (cids[c.id]) e.push("duplicate condition id: " + c.id); else cids[c.id] = 1;
          _validatePred(c.when, ids, tag).forEach(function (m) { e.push(m); });
          var a = c.action;
          if (!a || typeof a !== "object") e.push(tag + " missing action");
          else {
            if (["gate", "bonus", "penalty", "cap", "floor"].indexOf(a.type) < 0) e.push(tag + " invalid action type: " + a.type);
            if ((a.type === "bonus" || a.type === "penalty") && (typeof a.amount !== "number" || !isFinite(a.amount))) e.push(tag + " amount must be a number");
            if ((a.type === "cap" || a.type === "floor") && (typeof a.value !== "number" || !isFinite(a.value))) e.push(tag + " value must be a number");
          }
        });
      }
    }
    return { ok: e.length === 0, errors: e };
  }

  return {
    version: "0.4",
    scLow: scLow, scHigh: scHigh, boolAbove: boolAbove, passesGate: passesGate,
    factorScore: factorScore, meanOfAvailable: meanOfAvailable, weightedMeanOfAvailable: weightedMeanOfAvailable,
    pctRanks: pctRanks, scoreItem: scoreItem, rank: rank, rankGroup: rankGroup, validateRuleset: validateRuleset,
    evalPredicate: evalPredicate, applyConditions: applyConditions
  };
});
/* Ruleset store — v0.1 (V2 Phase 3)
 * Pure, storage-injectable manager for user-customized rulesets: active override vs baseline,
 * named presets, export/import. Dual-mode (Node tests / browser localStorage).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RankingStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var KEY = "tdd_rulesets_v1";
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage;
    var baselines = opts.baselines || {};
    var validate = opts.validate || function () { return { ok: true, errors: [] }; };
    var metricNames = opts.metricNames || null;

    function _load() { try { return JSON.parse(storage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
    function _ensure(s) { if (!s.overrides) s.overrides = {}; if (!s.presets) s.presets = {}; return s; }
    function _save(s) { storage.setItem(KEY, JSON.stringify(s)); }

    function getRuleset(id) {
      var s = _ensure(_load());
      if (s.overrides[id]) return clone(s.overrides[id]);
      return baselines[id] ? clone(baselines[id]) : null;
    }
    function isModified(id) { return !!_ensure(_load()).overrides[id]; }
    function setActive(id, rs) {
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      var s = _ensure(_load()); s.overrides[id] = clone(rs); _save(s); return { ok: true, errors: [] };
    }
    function resetActive(id) { var s = _ensure(_load()); delete s.overrides[id]; _save(s); return getRuleset(id); }
    function listPresets(id) { return Object.keys(_ensure(_load()).presets[id] || {}); }
    function savePreset(id, name, rs) {
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      var s = _ensure(_load()); (s.presets[id] = s.presets[id] || {})[name] = clone(rs); _save(s); return { ok: true, errors: [] };
    }
    function loadPreset(id, name) { var p = (_ensure(_load()).presets[id] || {})[name]; return p ? clone(p) : null; }
    function deletePreset(id, name) { var s = _ensure(_load()); if (s.presets[id]) delete s.presets[id][name]; _save(s); }
    function exportRuleset(id) { var rs = getRuleset(id); return rs ? JSON.stringify(rs, null, 2) : null; }
    function importRuleset(id, json) {
      var rs; try { rs = typeof json === "string" ? JSON.parse(json) : json; }
      catch (e) { return { ok: false, errors: ["invalid JSON: " + e.message] }; }
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      return setActive(id, rs);
    }
    return { getRuleset: getRuleset, isModified: isModified, setActive: setActive, resetActive: resetActive,
      listPresets: listPresets, savePreset: savePreset, loadPreset: loadPreset, deletePreset: deletePreset,
      exportRuleset: exportRuleset, importRuleset: importRuleset, KEY: KEY };
  }
  return { create: create, KEY: KEY };
});
const RANK_RULESETS={company_fundamentals:{
  "name": "Company Fundamentals (baseline)",
  "version": "1.0",
  "appliesTo": "company",
  "description": "Baseline ruleset that reproduces the original fundScoreNorm() exactly. Composite = mean of the available factor scores (+1 good / 0 neutral / -1 poor).",
  "aggregate": "meanOfAvailable",
  "factors": [
    { "id": "pe",  "group": "valuation", "metric": "price_to_earnings_ratio_ttm", "type": "low",  "good": 15,   "bad": 30,   "gate": "positiveEarnings", "label": "P/E" },
    { "id": "ps",  "group": "valuation", "metric": "price_to_sales_ratio_ttm",    "type": "low",  "good": 2,    "bad": 6,    "label": "P/S" },
    { "id": "pb",  "group": "valuation", "metric": "price_to_book_ratio_ttm",     "type": "low",  "good": 3,    "bad": 8,    "label": "P/B" },
    { "id": "ev",  "group": "valuation", "metric": "ev_to_ebitda_ttm",            "type": "low",  "good": 12,   "bad": 22,   "label": "EV/EBITDA" },
    { "id": "fcf", "group": "valuation", "metric": "free_cash_flow_yield_ttm",    "type": "high", "good": 0.05, "bad": 0.02, "label": "FCF yield" },
    { "id": "div", "group": "income",    "metric": "dividend_yield_ttm",          "type": "boolAbove", "threshold": 0.03, "label": "Dividend > 3%" },
    { "id": "roe", "group": "quality",   "metric": "return_on_equity_ttm",        "type": "high", "good": 0.20, "bad": 0.10, "label": "ROE" },
    { "id": "roa", "group": "quality",   "metric": "return_on_assets_ttm",        "type": "high", "good": 0.10, "bad": 0.05, "label": "ROA" },
    { "id": "gm",  "group": "quality",   "metric": "gross_profit_margin_ttm",     "type": "high", "good": 0.50, "bad": 0.30, "label": "Gross margin" },
    { "id": "nm",  "group": "quality",   "metric": "net_profit_margin_ttm",       "type": "high", "good": 0.15, "bad": 0.05, "label": "Net margin" },
    { "id": "de",  "group": "health",    "metric": "debt_to_equity_ratio_ttm",    "type": "low",  "good": 0.5,  "bad": 1.5,  "label": "Debt/Equity" },
    { "id": "cr",  "group": "health",    "metric": "current_ratio_ttm",           "type": "high", "good": 1.5,  "bad": 1.0,  "label": "Current ratio" }
  ]
},sector_company:{
  "name": "Sector Company Ranking (baseline)",
  "version": "1.0",
  "appliesTo": "company-group",
  "mode": "group",
  "description": "50% percentile of SMA-trend + 50% percentile of fundamental score, within the sector. Reproduces openSectorRanking().",
  "aggregate": "meanOfAvailableDimensions",
  "factors": [
    { "id": "trend", "metric": "trend",     "norm": "percentile", "invert": false, "label": "SMA trend" },
    { "id": "fund",  "metric": "fundScore", "norm": "percentile", "invert": false, "label": "Fundamentals" }
  ],
  "dimensions": [
    { "id": "trend",        "factors": ["trend"], "label": "SMA trend" },
    { "id": "fundamentals", "factors": ["fund"],  "label": "Fundamentals" }
  ]
},fund_category:{
  "name": "Fund / Category Ranking (baseline)",
  "version": "1.0",
  "appliesTo": "fund-group",
  "mode": "group",
  "description": "Equal-weight of Overview, Holdings, Returns, Risk, and SMA-trend dimensions; each a percentile blend within the category (lower-is-better metrics inverted). Mutual funds (no ETF metrics) fall back to trend-only automatically. Reproduces openCategoryRanking().",
  "aggregate": "meanOfAvailableDimensions",
  "factors": [
    { "id": "trend",    "metric": "trend",    "norm": "percentile", "invert": false, "label": "SMA trend" },
    { "id": "expense",  "metric": "expense",  "norm": "percentile", "invert": true,  "label": "Expense ratio" },
    { "id": "premdisc", "metric": "premdisc", "norm": "percentile", "invert": true,  "label": "Premium/Discount" },
    { "id": "top10",    "metric": "top10",    "norm": "percentile", "invert": true,  "label": "Top-10 weight" },
    { "id": "ret1y",    "metric": "ret1y",    "norm": "percentile", "invert": false, "label": "1Y return" },
    { "id": "ret3m",    "metric": "ret3m",    "norm": "percentile", "invert": false, "label": "3M return" },
    { "id": "maxdd",    "metric": "maxdd",    "norm": "percentile", "invert": false, "label": "Max drawdown" },
    { "id": "vol60",    "metric": "vol60",    "norm": "percentile", "invert": true,  "label": "Volatility 60D" }
  ],
  "dimensions": [
    { "id": "overview", "factors": ["expense", "premdisc"], "label": "Overview" },
    { "id": "holdings", "factors": ["top10"],               "label": "Holdings" },
    { "id": "returns",  "factors": ["ret1y", "ret3m"],      "label": "Returns" },
    { "id": "risk",     "factors": ["maxdd", "vol60"],      "label": "Risk" },
    { "id": "trend",    "factors": ["trend"],               "label": "SMA trend" }
  ]
},growth_core:{
  "name": "Growth-core shortlist (baseline)",
  "version": "1.0",
  "appliesTo": "company-group",
  "mode": "group",
  "description": "Quality + Valuation + Trend + Analyst, each a percentile blend within the growth-core shortlist (lower-is-better metrics inverted). Quality-tilted default weights (2/1/1/1 ~ 40/20/20/20).",
  "aggregate": "meanOfAvailableDimensions",
  "factors": [
    { "id": "roe",    "metric": "roe",    "norm": "percentile", "invert": false, "label": "ROE" },
    { "id": "roa",    "metric": "roa",    "norm": "percentile", "invert": false, "label": "ROA" },
    { "id": "gm",     "metric": "gm",     "norm": "percentile", "invert": false, "label": "Gross margin" },
    { "id": "nm",     "metric": "nm",     "norm": "percentile", "invert": false, "label": "Net margin" },
    { "id": "pe",     "metric": "pe",     "norm": "percentile", "invert": true,  "label": "P/E" },
    { "id": "ev",     "metric": "ev",     "norm": "percentile", "invert": true,  "label": "EV/EBITDA" },
    { "id": "trend",  "metric": "trend",  "norm": "percentile", "invert": false, "label": "SMA trend" },
    { "id": "upside", "metric": "upside", "norm": "percentile", "invert": false, "label": "Analyst upside" }
  ],
  "dimensions": [
    { "id": "quality",   "factors": ["roe", "roa", "gm", "nm"], "label": "Quality",   "weight": 2 },
    { "id": "valuation", "factors": ["pe", "ev"],               "label": "Valuation", "weight": 1 },
    { "id": "trend",     "factors": ["trend"],                  "label": "Trend",     "weight": 1 },
    { "id": "analyst",   "factors": ["upside"],                 "label": "Analyst",   "weight": 1 }
  ]
}};
var _RK_MN={}; Object.keys(RANK_RULESETS).forEach(function(id){(RANK_RULESETS[id].factors||[]).forEach(function(f){_RK_MN[f.metric]=1;});});
var _RK_STORAGE=(typeof localStorage!=='undefined')?localStorage:{getItem:function(){return null;},setItem:function(){}};
var RANK_STORE=RankingStore.create({storage:_RK_STORAGE,baselines:RANK_RULESETS,validate:RankingEngine.validateRuleset,metricNames:Object.keys(_RK_MN)});
function getRuleset(id){ return RANK_STORE.getRuleset(id) || RANK_RULESETS[id]; }
const rankGroup=RankingEngine.rankGroup;
function fundScoreNorm(k){ if(!k) return null; return RankingEngine.scoreItem(k,getRuleset('company_fundamentals')).composite; }
//__RANKING_END__
