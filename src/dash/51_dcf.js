// ---------- Discounted cash flow — 3-stage: consensus -> fade -> steady-state terminal ----------
// v4. Validated against external fair-value estimates (Morningstar): MSFT $584 vs $600, NVDA $267 vs $280.
//
// v3 SYSTEMATICALLY UNDERVALUED GROWTH COMPANIES. Two structural bugs, both now fixed:
//   1. NO FADE. It dropped growth from 18% (MSFT) / 36% (NVDA) straight to the 3% terminal rate in
//      year 6. Standard practice (Morningstar, McKinsey) fades growth over 10-15 years.
//   2. TERMINAL CASH FLOW INHERITED THE GROWTH-YEAR DRAG: it did `terminal = lastFCF x (1+g)`, which
//      permanently carries PEAK CAPEX and the huge working-capital investment required to FUND high
//      growth. In steady state that investment collapses (NWC only funds ~3% growth, capex falls to
//      maintenance). The terminal cash flow must be REBUILT, never scaled.
// Also: beta now defaults to the ADJUSTED (Blume) beta — 0.67*raw + 0.33 — not the raw trailing beta
// (NVDA raw 2.21 -> 14.6% WACC was punitive and is not what practitioners use).
//
// Data (precomputed by scripts/build_dcf.py -> DATA.dcf): forward revenue/EBIT/EBITDA = ANALYST
// CONSENSUS; D&A/capex/tax/net debt = FILED STATEMENTS. netDebt = totalDebt - cash & ST investments
// (the vendor's own netDebt field ignores ST investments: NVDA is $51B NET CASH, not $0.8B net debt).
//
// v4.3 — CONSENSUS-EBIT SANITY GATE. FMP's GAAP ebitAvg is, for some names (AMZN, AMD), understated so
// badly it falls BELOW consensus net income — impossible, and it produced absurd fair values (AMZN $78,
// AMD $104 vs analyst targets $309/$513). build_dcf.py now rebuilds EBIT from the reliable net-income
// line (EBIT ≈ net income ÷ (1-tax)) when the aggregate ebit/ni ratio is < 0.85, flagging it via
// b.ebitRecon. The gate is aggregate so NVDA's mild interest-income wobble (ratio ~0.98) is NOT tripped;
// clean names are untouched. AMZN -> $299 (~anchor), AMD -> $343 (honestly still below a priced-for-
// perfection target). See TASKS.md (Baseline v1.0 data-provider invariants).
//
// v4.4 — review hardening: gate uses matched subsets + sum_ni>0 + uniform-basis truncation (never mixed
// rows); est rows retain 'ni' for offline re-audit; b.asOf marks the consensus snapshot date (shown
// below the derivation — the estimates endpoints can be plan-gated for long stretches, so the base can
// be older than the daily-refreshed price); mgnT band raised to 55 (NVDA's consensus margin is 48%).
var DCF_BUILD='4.4';
var DCF_ENABLED=true;
try{ window.__TDD_DCF_BUILD=DCF_BUILD; }catch(e){}
var _dcfState={};
var _dcfSeg={};      // per-ticker segment overrides: {name:{g:null|%, m:null|%}}  null = follow the company
var _dcfTab={};      // 'total' | 'segment'

function _dcfBlume(raw){ return 0.67*raw + 0.33; }        // standard adjusted beta
function _dcfNewState(b){
  var lastDnaPct=b.est.length?(b.est[b.est.length-1].dna/b.est[b.est.length-1].rev):0.08;
  return {capex:(b.capexPct0*100), maint:(lastDnaPct*100), fade:10,
          beta:+_dcfBlume(b.beta).toFixed(2), rf:4.2, erp:4.7, tg:3, hair:100, mgnT:null};
}
async function dcfBase(ticker){ return (DATA.dcf||{})[ticker]||null; }
function dcfRetry(ticker){ dcfFill(ticker); }
function _dcfWacc(b,st){ var ce=st.rf+st.beta*st.erp; return {ce:ce, wacc:(b.wE*ce + b.wD*b.kdAT)}; }

function dcfModelW(b,st,waccPct,capexPct){
  var w=waccPct/100, t=st.tg/100, hair=st.hair/100, maint=st.maint/100;
  if(!(w>t+0.0005)) return {err:'WACC must exceed terminal growth'};
  var est=b.est||[];
  if(est.length<2) return {err:'not enough consensus years'};
  var prev=b.rev0, pv=0, rows=[], yr=0, rev=0, ebit=0, dna=0, neg=false;

  // ---- STAGE 1: explicit analyst consensus ----
  for(var i=0;i<est.length;i++){
    var e=est[i]; yr=e.fy-b.baseYear;
    if(yr<1) continue;
    rev=e.rev*hair; ebit=e.ebit*hair; dna=e.dna*hair;
    var capex=capexPct*rev, dnwc=b.nwcPct*(rev-prev);
    var taxAmt=ebit*b.taxEff, fcf=(ebit-taxAmt)+dna-capex-dnwc;
    if(fcf<0) neg=true;
    var dpv=fcf/Math.pow(1+w,yr);
    pv+=dpv;
    rows.push({fy:e.fy,t:yr,rev:rev,ebit:ebit,tax:taxAmt,dna:dna,capex:capex,dnwc:dnwc,fcf:fcf,pv:dpv,nA:e.nA,stage:1});
    prev=rev;
  }
  if(!rows.length) return {err:'no forward years to discount'};

  // ---- STAGE 2: fade. Growth decays to terminal; capex converges to maintenance. ----
  var prevRev=est[est.length-2].rev*hair;
  var gLast=(rev/prevRev)-1;
  var mgn0=ebit/rev, dnaPct=dna/rev;
  var mgnT=(st.mgnT!=null&&isFinite(st.mgnT))?(st.mgnT/100):mgn0;   // normalized steady-state EBIT margin; default follows consensus
  var fadeN=Math.max(0,Math.round(st.fade)), fadePv=0, fadeFcf=0;
  var cp=capexPct;
  for(var k=1;k<=fadeN;k++){
    var g=gLast+(t-gLast)*(k/fadeN);
    cp=capexPct+(maint-capexPct)*(k/fadeN);
    var nrev=rev*(1+g);
    var mg=mgn0+(mgnT-mgn0)*(k/fadeN); var nebit=nrev*mg, ndna=nrev*dnaPct;
    var ncapex=cp*nrev, ndnwc=b.nwcPct*(nrev-rev);
    var nfcf=nebit*(1-b.taxEff)+ndna-ncapex-ndnwc;
    if(nfcf<0) neg=true;
    yr+=1;
    var npv=nfcf/Math.pow(1+w,yr);
    pv+=npv; fadePv+=npv; fadeFcf=nfcf;
    rev=nrev; ebit=nebit; dna=ndna;
  }

  // ---- STAGE 3: steady state. REBUILD the cash flow — never scale the last growth year. ----
  var revT=rev*(1+t), ebitT=revT*mgnT, dnaT=revT*dnaPct;
  var capexT=maint*revT, dnwcT=b.nwcPct*(revT-rev);
  var fT=ebitT*(1-b.taxEff)+dnaT-capexT-dnwcT;
  if(!(fT>0)) return {err:'terminal cash flow is not positive'};
  var tv=fT/(w-t), pvtv=tv/Math.pow(1+w,yr), ev=pv+pvtv,
      eq=ev-b.netDebt, fv=eq/b.shares;
  if(!isFinite(fv)||fv<=0) return {err:'model produces a non-positive equity value'};
  return {fv:fv, wacc:waccPct, capexPct:capexPct, rows:rows, pv:pv, fadePv:fadePv, fadeN:fadeN,
          fadeFcf:fadeFcf, gLast:gLast, mgn:mgnT, mgn0:mgn0, dnaPct:dnaPct, tv:tv, pvtv:pvtv, fT:fT, termYr:yr,
          ev:ev, eq:eq, termShare:pvtv/ev, termMult:1/(w-t), negFcf:neg,
          last:rows[rows.length-1]};
}
function dcfModel(b,st){
  var W=_dcfWacc(b,st);
  var m=dcfModelW(b,st,W.wacc,st.capex/100);
  if(m&&!m.err) m.ce=W.ce;
  return m;
}
function dcfImpliedWacc(b,st){
  var lo=st.tg+0.51, hi=40;
  for(var i=0;i<80;i++){
    var mid=(lo+hi)/2, m=dcfModelW(b,st,mid,st.capex/100);
    if(!m||m.err){ hi=mid; continue; }
    if(m.fv>b.price) lo=mid; else hi=mid;
  }
  var w=(lo+hi)/2;
  return (w>=39.5||w<=st.tg+0.6)?null:w;
}

