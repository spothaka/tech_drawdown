/* Golden-master parity — SECTOR company ranking (V2 Phase 2)
 * engine.rankGroup + sector_company ruleset MUST reproduce openSectorRanking()'s composite
 * exactly, across randomized sectors (incl. 1-item groups, nulls, ties).
 *   run:  node tests/ranking/golden_master_sector.js
 */
const path = require("path");
const engine  = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));
const metrics = require(path.join(__dirname, "..", "..", "src", "ranking", "metrics.js"));
const sectorRS = require(path.join(__dirname, "..", "..", "src", "ranking", "rulesets", "sector_company.json"));

// ---- verbatim original scoring ----
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
function pctRanks(vals){
  const idx=vals.map((v,i)=>[v,i]).filter(p=>p[0]!=null).sort((a,b)=>a[0]-b[0]);
  const out=new Array(vals.length).fill(null), n=idx.length;
  idx.forEach((p,r)=>{ out[p[1]]= n>1? r/(n-1) : 1; });
  return out;
}
function origSectorComp(rows){
  const st=rows.map(c=>({trend:(c.smapct!=null&&c.sma50pct!=null)?0.5*c.smapct+0.5*c.sma50pct:(c.smapct!=null?c.smapct:(c.sma50pct!=null?c.sma50pct:null)),
    fund:{score:fundScoreNorm(c.k)}}));
  const pt=pctRanks(st.map(c=>c.trend)), pf=pctRanks(st.map(c=>c.fund&&c.fund.score!=null?c.fund.score:null));
  return st.map((c,i)=>{const parts=[]; if(pt[i]!=null)parts.push(pt[i]); if(pf[i]!=null)parts.push(pf[i]); return parts.length?parts.reduce((a,b)=>a+b,0)/parts.length:null;});
}

// ---- random data ----
const KEYS=["price_to_earnings_ratio_ttm","price_to_sales_ratio_ttm","price_to_book_ratio_ttm","ev_to_ebitda_ttm","free_cash_flow_yield_ttm","dividend_yield_ttm","return_on_equity_ttm","return_on_assets_ttm","gross_profit_margin_ttm","net_profit_margin_ttm","debt_to_equity_ratio_ttm","current_ratio_ttm"];
const NE=[null,0,-5,0.02,0.03,0.05,0.10,0.15,0.20,0.30,0.5,1.0,1.5,2,3,6,8,12,15,22,30,45,100];
const TE=[null,-0.3,-0.1,-0.05,0,0.02,0.05,0.1,0.2];  // trend inputs incl ties + nulls
const pick=a=>a[Math.floor(Math.random()*a.length)];
function randK(){ if(Math.random()<0.06) return {}; const k={}; KEYS.forEach(x=>{ k[x]=Math.random()<0.15?null:pick(NE); }); return k; }
function randRow(t){ return { ticker:"T"+t, smapct:pick(TE), sma50pct:pick(TE), k:randK() }; }
function eq(a,b){ if(a==null&&b==null) return true; if(a==null||b==null) return false; return Math.abs(a-b)<1e-12; }

let groups=4000, fails=0; const ex=[];
for(let g=0; g<groups; g++){
  const n=1+Math.floor(Math.random()*12);
  const rows=Array.from({length:n},(_,i)=>randRow(i));
  const orig=origSectorComp(rows);
  const eng=engine.rankGroup(metrics.prepare(rows,"sector_company"), sectorRS).map(r=>r.composite);
  for(let i=0;i<n;i++){ if(!eq(orig[i],eng[i])){ fails++; if(ex.length<5) ex.push({row:rows[i],orig:orig[i],eng:eng[i]}); } }
}
console.log("sector parity: groups="+groups+" mismatches="+fails);
if(fails){ console.log(JSON.stringify(ex,null,2)); console.error("FAIL"); process.exit(1); }
console.log("PASS — rankGroup + sector_company reproduce openSectorRanking exactly");
