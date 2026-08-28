/* Golden-master parity — FUND / CATEGORY ranking (V2 Phase 2)
 * engine.rankGroup + fund_category ruleset MUST reproduce openCategoryRanking()'s composite
 * exactly, for both the full (ETF) mode and the trend-only (mutual funds) mode.
 *   run:  node tests/ranking/golden_master_fund.js
 */
const path = require("path");
const engine  = require(path.join(__dirname, "..", "..", "src", "ranking", "engine.js"));
const metrics = require(path.join(__dirname, "..", "..", "src", "ranking", "metrics.js"));
const fundRS  = require(path.join(__dirname, "..", "..", "src", "ranking", "rulesets", "fund_category.json"));

// ---- verbatim original helpers ----
function pctRanks(vals){
  const idx=vals.map((v,i)=>[v,i]).filter(p=>p[0]!=null).sort((a,b)=>a[0]-b[0]);
  const out=new Array(vals.length).fill(null), n=idx.length;
  idx.forEach((p,r)=>{ out[p[1]]= n>1? r/(n-1) : 1; });
  return out;
}
const inv=p=>p==null?null:1-p;
const avgD=a=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
function origFundComp(st){ // st: [{trend, m}]
  const ptr=pctRanks(st.map(c=>c.trend));
  const pe=pctRanks(st.map(c=>c.m&&c.m.expense!=null?c.m.expense:null));
  const ppd=pctRanks(st.map(c=>c.m&&c.m.premdisc!=null?c.m.premdisc:null));
  const pt10=pctRanks(st.map(c=>c.m&&c.m.top10!=null?c.m.top10:null));
  const pr1=pctRanks(st.map(c=>c.m&&c.m.ret1y!=null?c.m.ret1y:null));
  const pr3=pctRanks(st.map(c=>c.m&&c.m.ret3m!=null?c.m.ret3m:null));
  const pmdd=pctRanks(st.map(c=>c.m&&c.m.maxdd!=null?c.m.maxdd:null));
  const pvol=pctRanks(st.map(c=>c.m&&c.m.vol60!=null?c.m.vol60:null));
  return st.map((c,i)=>{
    const overview=avgD([inv(pe[i]),inv(ppd[i])]);
    const holdings=inv(pt10[i]);
    const returns=avgD([pr1[i],pr3[i]]);
    const risk=avgD([pmdd[i],inv(pvol[i])]);
    return avgD([overview,holdings,returns,risk,ptr[i]]);
  });
}

// ---- random data ----
const TE=[null,-0.3,-0.1,-0.05,0,0.02,0.05,0.1,0.2];
const ME=[null,0,0.03,0.05,0.2,0.5,1,3,5,10,15,25,40,60,-1,-5,-10,-15];
const pick=a=>a[Math.floor(Math.random()*a.length)];
function randM(){ return { expense:pick(ME), premdisc:pick(ME), top10:pick(ME), ret1y:pick(ME), ret3m:pick(ME), maxdd:pick(ME), vol60:pick(ME) }; }
function eq(a,b){ if(a==null&&b==null) return true; if(a==null||b==null) return false; return Math.abs(a-b)<1e-12; }

function trendOf(row){ return (row.smapct!=null&&row.sma50pct!=null)?0.5*row.smapct+0.5*row.sma50pct:(row.smapct!=null?row.smapct:(row.sma50pct!=null?row.sma50pct:null)); }

let groups=4000, fails=0; const ex=[];
for(let g=0; g<groups; g++){
  const n=1+Math.floor(Math.random()*12);
  const trendOnly = Math.random()<0.25;                 // mutual-funds mode
  const rows=Array.from({length:n},(_,i)=>({ ticker:"F"+i, smapct:pick(TE), sma50pct:pick(TE), m: trendOnly?null:randM() }));
  // original expects st=[{trend, m}]
  const st=rows.map(r=>({trend:trendOf(r), m:r.m}));
  const orig=origFundComp(st);
  const eng=engine.rankGroup(metrics.prepare(rows,"fund_category"), fundRS).map(r=>r.composite);
  for(let i=0;i<n;i++){ if(!eq(orig[i],eng[i])){ fails++; if(ex.length<5) ex.push({row:rows[i],trendOnly,orig:orig[i],eng:eng[i]}); } }
}
console.log("fund parity: groups="+groups+" mismatches="+fails);
if(fails){ console.log(JSON.stringify(ex,null,2)); console.error("FAIL"); process.exit(1); }
console.log("PASS — rankGroup + fund_category reproduce openCategoryRanking exactly (full + trend-only)");