// ===== Loop 1 · generalized reverse-solve — "what would you have to believe?" =====
// ONE bracketed, monotone solver inverts the 3-stage model for ANY single assumption to hit a target
// (default: today's price), holding the rest of the state fixed. Pure client math on the embedded
// base — no connector, no new DATA key, no quota. Robustness: each lever has a KNOWN monotonic
// direction; if the target isn't bracketed within the plausible band we return {noSolution} with a
// reason (the market implies a value outside the range) rather than a bogus root. Never unbounded
// (<=60 iterations + relative-tolerance gate). "Outside band" is SIGNAL — a knob we refuse to force.
var DCF_BANDS={wacc:[4,15], tg:[1.5,4], fade:[4,25], capex:[1,55], hair:[40,130], mgnT:[2,55]};
var _DCF_INC={wacc:false, capex:false, tg:true, fade:true, hair:true, mgnT:true};   // does FV RISE with the lever?

function _dcfEvalFor(param,b,st){
  var W=_dcfWacc(b,st);
  return function(x){
    var m;
    if(param==='wacc')        m=dcfModelW(b,st,x,st.capex/100);
    else if(param==='capex')  m=dcfModelW(b,st,W.wacc,x/100);
    else { var s2=Object.assign({},st); s2[param]=x; m=dcfModelW(b,s2,W.wacc,st.capex/100); }
    return (m&&!m.err&&isFinite(m.fv)&&m.fv>0)?m.fv:null;
  };
}
function _dcfSolve(f,target,lo,hi,inc){
  var flo=f(lo), fhi=f(hi), i;
  for(i=0;i<24&&flo==null;i++){ lo+=(hi-lo)*0.05; flo=f(lo); }   // pull past any non-evaluating edge
  for(i=0;i<24&&fhi==null;i++){ hi-=(hi-lo)*0.05; fhi=f(hi); }
  if(flo==null||fhi==null) return {noSolution:true, reason:'the model does not evaluate across this band'};
  if(target<Math.min(flo,fhi) || target>Math.max(flo,fhi))
    return {noSolution:true, reason:'the price sits outside the fair-value range this band can produce'};
  for(i=0;i<60;i++){
    var mid=(lo+hi)/2, fm=f(mid);
    if(fm==null){ hi=mid; continue; }
    if(Math.abs(fm-target)/Math.max(1,Math.abs(target))<1e-3) return {value:mid};
    var higher = inc ? (fm<target) : (fm>target);   // need a bigger x to move FV toward target?
    if(higher) lo=mid; else hi=mid;
  }
  return {value:(lo+hi)/2};
}
// Solve for the single `param` that makes fair value == target (default price). Returns
// {param, value, inBand, band} or {param, noSolution, reason, band}.
function dcfImply(b,st,param,target){
  if(target==null) target=b.price;
  var band=DCF_BANDS[param]||[0,100];
  var lo=(param==='tg')?Math.max(band[0],0.1):band[0], hi=band[1];
  var r=_dcfSolve(_dcfEvalFor(param,b,st),target,lo,hi,_DCF_INC[param]);
  if(r.noSolution) return {param:param, noSolution:true, reason:r.reason, band:band};
  return {param:param, value:r.value, inBand:(r.value>=band[0]-1e-9 && r.value<=band[1]+1e-9), band:band};
}

// ===== Loop 2 · benchmark-calibration — reconcile the model to an EXTERNAL anchor, or flag =====
// Given b.anchor {value, source, asOf}, find which single plausible assumption (reused via dcfImply)
// would make fair value equal the anchor. Only IN-BAND solutions count. The "best" candidate is the
// one that moves LEAST from its current value (band-normalized) — the least-violent reconciliation.
// If NOTHING reconciles within the bands, we FLAG it: the disagreement is signal (the anchor or the
// inputs are suspect), never something to force by pushing an assumption past its plausible range.
function dcfCalibrate(b,st){
  var a=b.anchor;
  if(!a || !(a.value>0)) return null;
  var m=dcfModel(b,st), modelFv=(m&&!m.err)?m.fv:null;
  if(modelFv==null) return {anchor:a, modelFv:null, gapPct:null, candidates:[], best:null, reconcilable:false, reconciled:false};
  var gapPct=(modelFv/a.value-1)*100;
  var consMgn=_dcfConsMgn(b);
  var pctFmt=function(v){return v.toFixed(1)+'%';}, yrFmt=function(v){return Math.round(v)+'y';};
  var levers=[
    {p:'mgnT', label:'Steady-state margin', cur:(st.mgnT!=null?st.mgnT:consMgn), fmt:pctFmt},
    {p:'tg',   label:'Terminal growth',     cur:st.tg,   fmt:pctFmt},
    {p:'capex',label:'Capex intensity',     cur:st.capex,fmt:pctFmt},
    {p:'fade', label:'Fade length',         cur:st.fade, fmt:yrFmt},
    {p:'hair', label:'Consensus retained',  cur:st.hair, fmt:function(v){return Math.round(v)+'%';}}
  ];
  var cands=[];
  levers.forEach(function(L){
    var r=dcfImply(b,st,L.p,a.value);
    if(r.noSolution || !r.inBand) return;
    var w=(r.band[1]-r.band[0])||1;
    cands.push({param:L.p, label:L.label, value:r.value, cur:L.cur, fmt:L.fmt, move:Math.abs(r.value-L.cur)/w});
  });
  cands.sort(function(x,y){return x.move-y.move;});
  return {anchor:a, modelFv:modelFv, gapPct:gapPct, candidates:cands, best:cands[0]||null,
          reconcilable:cands.length>0, reconciled:Math.abs(gapPct)<2};
}

