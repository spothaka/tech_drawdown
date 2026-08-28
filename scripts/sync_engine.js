/* sync_engine.js — materialize the inline ranking block from src/ranking/
 * (engine.js + store.js + ruleset JSONs) into src/dash/76_ranking_engine.js.
 * Single source of truth for the ranking engine.
 *   node scripts/sync_engine.js            # regenerate src/dash/76_ranking_engine.js
 *   node scripts/sync_engine.js --check    # exit 1 if the module is out of sync
 *   node scripts/sync_engine.js <path>     # target an explicit .js/.html file
 * (Only USER args are scanned for a target — argv[1] is the script itself and is skipped.)
 */
const fs = require("fs");
const path = require("path");
const BASE = process.env.TDD_BASE || path.dirname(__dirname);
const SRC = path.join(BASE, "src", "ranking");
const TPL = process.argv.slice(2).find(a => a.endsWith(".html") || a.endsWith(".js"))
  || path.join(BASE, "src", "dash", "76_ranking_engine.js");
const CHECK = process.argv.includes("--check");

function buildBlock() {
  const engine = fs.readFileSync(path.join(SRC, "engine.js"), "utf8").trim();
  const store  = fs.readFileSync(path.join(SRC, "store.js"), "utf8").trim();
  const rd = f => fs.readFileSync(path.join(SRC, "rulesets", f), "utf8").trim();
  return [
    "//__RANKING_BEGIN__  (generated from src/ranking by scripts/sync_engine.js — DO NOT EDIT HERE)",
    engine,
    store,
    "const RANK_RULESETS={company_fundamentals:" + rd("company_fundamentals.json") + ",sector_company:" + rd("sector_company.json") + ",fund_category:" + rd("fund_category.json") + ",growth_core:" + rd("growth_core.json") + "};",
    "var _RK_MN={}; Object.keys(RANK_RULESETS).forEach(function(id){(RANK_RULESETS[id].factors||[]).forEach(function(f){_RK_MN[f.metric]=1;});});",
    "var _RK_STORAGE=(typeof localStorage!=='undefined')?localStorage:{getItem:function(){return null;},setItem:function(){}};",
    "var RANK_STORE=RankingStore.create({storage:_RK_STORAGE,baselines:RANK_RULESETS,validate:RankingEngine.validateRuleset,metricNames:Object.keys(_RK_MN)});",
    "function getRuleset(id){ return RANK_STORE.getRuleset(id) || RANK_RULESETS[id]; }",
    "const rankGroup=RankingEngine.rankGroup;",
    "function fundScoreNorm(k){ if(!k) return null; return RankingEngine.scoreItem(k,getRuleset('company_fundamentals')).composite; }",
    "//__RANKING_END__"
  ].join("\n");
}

function replaceRegion(html, block) {
  const B = "//__RANKING_BEGIN__", E = "//__RANKING_END__";
  if (html.includes(B) && html.includes(E)) {
    return html.slice(0, html.indexOf(B)) + block + html.slice(html.indexOf(E) + E.length);
  }
  throw new Error("Could not locate the ranking markers in " + TPL);
}

const html = fs.readFileSync(TPL, "utf8");
const block = buildBlock();
if (CHECK) {
  const cur = html.includes("//__RANKING_BEGIN__")
    ? html.slice(html.indexOf("//__RANKING_BEGIN__"), html.indexOf("//__RANKING_END__") + "//__RANKING_END__".length)
    : null;
  if (cur === block) { console.log("sync_engine --check: IN SYNC"); process.exit(0); }
  console.error("sync_engine --check: OUT OF SYNC — run node scripts/sync_engine.js"); process.exit(1);
}
const updated = replaceRegion(html, block);
if (updated === html) console.log("sync_engine: no change");
else { fs.writeFileSync(TPL, updated); console.log("sync_engine: block regenerated (" + TPL + ")"); }
