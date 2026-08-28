#!/usr/bin/env node
/* recompute_core.js — rebuild the growth-core `coreRank` via the growth_core ruleset engine.
 *
 * Usage:  node scripts/recompute_core.js <core_metrics.json> [--pretty]
 *
 * Input JSON (assembled by the daily task from the connector + universe rows):
 *   { "NVDA": {roe,roa,gm,nm,pe,ev,trend,upside, off?, cross?, held?}, "GOOG": {...}, ... }
 *   - roe/roa/gm/nm/pe/ev  : company fundamentals (fractions for margins/roe; ratios for pe/ev)
 *   - trend                : 0.5*%vs200d + 0.5*%vs50d (from the universe row)
 *   - upside               : analyst target/price - 1
 *   - off, cross, held     : passthrough for the card (off-high, "Golden"/"Death", holding flag)
 *
 * Prints the new coreRank array (rank,ticker,comp,Q,V,T,A,pe,off,cross,up,held) as JSON to stdout.
 * On unreadable/empty input, exits non-zero so the caller can PRESERVE the prior coreRank (never blank).
 */
const fs = require("fs"), path = require("path");
const BASE = path.dirname(__dirname);
const engine = require(path.join(BASE, "src", "ranking", "engine.js"));
const RS = require(path.join(BASE, "src", "ranking", "rulesets", "growth_core.json"));

const inPath = process.argv[2];
if (!inPath) { console.error("usage: recompute_core.js <core_metrics.json> [--pretty]"); process.exit(1); }
let metrics;
try { metrics = JSON.parse(fs.readFileSync(inPath, "utf8")); } catch (e) { console.error("cannot read metrics: " + e.message); process.exit(2); }
const tickers = Object.keys(metrics || {});
if (!tickers.length) { console.error("no tickers in metrics"); process.exit(2); }

const items = tickers.map(t => ({ id: t, metrics: {
  roe: metrics[t].roe, roa: metrics[t].roa, gm: metrics[t].gm, nm: metrics[t].nm,
  pe: metrics[t].pe, ev: metrics[t].ev, trend: metrics[t].trend, upside: metrics[t].upside } }));
const scored = engine.rankGroup(items, RS);
const pctl = v => v == null ? null : Math.round(v * 100);
const rows = scored.map(s => { const m = metrics[s.id] || {}, dm = s.dimensions || {};
  return { ticker: s.id, _c: s.composite, comp: pctl(s.composite),
    Q: pctl(dm.quality), V: pctl(dm.valuation), T: pctl(dm.trend), A: pctl(dm.analyst),
    pe: (m.pe != null ? Math.round(m.pe * 10) / 10 : null),
    off: (m.off != null ? m.off : null),
    cross: (m.cross === "Death Cross" || m.cross === "Death" ? "Death" : "Golden"),
    up: (m.upside != null ? m.upside : null),
    held: !!m.held }; });
rows.sort((a, b) => (b._c == null ? -1 : b._c) - (a._c == null ? -1 : a._c));
rows.forEach((r, i) => { r.rank = i + 1; delete r._c; });
// stable key order for the card
const out = rows.map(r => ({ rank: r.rank, ticker: r.ticker, comp: r.comp, Q: r.Q, V: r.V, T: r.T, A: r.A, pe: r.pe, off: r.off, cross: r.cross, up: r.up, held: r.held }));
process.stdout.write(JSON.stringify(out, null, process.argv.includes("--pretty") ? 2 : 0));