// ===== Loop 4 · probabilistic DCF — a fair-value RANGE, not a false-precision point =====
// Seeded (reproducible) sampling of the assumption distributions around the CURRENT state, run
// through the same model, to a distribution of fair value. This is about UNCERTAINTY, not accuracy —
// it does not move the centre (that is Loops 1/2's job); it shows how wide the answer is and the
// probability the stock is undervalued at today's price / the anchor.
function _dcfRng(seed){ var a=seed>>>0; return function(){ a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function _dcfQ(sorted,p){ if(!sorted.length) return 0; var i=(sorted.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo); }
function _clamp(v,a,b){ return v<a?a:(v>b?b:v); }

function dcfMonteCarlo(b,st,opts){
  opts=opts||{}; var N=opts.n||1500, rnd=_dcfRng(opts.seed||42);
  function gauss(){ var u=0,v=0; while(u===0)u=rnd(); while(v===0)v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185307179586*v); }
  var baseW=_dcfWacc(b,st).wacc, consMgn=_dcfConsMgn(b);
  var mgn0=(st.mgnT!=null?st.mgnT:consMgn);
  var out=[];
  for(var i=0;i<N;i++){
    // 1-sigma spreads reflect genuine assumption uncertainty; clamped to the plausible bands
    var wacc=_clamp(baseW + gauss()*0.9, DCF_BANDS.wacc[0], DCF_BANDS.wacc[1]);
    var s2=Object.assign({},st);
    s2.tg   =_clamp(st.tg   + gauss()*0.4, DCF_BANDS.tg[0],   DCF_BANDS.tg[1]);
    s2.fade =_clamp(Math.round(st.fade + gauss()*2.5), DCF_BANDS.fade[0], DCF_BANDS.fade[1]);
    s2.mgnT =_clamp(mgn0    + gauss()*2.0, DCF_BANDS.mgnT[0], DCF_BANDS.mgnT[1]);
    var capex=_clamp(st.capex + gauss()*2.0, DCF_BANDS.capex[0], DCF_BANDS.capex[1]);
    var m=dcfModelW(b,s2,wacc,capex/100);
    if(m&&!m.err&&isFinite(m.fv)&&m.fv>0) out.push(m.fv);
  }
  if(out.length<50) return null;
  out.sort(function(x,y){return x-y;});
  var mean=out.reduce(function(a,c){return a+c;},0)/out.length;
  function pAbove(x){ if(x==null) return null; var c=0; for(var j=0;j<out.length;j++) if(out[j]>=x)c++; return c/out.length; }
  return {n:out.length, p10:_dcfQ(out,0.10), p25:_dcfQ(out,0.25), p50:_dcfQ(out,0.50), p75:_dcfQ(out,0.75), p90:_dcfQ(out,0.90),
          mean:mean, pAbovePrice:pAbove(b.price), pAboveAnchor:pAbove(b.anchor&&b.anchor.value)};
}





// ================= SUM-OF-THE-PARTS (Trefis-style segment price analysis) =================
// Each segment runs through the SAME 3-stage engine. Defaults: every segment inherits the company's
// consensus revenue PATH (scaled by its revenue share) and the company's EBIT margin — so at
// defaults the sum of the segments reconciles to the consolidated DCF *exactly, by construction*.
// That is the built-in regression check. Segment EBIT margins are NOT disclosed by any company:
// they are the user's assumption, and the weighted mix is tied back to reported EBIT.
function _dcfSegInit(b,ticker){
  if(_dcfSeg[ticker]) return _dcfSeg[ticker];
  var o={};
  Object.keys(b.segments||{}).forEach(function(k){ o[k]={g:null,m:null}; });   // null = follow company
  _dcfSeg[ticker]=o; return o;
}
function _dcfSegShares(b){
  var segs=b.segments||{}, tot=0, out={};
  Object.keys(segs).forEach(function(k){ tot+=segs[k]; });
  Object.keys(segs).forEach(function(k){ out[k]=tot?segs[k]/tot:0; });
  return out;
}
// EV of one segment. g/m null => follow the company's consensus path & margin.
function _dcfSegEV(b,st,waccPct,share,g,m){
  var w=waccPct/100, t=st.tg/100, hair=st.hair/100, maint=st.maint/100, capexPct=st.capex/100;
  var est=b.est||[];
  var rev0=b.rev0*share, prev=rev0, pv=0, yr=0, rev=0, ebit=0, dna=0;
  for(var i=0;i<est.length;i++){
    var e=est[i]; yr=e.fy-b.baseYear;
    if(yr<1) continue;
    var cmgn=e.ebit/e.rev;                       // company margin that year
    if(g==null){ rev=e.rev*share*hair; }         // follow consensus path
    else { rev=(i===0?rev0:rev)*(1+g/100); if(i===0) rev=rev0*(1+g/100); }
    var mg=(m==null)?cmgn:(m/100);
    ebit=rev*mg; dna=rev*(e.dna/e.rev);
    var capex=capexPct*rev, dnwc=b.nwcPct*(rev-prev);
    var fcf=ebit*(1-b.taxEff)+dna-capex-dnwc;
    pv+=fcf/Math.pow(1+w,yr);
    prev=rev;
  }
  if(!rev) return 0;
  var lastE=est[est.length-1], prevE=est[est.length-2];
  var gLast=(g==null)?((lastE.rev/prevE.rev)-1):(g/100);
  var mgn=ebit/rev, dnaPct=dna/rev;
  var fadeN=Math.max(0,Math.round(st.fade)), cp=capexPct;
  for(var k=1;k<=fadeN;k++){
    var gg=gLast+(t-gLast)*(k/fadeN);
    cp=capexPct+(maint-capexPct)*(k/fadeN);
    var nrev=rev*(1+gg);
    var f2=(nrev*mgn)*(1-b.taxEff)+nrev*dnaPct-cp*nrev-b.nwcPct*(nrev-rev);
    yr+=1; pv+=f2/Math.pow(1+w,yr); rev=nrev;
  }
  var revT=rev*(1+t);
  var fT=(revT*mgn)*(1-b.taxEff)+revT*dnaPct-maint*revT-b.nwcPct*(revT-rev);
  if(!(fT>0)) return pv;                          // no terminal credit if it can't sustain itself
  return pv + (fT/(w-t))/Math.pow(1+w,yr);
}
function dcfSegModel(b,st,ticker){
  if(!b.segments || b.segOk===false) return null;
  var ov=_dcfSegInit(b,ticker), shares=_dcfSegShares(b);
  var W=_dcfWacc(b,st), rows=[], totEV=0;
  Object.keys(b.segments).forEach(function(k){
    var o=ov[k]||{g:null,m:null};
    var ev=Math.max(0,_dcfSegEV(b,st,W.wacc,shares[k],o.g,o.m));
    totEV+=ev;
    rows.push({name:k, rev0:b.segments[k], share:shares[k], g:o.g, m:o.m, ev:ev});
  });
  var cashPS=(-b.netDebt)/b.shares;               // net debt negative => net cash (a positive contribution)
  rows.forEach(function(r){ r.ps=r.ev/b.shares; });
  var fv=(totEV-b.netDebt)/b.shares;
  var totVal=rows.reduce(function(a,r){return a+r.ps;},0)+cashPS;
  rows.forEach(function(r){ r.pct=totVal?(r.ps/totVal*100):0; });
  // margin tie-out: does the user's weighted segment margin still equal the company's actual margin?
  var lastE=b.est[b.est.length-1], coMgn=(lastE.ebit/lastE.rev)*100;
  var wm=0;
  rows.forEach(function(r){ wm += ((r.m==null)?coMgn:r.m) * r.share; });
  return {rows:rows, ev:totEV, fv:fv, cashPS:cashPS, totVal:totVal, coMgn:coMgn, wMgn:wm, wacc:W.wacc};
}

function _dcfB(v){ var a=Math.abs(v); return (a>=1e9)?('$'+(v/1e9).toFixed(1)+'B'):('$'+(v/1e6).toFixed(0)+'M'); }
function _dcfHost(){
  var el=document.getElementById('dcfStrip');
  if(el) return el;
  if(typeof mBody==='undefined'||!mBody) return null;
  var d=document.createElement('div'); d.id='dcfStrip';
  if(mBody.firstChild) mBody.insertBefore(d,mBody.firstChild); else mBody.appendChild(d);
  return document.getElementById('dcfStrip')||d;
}
async function dcfFill(ticker){
  if(!DCF_ENABLED){ var h=document.getElementById('dcfStrip'); if(h) h.innerHTML=''; return; }
  var el=_dcfHost(); if(!el) return;
  var b=await dcfBase(ticker);
  var cur=_dcfHost(); if(!cur) return;
  if(!b){
    // Not a bug: DCF bases are PRECOMPUTED (the artifact cannot call the valuation feed live).
    // Say exactly what is covered and when the rest arrives, rather than looking broken.
    var have=Object.keys(DATA.dcf||{}).sort();
    cur.innerHTML='<div class="note" style="border-left-color:#6b7280">'
      +'<b>No valuation for '+esc(ticker)+' yet.</b> Fair values are precomputed nightly for held names — '
      +(have.length?('currently covered: <b>'+have.map(esc).join(', ')+'</b>.'):'none are covered yet.')
      +' The 6am run adds the rest. <span style="opacity:.6">b'+DCF_BUILD+'</span></div>';
    return;
  }
  if(!_dcfState[ticker]) _dcfState[ticker]=_dcfNewState(b);
  var st=_dcfState[ticker], m=dcfModel(b,st);
  if(!m||m.err){ cur.innerHTML='<div class="note">DCF isn’t meaningful for '+esc(ticker)+' — '+esc(m&&m.err||'insufficient data')+'.</div>'; return; }
  var up=(m.fv/b.price-1)*100, good=up>=0, col=good?'#16a34a':'#dc2626';
  cur.innerHTML='<div style="border:1px solid var(--line);border-left:5px solid '+col+';border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px">'
    +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13.5px"><b>DCF fair value '+fmtUsd(m.fv)+'</b> <span style="color:var(--muted)">vs price '+fmtUsd(b.price)+'</span></div>'
      +'<div style="font-size:12px;color:'+col+'">'+(good?('Trading '+Math.abs(up).toFixed(0)+'% below the model'):('Trading '+((b.price/m.fv-1)*100).toFixed(0)+'% above the model'))
      +' <span style="color:var(--muted)">· consensus + '+m.fadeN+'-yr fade · WACC '+m.wacc.toFixed(1)+'% · b'+DCF_BUILD+'</span></div>'
    +'</div>'
    +'<a class="dcfOpen" data-tk="'+esc(ticker)+'" style="color:var(--accent);cursor:pointer;font-size:12.5px;white-space:nowrap">Model it →</a></div>';
}
function _dcfSlider(id,label,min,max,step,val,dec,suffix){
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">'
    +'<label style="font-size:12px;color:var(--muted);width:132px">'+label+'</label>'
    +'<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" style="flex:1">'
    +'<span id="'+id+'Out" style="font-size:12.5px;font-weight:700;width:52px;text-align:right">'+(+val).toFixed(dec)+(suffix===undefined?'%':suffix)+'</span></div>';
}
var _SEGC=['#1D9E75','#7C3AED','#378ADD','#BA7517','#888780','#D4537E','#0F6E56','#534AB7','#993C1D','#5F5E5A'];
function _dcfTabs(b,ticker){
  var t=_dcfTab[ticker]||'total';
  var seg=(b.segments && Object.keys(b.segments).length>0);   // show the tab whenever segments were FETCHED (segments is a {name:rev} MAP) — even if rejected (segOk:false), so the refusal + reason is visible rather than the tab silently vanishing
  function pill(v,lab,on){ return '<span class="dcfTab" data-tk="'+esc(ticker)+'" data-v="'+v+'" style="cursor:pointer;font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid var(--line);margin-right:6px;'
    +(on?'background:#eef2ff;color:var(--accent);font-weight:700':'color:var(--muted)')+'">'+lab+'</span>'; }
  return '<div style="margin-bottom:10px">'+pill('total','Consolidated',t==='total')
    +(seg?pill('segment','By segment',t==='segment'):'')+'</div>';
}
function _dcfConsMgn(b){ var e=(b.est||[]); if(!e.length) return 10; var l=e[e.length-1]; return (l.rev? (l.ebit/l.rev*100):10); }
function _dcfBody(b,ticker){
  var st=_dcfState[ticker];
  var _cm=_dcfConsMgn(b), _mgnVal=(st.mgnT!=null?st.mgnT:_cm);
  if((_dcfTab[ticker]||'total')==='segment') return _dcfTabs(b,ticker)+'<div id="dcfOut"></div>'
    +'<div class="foot" style="margin-top:12px">Segment revenue is from the filings. <b>Segment EBIT margins are not disclosed by any company</b> — they default to the company margin and are yours to set. Trefis-<i>style</i> sum-of-the-parts, not Trefis\u2019s proprietary forecasts. '
    +'<a class="dcfBack" data-tk="'+esc(ticker)+'" style="color:var(--accent);cursor:pointer">\u2190 back to fundamentals</a> \u00b7 <b>Not investment advice</b>.</div>';
  return _dcfTabs(b,ticker)
    +_dcfSlider('dcfFade','Fade period (yrs)',0,20,1,st.fade,0,'')
    +_dcfSlider('dcfCapex','Capex % of revenue',0,35,0.5,st.capex,1)
    +_dcfSlider('dcfMaint','Maintenance capex',0,20,0.5,st.maint,1)
    +_dcfSlider('dcfTg','Terminal growth',0,5,0.1,st.tg,1)
    +_dcfSlider('dcfMgn','Steady-state margin',2,55,0.5,_mgnVal,1)
    +_dcfSlider('dcfBeta','Beta (adjusted)',0.4,2.6,0.01,st.beta,2,'')
    +_dcfSlider('dcfRf','Risk-free rate',2,7,0.1,st.rf,1)
    +_dcfSlider('dcfErp','Equity risk prem.',3,8,0.1,st.erp,1)
    +_dcfSlider('dcfHair','Consensus haircut',50,110,1,st.hair,0)
    +'<div id="dcfOut" style="margin-top:12px"></div>'
    +'<div class="foot" style="margin-top:12px">3-stage: <b>analyst consensus</b> → <b>fade</b> (growth decays to terminal, capex converges to maintenance) → <b>steady-state terminal</b>. D&amp;A, capex, tax and net debt from filed statements. '
    +'<a class="dcfBack" data-tk="'+esc(ticker)+'" style="color:var(--accent);cursor:pointer">← back to fundamentals</a> · Rules-based — <b>not investment advice</b>.</div>';
}
function _dcfStages(b,st,m){
  var h='<div class="foot" style="margin:0 0 6px"><b>The three stages</b></div>'
   +'<table class="mdt" style="width:100%;font-size:11.5px">'
   +'<tr><th style="text-align:left">Stage</th><th>Years</th><th>Growth</th><th>Capex % rev</th><th>PV</th></tr>'
   +'<tr><td style="text-align:left">1 · Analyst consensus</td><td>'+m.rows.length+'</td><td>to '+(m.gLast*100).toFixed(1)+'%</td><td>'+st.capex.toFixed(1)+'%</td><td>'+_dcfB(m.pv-m.fadePv)+'</td></tr>'
   +'<tr><td style="text-align:left">2 · Fade</td><td>'+m.fadeN+'</td><td>'+(m.gLast*100).toFixed(1)+'% → '+st.tg.toFixed(1)+'%</td><td>'+st.capex.toFixed(1)+'% → '+st.maint.toFixed(1)+'%</td><td>'+_dcfB(m.fadePv)+'</td></tr>'
   +'<tr><td style="text-align:left">3 · Terminal (steady state)</td><td>∞</td><td>'+st.tg.toFixed(1)+'%</td><td>'+st.maint.toFixed(1)+'%</td><td>'+_dcfB(m.pvtv)+'</td></tr>'
   +'</table>'
   +'<div class="foot">The terminal cash flow is <b>rebuilt</b> at steady state (capex = maintenance, working capital funds only '+st.tg.toFixed(1)+'% growth) — not scaled from the final growth year, which would carry peak capex and growth-year working capital into perpetuity forever.</div>';
  return h;
}
function _dcfConsensus(b,st,m){
  var h='<div class="foot" style="margin:0 0 6px"><b>Analyst consensus</b> — stage 1</div>'
   +'<table class="mdt" style="width:100%;font-size:11.5px"><tr><th style="text-align:left">FY</th><th>Revenue</th><th>EBIT</th><th>Margin</th><th>FCF</th><th>Analysts</th></tr>';
  var thin=false;
  m.rows.forEach(function(r){
    if(r.nA<10) thin=true;
    h+='<tr><td style="text-align:left">'+r.fy+'</td><td>'+_dcfB(r.rev)+'</td><td>'+_dcfB(r.ebit)+'</td><td>'+(r.ebit/r.rev*100).toFixed(1)+'%</td><td>'+_dcfB(r.fcf)+'</td>'
      +'<td'+(r.nA<10?' style="color:#b45309;font-weight:700"':'')+'>'+(r.nA||'—')+'</td></tr>';
  });
  h+='</table>';
  var l=m.rows[m.rows.length-1];
  h+='<div class="foot">Implied revenue CAGR from FY'+b.baseYear+': <b>'+(100*(Math.pow(l.rev/b.rev0,1/l.t)-1)).toFixed(1)+'%</b>'
    +(st.hair!==100?(' <span style="color:#b45309">(haircut '+st.hair+'%)</span>'):'')+'</div>';
  if(thin) h+='<div class="foot">⚠ Fewer than 10 analysts cover the later years — use the <b>consensus haircut</b> to stress-test them.</div>';
  return h;
}
function _dcfDeriv(b,m,st){
  var rows=[
    ['PV · stage 1 (consensus)', _dcfB(m.pv-m.fadePv)],
    ['PV · stage 2 (fade, '+m.fadeN+' yrs)', _dcfB(m.fadePv)],
    ['Terminal cash flow (rebuilt, steady state)', _dcfB(m.fT)],
    ['Terminal value', _dcfB(m.tv)+' <span style="color:var(--muted)">('+m.termMult.toFixed(1)+'× FCF)</span>'],
    ['PV · stage 3 (terminal)', _dcfB(m.pvtv)+' <span style="color:var(--muted)">('+(m.termShare*100).toFixed(0)+'% of EV)</span>'],
    ['<b>Enterprise value</b>','<b>'+_dcfB(m.ev)+'</b>'],
    [(b.netDebt<0?'+ Net cash':'− Net debt'), _dcfB(-b.netDebt)],
    ['<b>= Equity value</b>','<b>'+_dcfB(m.eq)+'</b>'],
    ['÷ Diluted shares',(b.shares/1e9).toFixed(3)+'B'],
    ['<b>= Fair value per share</b>','<b style="font-size:13px">'+fmtUsd(m.fv)+'</b>']
  ];
  var h='<div class="foot" style="margin:0 0 6px"><b>How this number is built</b></div>'
   +'<table class="mdt" style="width:100%;font-size:12px">'
   +rows.map(function(r){return '<tr><td style="text-align:left">'+r[0]+'</td><td style="text-align:right">'+r[1]+'</td></tr>';}).join('')+'</table>';
  var f='';
  if(m.termShare>0.75) f+='<div class="foot" style="margin-top:6px">⚠ <b>'+(m.termShare*100).toFixed(0)+'% of value is terminal</b> — long-horizon assumptions dominate.</div>';
  if(b.taxClamped) f+='<div class="foot">⚠ The filed effective tax rate was negative — clamped to 21%.</div>';
  if(b.netDebtFmp!=null && Math.abs(b.netDebtFmp-b.netDebt)>1e9)
    f+='<div class="foot">✔ Net debt corrected to <b>'+_dcfB(b.netDebt)+'</b> (total debt '+_dcfB(b.totalDebt)+' − cash &amp; ST investments '+_dcfB(b.cash)+'); the vendor field said '+_dcfB(b.netDebtFmp)+'.</div>';
  if(b.ebitRecon)
    f+='<div class="foot">✔ Operating income (EBIT) <b>rebuilt from net income</b>. The consensus feed reported EBIT at only <b>'+Math.round((b.ebitReconRatio||0)*100)+'%</b> of consensus net income — impossible, since operating income sits above the after-tax bottom line — so each year’s EBIT is reconstructed as net income ÷ (1 − tax).</div>';
  if(b.asOf)
    f+='<div class="foot">Consensus snapshot as of <b>'+esc(b.asOf)+'</b> — the price refreshes daily, the estimate base only when the feed allows.</div>';
  f+='<div class="foot">Beta defaults to the <b>adjusted (Blume)</b> beta '+_dcfBlume(b.beta).toFixed(2)+' — raw trailing beta is '+b.beta.toFixed(2)+'.</div>';
  return h+f;
}

function _dcfSegRender(b,ticker){
  var st=_dcfState[ticker], out=document.getElementById('dcfOut');
  if(!out) return;
  var sm=dcfSegModel(b,st,ticker);
  if(!sm){
    out.innerHTML='<div class="note" style="border-left-color:#b45309">Segment analysis unavailable for '+esc(ticker)
      +(b.segOk===false?(' — the filed segment revenue does not reconcile to total revenue (off by '+(b.segErr*100).toFixed(0)+'%; the feed double-counts overlapping lines), so a sum-of-the-parts would be built on broken data.'):' — no segment data.')
      +'</div>';
    return;
  }
  var tot=dcfModel(b,st);                       // consolidated, for the reconciliation check
  var diff=(tot&&!tot.err)?((sm.fv/tot.fv-1)*100):null;
  var up=(sm.fv/b.price-1)*100, good=up>=0, col=good?'#16a34a':'#dc2626';
  var hdr='<div style="display:flex;align-items:baseline;gap:14px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:12px">'
    +'<div><div class="foot" style="margin:0">Sum-of-the-parts value</div><div style="font-size:24px;font-weight:800">'+fmtUsd(sm.fv)+'</div></div>'
    +'<div style="border-left:1px solid var(--line);padding-left:14px"><div class="foot" style="margin:0">Price</div><div style="font-size:17px;font-weight:700">'+fmtUsd(b.price)+'</div></div>'
    +'<div style="margin-left:auto;text-align:right"><div class="foot" style="margin:0">Reconciles to consolidated DCF</div>'
    +'<div style="font-size:13px;font-weight:700">'+(tot&&!tot.err?fmtUsd(tot.fv):'—')
    +(diff!=null?(' <span style="color:'+(Math.abs(diff)<2?'#16a34a':'#b45309')+'">'+(diff>=0?'+':'')+diff.toFixed(1)+'%</span>'):'')+'</div></div></div>';
  // contribution bar
  var bar='<div class="foot" style="margin:0 0 6px">Where the share price comes from</div>'
    +'<div style="display:flex;height:30px;border-radius:6px;overflow:hidden;margin-bottom:6px">';
  var leg='<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;font-size:11.5px;color:var(--muted)">';
  sm.rows.forEach(function(r,i){
    var c=_SEGC[i%_SEGC.length];
    bar+='<div style="width:'+Math.max(0,r.pct)+'%;background:'+c+'"></div>';
    leg+='<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:'+c+';margin-right:5px"></span>'+esc(r.name)+' '+r.pct.toFixed(0)+'%</span>';
  });
  var cashPct=sm.totVal?(sm.cashPS/sm.totVal*100):0;
  if(cashPct>0){
    bar+='<div style="width:'+cashPct+'%;background:#97C459"></div>';
    leg+='<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#97C459;margin-right:5px"></span>Net cash '+cashPct.toFixed(0)+'%</span>';
  }
  bar+='</div>'; leg+='</div>';
  // table with per-segment sliders
  var tbl='<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">'
    +'<tr style="font-size:11px;color:var(--muted)"><th style="text-align:left;padding:5px 4px;width:22%">Segment</th>'
    +'<th style="text-align:right;padding:5px 4px;width:12%">Revenue</th>'
    +'<th style="padding:5px 4px;width:22%">Growth</th><th style="padding:5px 4px;width:22%">EBIT margin</th>'
    +'<th style="text-align:right;padding:5px 4px;width:11%">$/share</th><th style="text-align:right;padding:5px 4px;width:11%">% of value</th></tr>';
  sm.rows.forEach(function(r,i){
    var c=_SEGC[i%_SEGC.length];
    var gShown=(r.g==null)?Math.round(b.est[b.est.length-1].rev/b.est[b.est.length-2].rev*100-100):r.g;
    var mShown=(r.m==null)?sm.coMgn:r.m;
    tbl+='<tr style="border-top:1px solid var(--line)">'
      +'<td style="padding:6px 4px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+c+';margin-right:6px"></span>'+esc(r.name)+'</td>'
      +'<td style="text-align:right;padding:6px 4px;color:var(--muted)">'+_dcfB(r.rev0)+'</td>'
      +'<td style="padding:6px 4px"><input class="segIn" type="range" min="-10" max="70" step="1" value="'+gShown+'" data-tk="'+esc(ticker)+'" data-seg="'+esc(r.name)+'" data-k="g" style="width:100%">'
        +'<div style="text-align:center;font-size:10.5px;color:'+(r.g==null?'var(--muted)':'var(--accent)')+'">'+gShown.toFixed(0)+'%'+(r.g==null?' (consensus)':'')+'</div></td>'
      +'<td style="padding:6px 4px"><input class="segIn" type="range" min="0" max="75" step="1" value="'+Math.round(mShown)+'" data-tk="'+esc(ticker)+'" data-seg="'+esc(r.name)+'" data-k="m" style="width:100%">'
        +'<div style="text-align:center;font-size:10.5px;color:'+(r.m==null?'var(--muted)':'var(--accent)')+'">'+mShown.toFixed(0)+'%'+(r.m==null?' (company)':'')+'</div></td>'
      +'<td style="text-align:right;padding:6px 4px;font-weight:700">'+fmtUsd(r.ps)+'</td>'
      +'<td style="text-align:right;padding:6px 4px;font-weight:700">'+r.pct.toFixed(1)+'%</td></tr>';
  });
  if(sm.cashPS>0) tbl+='<tr style="border-top:1px solid var(--line)"><td style="padding:6px 4px;color:var(--muted)"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#97C459;margin-right:6px"></span>Net cash</td>'
    +'<td style="text-align:right;padding:6px 4px;color:var(--muted)">'+_dcfB(-b.netDebt)+'</td><td></td><td></td>'
    +'<td style="text-align:right;padding:6px 4px;font-weight:700">'+fmtUsd(sm.cashPS)+'</td>'
    +'<td style="text-align:right;padding:6px 4px;font-weight:700">'+cashPct.toFixed(1)+'%</td></tr>';
  tbl+='</table>';
  // margin tie-out
  var off=Math.abs(sm.wMgn-sm.coMgn);
  var tie='<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px;display:flex;gap:10px;font-size:12px">'
    +'<span style="color:var(--muted);flex:1">Weighted EBIT margin implied by your mix</span>'
    +'<span style="font-weight:700">'+sm.wMgn.toFixed(1)+'%</span>'
    +'<span style="color:var(--muted)">vs company '+sm.coMgn.toFixed(1)+'%</span>'
    +'<span style="color:'+(off<=2?'#16a34a':'#b45309')+';font-weight:700">'+(off<=2?'✓ ties':'⚠ off '+off.toFixed(1)+'pp')+'</span></div>';
  var top=sm.rows.slice().sort(function(x,y){return y.pct-x.pct;})[0];
  var note='<div class="foot" style="margin-top:8px"><b>'+esc(top.name)+'</b> accounts for <b>'+top.pct.toFixed(0)+'%</b> of the share price'
    +(top.pct>70?' — this is effectively a single-driver stock.':'.')+'</div>';
  out.innerHTML=hdr+bar+leg+tbl+tie+note;
  Array.prototype.forEach.call(document.querySelectorAll('.segIn'),function(el){
    el.oninput=function(){
      var o=_dcfSeg[ticker][el.getAttribute('data-seg')];
      o[el.getAttribute('data-k')]=+el.value;
      _dcfSegRender(b,ticker);
    };
  });
}

function _dcfProb(b,st){
  var mc=dcfMonteCarlo(b,st);
  if(!mc) return '';
  var marks=[mc.p10,mc.p90,b.price]; if(b.anchor&&b.anchor.value) marks.push(b.anchor.value);
  var lo=Math.min.apply(null,marks)*0.96, hi=Math.max.apply(null,marks)*1.04, span=(hi-lo)||1;
  function x(v){ return ((v-lo)/span)*100; }
  var W=100;
  var bar='<div style="position:relative;height:34px;margin:6px 0 2px">'
    // p10-p90 band
    +'<div style="position:absolute;top:12px;height:10px;border-radius:5px;background:rgba(29,158,117,0.20);left:'+x(mc.p10).toFixed(1)+'%;width:'+(x(mc.p90)-x(mc.p10)).toFixed(1)+'%"></div>'
    // p25-p75 band
    +'<div style="position:absolute;top:12px;height:10px;border-radius:5px;background:rgba(29,158,117,0.42);left:'+x(mc.p25).toFixed(1)+'%;width:'+(x(mc.p75)-x(mc.p25)).toFixed(1)+'%"></div>'
    // median
    +'<div style="position:absolute;top:8px;height:18px;width:2px;background:#0F6E56;left:'+x(mc.p50).toFixed(1)+'%" title="median '+fmtUsd(mc.p50)+'"></div>'
    // price marker
    +'<div style="position:absolute;top:6px;height:22px;width:2px;background:#111;left:'+x(b.price).toFixed(1)+'%" title="price '+fmtUsd(b.price)+'"></div>'
    +'<div style="position:absolute;top:0;font-size:9.5px;color:#111;transform:translateX(-50%);left:'+x(b.price).toFixed(1)+'%">price</div>'
    +(b.anchor&&b.anchor.value?('<div style="position:absolute;top:6px;height:22px;width:2px;background:#7C3AED;left:'+x(b.anchor.value).toFixed(1)+'%" title="anchor '+fmtUsd(b.anchor.value)+'"></div>'
      +'<div style="position:absolute;top:0;font-size:9.5px;color:#7C3AED;transform:translateX(-50%);left:'+x(b.anchor.value).toFixed(1)+'%">anchor</div>'):'')
    +'</div>';
  var stats='<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:2px">'
    +'<span class="foot" style="margin:0">P10 <b>'+fmtUsd(mc.p10)+'</b></span>'
    +'<span class="foot" style="margin:0">Median <b>'+fmtUsd(mc.p50)+'</b></span>'
    +'<span class="foot" style="margin:0">P90 <b>'+fmtUsd(mc.p90)+'</b></span>'
    +'<span class="foot" style="margin:0">P(undervalued at price) <b style="color:'+(mc.pAbovePrice>=0.5?'#0F6E56':'#A32D2D')+'">'+Math.round(mc.pAbovePrice*100)+'%</b></span></div>';
  return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px">'
    +'<div class="foot" style="margin:0 0 2px">Probabilistic fair value <span style="color:var(--muted)">· '+mc.n+' seeded draws over the assumption ranges</span></div>'
    +bar+stats
    +'<div class="foot" style="margin-top:6px">Shows how WIDE the answer is, not a sharper point \u2014 the centre still comes from your inputs. Seeded, so it is reproducible.</div></div>';
}

function _dcfMonitorNote(ticker){
  var mon=(DATA.dcfMonitor&&DATA.dcfMonitor.names)?DATA.dcfMonitor.names[ticker]:null;
  if(!mon||!mon.flag) return '';
  return '<div class="note" style="border-left-color:#A32D2D;margin:0 0 8px;font-size:12px">\u26A0 Flagged by the daily valuation monitor \u2014 model diverges '
    +Math.abs(mon.gapPct).toFixed(0)+'% from the '+esc(mon.anchorSource||'anchor')+' and no plausible assumption reconciles it (as of '+esc(DATA.dcfMonitor.asOf||'')+').</div>';
}
function _dcfCalibrateBlock(b,st,ticker){
  var c=dcfCalibrate(b,st);
  if(!c) return _dcfMonitorNote(ticker);
  var a=c.anchor, src=esc(a.source||'anchor');
  var head='<div class="foot" style="margin:0 0 4px">Calibrate to '+src+' <b>'+fmtUsd(a.value)+'</b>'
    +(a.asOf?' <span style="color:var(--muted)">('+esc(a.asOf)+')</span>':'')+'</div>';
  var line='<div style="font-size:12.5px;margin-bottom:6px">Model <b>'+(c.modelFv!=null?fmtUsd(c.modelFv):'—')+'</b> vs '+src+' <b>'+fmtUsd(a.value)+'</b>'
    +(c.gapPct!=null?' · gap <b style="color:'+(Math.abs(c.gapPct)<2?'#0F6E56':'#A32D2D')+'">'+(c.gapPct>=0?'+':'')+c.gapPct.toFixed(0)+'%</b>':'')+'</div>';
  var body;
  if(c.reconciled){
    body='<div style="font-size:12.5px;color:#0F6E56">Already within 2% of the '+src+' — no calibration needed.</div>';
  } else if(c.reconcilable){
    var top3=c.candidates.slice(0,3).map(function(cd){
      return '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:3px 0">'
        +'<span style="flex:1">'+esc(cd.label)+' → <b>'+cd.fmt(cd.value)+'</b> <span style="color:var(--muted)">(from '+cd.fmt(cd.cur)+')</span></span>'
        +'<span class="dcfCal" role="button" tabindex="0" data-tk="'+esc(ticker)+'" data-param="'+cd.param+'" data-val="'+cd.value.toFixed(4)+'" '
        +'style="cursor:pointer;color:var(--accent);font-weight:700;font-size:12px;border:1px solid var(--accent);border-radius:6px;padding:2px 8px">Apply</span></div>';
    }).join('');
    body='<div style="font-size:12px;color:var(--muted);margin-bottom:3px">Single plausible assumptions that reconcile the model to the '+src+' — least-move first:</div>'+top3;
  } else {
    body='<div class="note" style="border-left-color:#A32D2D;margin:0"><b>No single plausible assumption reconciles the model to the '+src+'.</b> '
      +'The disagreement is a signal — the '+src+' or the model inputs are suspect. It is NOT forced by pushing an assumption past its plausible range.</div>';
  }
  return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px">'+_dcfMonitorNote(ticker)+head+line+body+'</div>';
}

function _dcfReverse(b,st,m){
  var levers=[['wacc','Discount rate (WACC)',function(v){return v.toFixed(1)+'%';}, m.wacc],
              ['tg','Terminal growth',function(v){return v.toFixed(1)+'%';}, st.tg],
              ['fade','Fade length',function(v){return Math.round(v)+'y';}, st.fade],
              ['hair','Consensus retained',function(v){return Math.round(v)+'%';}, st.hair],
              ['mgnT','Steady-state margin',function(v){return v.toFixed(1)+'%';}, (st.mgnT!=null?st.mgnT:m.mgn*100)]];
  var rows=levers.map(function(L){
    var res=dcfImply(b,st,L[0],b.price), yours=L[2](L[3]);
    if(res.noSolution)
      return '<tr><td style="padding:4px 0">'+L[1]+'</td><td style="text-align:right;color:var(--muted)">—</td>'
        +'<td style="text-align:right;color:var(--muted)">'+yours+'</td>'
        +'<td style="text-align:right;color:#b45309" title="'+esc(res.reason)+'">no solution</td></tr>';
    var flag=res.inBand?'<span style="color:#0F6E56">plausible</span>':'<span style="color:#A32D2D;font-weight:700">outside band</span>';
    return '<tr><td style="padding:4px 0">'+L[1]+'</td><td style="text-align:right;font-weight:700">'+L[2](res.value)+'</td>'
      +'<td style="text-align:right;color:var(--muted)">'+yours+'</td><td style="text-align:right">'+flag+'</td></tr>';
  }).join('');
  return '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px">'
    +'<div class="foot" style="margin:0 0 4px">Reverse DCF — what today\u2019s price ('+fmtUsd(b.price)+') implies</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse">'
    +'<tr class="foot"><th style="text-align:left;font-weight:400">Lever</th><th style="text-align:right;font-weight:400">Market implies</th>'
    +'<th style="text-align:right;font-weight:400">Your input</th><th style="text-align:right;font-weight:400">Check</th></tr>'
    +rows+'</table>'
    +'<div class="foot" style="margin-top:6px">Each row solves for the ONE assumption that makes fair value equal the price, holding the rest at your inputs. '
    +'\u201cOutside band\u201d means the market implies something beyond the plausible range \u2014 a signal, not a knob to force.</div></div>';
}

function _dcfRender(b,ticker){
  if((_dcfTab[ticker]||'total')==='segment'){ _dcfSegRender(b,ticker); return; }
  var st=_dcfState[ticker], out=document.getElementById('dcfOut');
  if(!out) return;
  var m=dcfModel(b,st);
  if(!m||m.err){ out.innerHTML='<div class="note">'+esc(m&&m.err||'model unavailable')+'.</div>'; return; }
  var up=(m.fv/b.price-1)*100, good=up>=0, col=good?'#16a34a':'#dc2626';
  var hdr='<div style="display:flex;align-items:baseline;gap:14px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:12px">'
    +'<div><div class="foot" style="margin:0">Fair value / share</div><div style="font-size:24px;font-weight:800">'+fmtUsd(m.fv)+'</div></div>'
    +'<div style="border-left:1px solid var(--line);padding-left:14px"><div class="foot" style="margin:0">Price</div><div style="font-size:17px;font-weight:700">'+fmtUsd(b.price)+'</div></div>'
    +'<div style="margin-left:auto;text-align:right"><div class="foot" style="margin:0">Upside to model</div>'
    +'<div style="font-size:17px;font-weight:800;color:'+col+'">'+(up>=0?'+':'−')+Math.abs(up).toFixed(0)+'%</div></div></div>';
  var wacc='<div style="background:#f6f8fb;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--muted)">'
    +'Cost of equity = '+st.rf.toFixed(1)+'% + '+st.beta.toFixed(2)+' × '+st.erp.toFixed(1)+'% = <b>'+m.ce.toFixed(2)+'%</b>'
    +' · after-tax cost of debt '+b.kdAT.toFixed(2)+'% → <b>WACC '+m.wacc.toFixed(2)+'%</b></div>';
  // sensitivity: fade length x WACC — the two levers that actually move a growth valuation
  var fs=[Math.max(0,st.fade-6),Math.max(0,st.fade-3),st.fade,st.fade+3,st.fade+6];
  var ws=[m.wacc-1.5,m.wacc-0.75,m.wacc,m.wacc+0.75,m.wacc+1.5].map(function(x){return +x.toFixed(2);});
  var grid='<div class="foot" style="margin:0 0 6px">Sensitivity — fair value by fade length × WACC</div>'
    +'<table style="width:100%;border-collapse:separate;border-spacing:2px;font-size:11px;table-layout:fixed">'
    +'<tr><th style="color:var(--muted);font-weight:400;text-align:left;padding:3px">fade \\ WACC</th>'
    +ws.map(function(w){return '<th style="color:var(--muted);font-weight:400;padding:3px">'+w.toFixed(1)+'%</th>';}).join('')+'</tr>';
  fs.forEach(function(ff){
    grid+='<tr><td style="color:var(--muted);padding:3px">'+ff+'y</td>';
    ws.forEach(function(ww){
      var s2=Object.assign({},st,{fade:ff});
      var r=dcfModelW(b,s2,ww,st.capex/100);
      var v=(r&&!r.err)?r.fv:null, ok=(v!=null&&v>=b.price);
      var bg=(v==null)?'transparent':(ok?'rgba(29,158,117,0.22)':'rgba(226,75,74,0.14)');
      var c=(v==null)?'var(--muted)':(ok?'#0F6E56':'#A32D2D');
      grid+='<td style="text-align:center;padding:5px 3px;border-radius:4px;background:'+bg+';color:'+c+'">'+(v==null?'—':fmtUsd(v).replace(/\.\d+$/,''))+'</td>';
    });
    grid+='</tr>';
  });
  grid+='</table><div class="foot" style="margin:4px 0 12px">Green = at or above today’s price.</div>';
  var rev=_dcfReverse(b,st,m);
  var cal=_dcfCalibrateBlock(b,st,ticker);
  var prob=_dcfProb(b,st);
  var negNote=m.negFcf?'<div class="note" style="border-left-color:#b45309">Free cash flow turns negative in at least one year.</div>':'';
  out.innerHTML=hdr+wacc+negNote+cal+prob+'<div style="margin-bottom:12px">'+_dcfConsensus(b,st,m)+'</div>'
    +'<div style="margin-bottom:12px">'+_dcfStages(b,st,m)+'</div>'+grid+rev+_dcfDeriv(b,m,st);
}
function _dcfWire(b,ticker){
  var map={dcfFade:'fade', dcfCapex:'capex', dcfMaint:'maint', dcfTg:'tg', dcfMgn:'mgnT', dcfBeta:'beta', dcfRf:'rf', dcfErp:'erp', dcfHair:'hair'};
  Object.keys(map).forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    el.oninput=function(){
      _dcfState[ticker][map[id]]=+el.value;
      var o=document.getElementById(id+'Out');
      if(o){
        if(id==='dcfBeta') o.textContent=(+el.value).toFixed(2);
        else if(id==='dcfFade') o.textContent=(+el.value).toFixed(0);
        else if(id==='dcfHair') o.textContent=(+el.value).toFixed(0)+'%';
        else o.textContent=(+el.value).toFixed(1)+'%';
      }
      _dcfRender(b,ticker);
    };
  });
}
async function openDCF(ticker){
  ov.classList.add('open');
  mTitle.textContent=ticker+' · discounted cash flow';
  var b=await dcfBase(ticker);
  if(!b){ mBody.innerHTML='<div class="note">No valuation model available for '+esc(ticker)+'.</div>'; return; }
  if(!_dcfState[ticker]) _dcfState[ticker]=_dcfNewState(b);
  mBody.innerHTML=_dcfBody(b,ticker);
  _dcfWire(b,ticker);
  _dcfRender(b,ticker);
}
document.addEventListener('click', function(e){
  var tb=e.target&&e.target.closest&&e.target.closest('.dcfTab');
  if(tb){ e.preventDefault(); e.stopPropagation();
    var tk=tb.getAttribute('data-tk'); _dcfTab[tk]=tb.getAttribute('data-v');
    dcfBase(tk).then(function(bb){ if(!bb) return;
      mBody.innerHTML=_dcfBody(bb,tk); if((_dcfTab[tk]||'total')==='total') _dcfWire(bb,tk); _dcfRender(bb,tk); });
    return; }
  var o=e.target&&e.target.closest&&e.target.closest('.dcfOpen');
  if(o){ e.preventDefault(); e.stopPropagation(); openDCF(o.getAttribute('data-tk')); return; }
  var bk=e.target&&e.target.closest&&e.target.closest('.dcfBack');
  if(bk){ e.preventDefault(); e.stopPropagation(); openTicker(bk.getAttribute('data-tk'),false); return; }
  var cl=e.target&&e.target.closest&&e.target.closest('.dcfCal');
  if(cl){ e.preventDefault(); e.stopPropagation();
    var tk=cl.getAttribute('data-tk'), pp=cl.getAttribute('data-param'), vv=+cl.getAttribute('data-val');
    if(_dcfState[tk]){ _dcfState[tk][pp]=(pp==='fade')?Math.round(vv):vv;
      dcfBase(tk).then(function(bb){ if(!bb) return; mBody.innerHTML=_dcfBody(bb,tk); _dcfWire(bb,tk); _dcfRender(bb,tk); }); }
  }
});
