/* Metric registry — v0.1 (V2 Phase 2)
 * The data-facing layer: derives the metrics a ruleset references from a raw item.
 * Decouples rules from where values come from (universe row / fundamentals / ETF metrics),
 * which is also the layer the V1 connector-swap will reuse.
 *
 * Dual-mode: in Node it requires engine + the company ruleset; in the browser it uses the
 * inlined globals (RankingEngine, RANK_RULESETS).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RankingMetrics = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var engine   = (typeof require !== "undefined") ? require("./engine.js") : root.RankingEngine;
  var companyRS = (typeof require !== "undefined")
      ? require("./rulesets/company_fundamentals.json")
      : (root.RANK_RULESETS && root.RANK_RULESETS.company_fundamentals);

  // trend = 0.5*%vs200d + 0.5*%vs50d, with the original null fallbacks
  function trend(row) {
    var a = row.smapct == null ? null : row.smapct;
    var b = row.sma50pct == null ? null : row.sma50pct;
    return (a != null && b != null) ? 0.5 * a + 0.5 * b : (a != null ? a : (b != null ? b : null));
  }

  // fundScore = the absolute company-fundamentals composite (or null when no ratios object)
  function fundScore(row) {
    return row.k ? engine.scoreItem(row.k, companyRS).composite : null;
  }

  var ETF_KEYS = ["expense", "premdisc", "top10", "ret1y", "ret3m", "maxdd", "vol60"];

  // Build engine-ready items ({id, metrics}) for a given ranking kind.
  function prepare(rawItems, kind) {
    return rawItems.map(function (row) {
      var m = {};
      if (kind === "sector_company") {
        m.trend = trend(row);
        m.fundScore = fundScore(row);
      } else if (kind === "fund_category") {
        m.trend = trend(row);
        var mm = row.m || {};
        ETF_KEYS.forEach(function (k) { m[k] = (mm && mm[k] != null) ? mm[k] : null; });
      }
      return { id: row.ticker != null ? row.ticker : row.id, metrics: m };
    });
  }

  return { trend: trend, fundScore: fundScore, prepare: prepare, ETF_KEYS: ETF_KEYS };
});
