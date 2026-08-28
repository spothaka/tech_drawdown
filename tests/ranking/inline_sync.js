/* Drift guard: inline template block must match what src/ranking/ generates. */
const fs = require("fs");
const path = require("path");
const BASE = path.join(__dirname, "..", "..");
const SRC = path.join(BASE, "src", "ranking");
const TPL = path.join(BASE, "scripts", "dashboard_tpl.html");
const engine = fs.readFileSync(path.join(SRC, "engine.js"), "utf8").trim();
const store  = fs.readFileSync(path.join(SRC, "store.js"), "utf8").trim();
const rd = f => fs.readFileSync(path.join(SRC, "rulesets", f), "utf8").trim();
const block = [
  "//__RANKING_BEGIN__  (generated from src/ranking by scripts/sync_engine.js — DO NOT EDIT HERE)",
  engine, store,
  "const RANK_RULESETS={company_fundamentals:" + rd("company_fundamentals.json") + ",sector_company:" + rd("sector_company.json") + ",fund_category:" + rd("fund_category.json") + ",growth_core:" + rd("growth_core.json") + "};",
  "var _RK_MN={}; Object.keys(RANK_RULESETS).forEach(function(id){(RANK_RULESETS[id].factors||[]).forEach(function(f){_RK_MN[f.metric]=1;});});",
  "var _RK_STORAGE=(typeof localStorage!=='undefined')?localStorage:{getItem:function(){return null;},setItem:function(){}};",
  "var RANK_STORE=RankingStore.create({storage:_RK_STORAGE,baselines:RANK_RULESETS,validate:RankingEngine.validateRuleset,metricNames:Object.keys(_RK_MN)});",
  "function getRuleset(id){ return RANK_STORE.getRuleset(id) || RANK_RULESETS[id]; }",
  "const rankGroup=RankingEngine.rankGroup;",
  "function fundScoreNorm(k){ if(!k) return null; return RankingEngine.scoreItem(k,getRuleset('company_fundamentals')).composite; }",
  "//__RANKING_END__"
].join("\n");
const html = fs.readFileSync(TPL, "utf8");
const B = "//__RANKING_BEGIN__", E = "//__RANKING_END__";
if (!html.includes(B) || !html.includes(E)) { console.error("FAIL — markers missing"); process.exit(1); }
const cur = html.slice(html.indexOf(B), html.indexOf(E) + E.length);
if (cur !== block) { console.error("FAIL — inline block OUT OF SYNC with src/ranking"); process.exit(1); }
console.log("PASS — inline template block matches src/ranking");
