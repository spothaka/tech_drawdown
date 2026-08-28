/* Unit tests: weighted aggregation + default==equal parity (V2 Phase 3) */
const path=require("path");
const E=require(path.join(__dirname,"..","..","src","ranking","engine.js"));
let fails=0; function ok(c,m){ if(!c){ fails++; console.log("  FAIL: "+m); } }
const eq=(a,b)=> (a==null&&b==null)|| (a!=null&&b!=null&&Math.abs(a-b)<1e-12);

// weightedMeanOfAvailable
ok(eq(E.weightedMeanOfAvailable([{v:1,w:1},{v:0,w:1}]),0.5),"equal weights -> 0.5");
ok(eq(E.weightedMeanOfAvailable([{v:1,w:3},{v:0,w:1}]),0.75),"3:1 weights -> 0.75");
ok(eq(E.weightedMeanOfAvailable([{v:1,w:1},{v:null,w:5}]),1),"null value skipped");
ok(eq(E.weightedMeanOfAvailable([{v:1,w:0},{v:0,w:1}]),0),"zero weight excluded");
ok(E.weightedMeanOfAvailable([{v:null,w:1}])===null,"all null -> null");

// weighted rankGroup: dimension weight changes composite
const rsW={factors:[{id:"a",metric:"a",norm:"percentile"},{id:"b",metric:"b",norm:"percentile"}],
  dimensions:[{id:"A",factors:["a"],weight:3},{id:"B",factors:["b"],weight:1}]};
const items=[{id:1,metrics:{a:10,b:0}},{id:2,metrics:{a:0,b:10}},{id:3,metrics:{a:5,b:5}}];
const g=E.rankGroup(items,rsW);
// a percentiles: [1,0,0.5]; b: [0,1,0.5]; comp=(3*pa+1*pb)/4
ok(eq(g[0].composite,(3*1+0)/4),"weighted dim comp item1");
ok(eq(g[1].composite,(3*0+1)/4),"weighted dim comp item2");
ok(eq(g[2].composite,(3*0.5+0.5)/4),"weighted dim comp item3");

// factor weight 0 excludes it from its dimension
const rs0={factors:[{id:"a",metric:"a",norm:"percentile",weight:0},{id:"b",metric:"b",norm:"percentile",weight:1}],
  dimensions:[{id:"D",factors:["a","b"]}]};
const g0=E.rankGroup(items,rs0);
ok(eq(g0[0].composite,0),"factor weight 0 -> only b counts (item1 b pct=0)");

// default (no weights) == equal-weight over random groups (mini parity)
function pctRanks(vals){const idx=vals.map((v,i)=>[v,i]).filter(p=>p[0]!=null).sort((a,b)=>a[0]-b[0]);const o=new Array(vals.length).fill(null),n=idx.length;idx.forEach((p,r)=>{o[p[1]]=n>1?r/(n-1):1;});return o;}
const avgD=a=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
const rs=require(path.join(__dirname,"..","..","src","ranking","rulesets","fund_category.json"));
const ME=[null,0,0.03,5,10,-1,-5,25,40];const pick=a=>a[Math.floor(Math.random()*a.length)];
let mm=0;
for(let t=0;t<500;t++){const n=1+Math.floor(Math.random()*8);
  const its=Array.from({length:n},(_,i)=>({id:i,metrics:{trend:pick(ME),expense:pick(ME),premdisc:pick(ME),top10:pick(ME),ret1y:pick(ME),ret3m:pick(ME),maxdd:pick(ME),vol60:pick(ME)}}));
  const eng=E.rankGroup(its,rs).map(r=>r.composite);
  // independent equal-weight recompute
  const inv=p=>p==null?null:1-p;
  const P={}; ["trend","expense","premdisc","top10","ret1y","ret3m","maxdd","vol60"].forEach(k=>P[k]=pctRanks(its.map(it=>it.metrics[k])));
  const invSet={expense:1,premdisc:1,top10:1,vol60:1};
  const ref=its.map((it,i)=>{const val=k=>{const p=P[k][i];return invSet[k]?inv(p):p;};
    const overview=avgD([val("expense"),val("premdisc")]),holdings=val("top10"),returns=avgD([val("ret1y"),val("ret3m")]),risk=avgD([val("maxdd"),val("vol60")]),trend=val("trend");
    return avgD([overview,holdings,returns,risk,trend]);});
  for(let i=0;i<n;i++) if(!eq(eng[i],ref[i])) mm++;
}
ok(mm===0,"default weights reproduce equal-weight ("+mm+" mismatches)");
console.log(fails? ("weights: "+fails+" FAILED") : "PASS — weighted aggregation correct; defaults == equal-weight");
process.exit(fails?1:0);
