/* Golden-master parity test (V2 Phase 1)
 * The engine + baseline ruleset MUST reproduce the original fundScoreNorm() exactly.
 * Runs many randomized cases including edge/threshold values (nulls, 0, negatives,
 * and every threshold boundary). Any mismatch fails the build.
 *   run:  node tests/ranking/golden_master.js
 */
const path = require("path");
const engine  = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));
const ruleset = require(path.join(__dirname, "..", "..", "src", "ranking", "rulesets", "company_fundamentals.json"));

// --- verbatim copy of the ORIGINAL scoring from dashboard_tpl.html (source of truth) ---
function scLow(v,g,b){return v==null?null:(v<g?1:(v>b?-1:0));}
function scHigh(v,g,b){return v==null?null:(v>g?1:(v<b?-1:0));}
function fundScoreNorm(k){
  if(!k) return null;
  const pe=k.price_to_earnings_ratio_ttm, noEarn=(pe==null||pe<=0);
  const val=[]; if(!noEarn) val.push(scLow(pe,15,30));
  val.push(scLow(k.price_to_sales_ratio_ttm,2,6)); val.push(scLow(k.price_to_book_ratio_ttm,3,8));
  val.push(scLow(k.ev_to_ebitda_ttm,12,22)); val.push(scHigh(k.free_cash_flow_yield_ttm,0.05,0.02));
  const divB=(k.dividend_yield_ttm==null)?null:(k.dividend_yield_ttm>0.03?1:0);
  const qual=[scHigh(k.return_on_equity_ttm,0.20,0.10),scHigh(k.return_on_assets_ttm,0.10,0.05),scHigh(k.gross_profit_margin_ttm,0.50,0.30),scHigh(k.net_profit_margin_ttm,0.15,0.05)];
  const health=[scLow(k.debt_to_equity_ratio_ttm,0.5,1.5),scHigh(k.current_ratio_ttm,1.5,1.0)];
  const cl=a=>a.filter(x=>x!=null);
  const all=[...cl(val),...(divB!=null?[divB]:[]),...cl(qual),...cl(health)];
  return all.length?all.reduce((a,b)=>a+b,0)/all.length:null;
}

// --- randomized metric generator: nulls, zero, negatives, and every threshold boundary ---
const KEYS=["price_to_earnings_ratio_ttm","price_to_sales_ratio_ttm","price_to_book_ratio_ttm","ev_to_ebitda_ttm","free_cash_flow_yield_ttm","dividend_yield_ttm","return_on_equity_ttm","return_on_assets_ttm","gross_profit_margin_ttm","net_profit_margin_ttm","debt_to_equity_ratio_ttm","current_ratio_ttm"];
const EDGES=[null,0,-5,-0.1,0.02,0.03,0.05,0.10,0.15,0.20,0.30,0.5,1.0,1.5,2,3,6,8,12,15,22,30,45,100];
function rnd(){ return EDGES[Math.floor(Math.random()*EDGES.length)]; }
function randK(){ if(Math.random()<0.05) return {}; const k={}; KEYS.forEach(key=>{ k[key]= Math.random()<0.15?null:rnd(); }); return k; }
function eq(a,b){ if(a==null&&b==null) return true; if(a==null||b==null) return false; return Math.abs(a-b)<1e-12; }

const N=20000; let fails=0; const examples=[];
for(let i=0;i<N;i++){
  const k=randK();
  const orig=fundScoreNorm(k);
  const eng=engine.scoreItem(k,ruleset).composite;
  if(!eq(orig,eng)){ fails++; if(examples.length<5) examples.push({k,orig,eng}); }
}
// explicit degenerate inputs
[[null],[{}]].forEach(([k])=>{ if(!eq(fundScoreNorm(k),engine.scoreItem(k||{},ruleset).composite)) { fails++; examples.push({k,note:"degenerate"}); } });

console.log("golden-master parity: cases="+N+" mismatches="+fails);
if(fails){ console.log(JSON.stringify(examples,null,2)); console.error("FAIL — engine diverges from fundScoreNorm"); process.exit(1); }
console.log("PASS — engine + baseline ruleset reproduce fundScoreNorm exactly");
