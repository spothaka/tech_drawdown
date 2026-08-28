/* recompute_core.js — rebuild coreRank via growth_core engine from a metrics fixture.
 *   run:  node tests/ranking/recompute_core.test.js
 */
const { execFileSync } = require("child_process");
const path = require("path");
const script  = path.join(__dirname, "..", "..", "scripts", "recompute_core.js");
const fixture = path.join(__dirname, "..", "..", "scripts", "core_metrics.sample.json");
let fails = 0; const check = (n, c) => { if (!c) { fails++; console.error("FAIL: " + n); } };
const out = JSON.parse(execFileSync("node", [script, fixture], { encoding: "utf8" }));
check("returns array of 3", Array.isArray(out) && out.length === 3);
check("ranks 1..n", out[0].rank === 1 && out[out.length - 1].rank === out.length);
check("NVDA ranks #1", out[0].ticker === "NVDA");
check("coreRank keys present", ["rank","ticker","comp","Q","V","T","A","pe","off","cross","up","held"].every(k => k in out[0]));
check("comp in 0..100", out.every(r => r.comp >= 0 && r.comp <= 100));
check("held passthrough", out.find(r => r.ticker === "MSFT").held === true);
if (fails) { console.error("\n" + fails + " recompute_core checks FAILED"); process.exit(1); }
console.log("PASS — recompute_core rebuilds coreRank via growth_core engine");
