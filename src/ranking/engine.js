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
