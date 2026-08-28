// ---------- Monte Carlo retirement outcomes (client-side, no connector) ----------
// Simulates correlated lognormal annual returns for the IRA + Brokerage sleeves on top of the
// existing RET_CFG assumptions (years, contributions, expected returns). Volatility is the one
// NEW assumption: defaulted from each holding's 52-week high/low range (Parkinson-style) but
// fully user-adjustable, because that estimator overstates vol for strong trenders (a name that
// tripled has a wide range without being especially volatile). Seeded RNG => the KPI tile and the
// popup always agree. Informational, not advice.
var MC = {volIra:null, volBk:null, rho:0.7, goal:null, n:2000, seed:20260709, _est:null};

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function _mcUniRow(tk){
  var ks=['sp','nasdaq','dow','etfs','thematic','mutualfunds'];
  for(var i=0;i<ks.length;i++){ var a=DATA[ks[i]]||[];
    for(var j=0;j<a.length;j++){ if(a[j].ticker===tk) return a[j]; } }
  return null;
}
// value-weighted vol from 52-week ranges: sigma_i ~= ln(H/L)/1.665, combined with correlation rho
function mcEstVol(rows){
  var items=[], tot=0;
  (rows||[]).forEach(function(h){
    if(!h||!h.ticker||h.type==='CD'||h.type==='Cash') return;
    var v=+h.value||0; if(v<=0) return;
    var hi=h.high, lo=h.low;
    if(hi==null||lo==null){ var r=_mcUniRow(h.ticker); if(r){ if(hi==null)hi=r.high; if(lo==null)lo=r.low; } }
    if(!(hi>0&&lo>0&&hi>lo)) return;
    var s=Math.log(hi/lo)/1.665;
    s=Math.min(Math.max(s,0.05),1.20);
    items.push({v:v,s:s}); tot+=v;
  });
  if(!items.length||tot<=0) return 0.18;
  var sum=0;
  for(var i=0;i<items.length;i++){ for(var j=0;j<items.length;j++){
    var wi=items[i].v/tot, wj=items[j].v/tot;
    sum += wi*wj*items[i].s*items[j].s*(i===j?1:MC.rho);
  } }
  return Math.min(Math.max(Math.sqrt(sum),0.06),0.60);
}
function mcEstimates(){
  if(MC._est) return MC._est;
  var ira=DATA.ira||[], bk=DATA.brokerage||[];
  var e={ira:mcEstVol(ira), bk:mcEstVol(bk), all:mcEstVol(ira.concat(bk))};
  MC._est=e; return e;
}
function _sum(rows){ return (rows||[]).reduce(function(s,h){ return s+(+h.value||0); },0); }

function mcCfg(){
  var est=mcEstimates();
  var target=(MC.volIra!=null)?MC.volIra:est.all;         // household-level vol (the slider)
  var k=est.all>0?(target/est.all):1;                      // scale each sleeve, keep relative risk
  return {startIra:_sum(DATA.ira), startBk:_sum(DATA.brokerage),
          contribIra:RET_CFG.iraC, contribBk:RET_CFG.bkC,
          muIra:RET_CFG.iraER, muBk:RET_CFG.bkER,
          volIra:Math.max(0.01,est.ira*k), volBk:Math.max(0.01,est.bk*k),
          rho:MC.rho, years:Math.max(1,RET_CFG.years), n:MC.n, seed:MC.seed};
}
function _q(sorted,p){ if(!sorted.length) return 0; var i=(sorted.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
  return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo); }

function mcRun(cfg){
  cfg=cfg||mcCfg();
  var Y=cfg.years, N=cfg.n, rnd=mulberry32(cfg.seed);
  function gauss(){ var u=0,v=0; while(u===0)u=rnd(); while(v===0)v=rnd();
    return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185307179586*v); }
  var mi=Math.log(1+cfg.muIra)-0.5*cfg.volIra*cfg.volIra;
  var mb=Math.log(1+cfg.muBk)-0.5*cfg.volBk*cfg.volBk;
  var rho=cfg.rho, sq=Math.sqrt(Math.max(0,1-rho*rho));
  var byYear=[]; for(var t=0;t<=Y;t++) byYear.push(new Array(N));
  for(var p=0;p<N;p++){
    var ai=cfg.startIra, ab=cfg.startBk;
    byYear[0][p]=ai+ab;
    for(var t2=1;t2<=Y;t2++){
      var z1=gauss(), z2=gauss(), zb=rho*z1+sq*z2;
      ai=ai*Math.exp(mi+cfg.volIra*z1)+cfg.contribIra;
      ab=ab*Math.exp(mb+cfg.volBk*zb)+cfg.contribBk;
      if(ai<0)ai=0; if(ab<0)ab=0;
      byYear[t2][p]=ai+ab;
    }
  }
  var pct={p10:[],p25:[],p50:[],p75:[],p90:[]};
  for(var t3=0;t3<=Y;t3++){
    var arr=byYear[t3].slice().sort(function(a,b){return a-b;});
    pct.p10.push(_q(arr,0.10)); pct.p25.push(_q(arr,0.25)); pct.p50.push(_q(arr,0.50));
    pct.p75.push(_q(arr,0.75)); pct.p90.push(_q(arr,0.90));
  }
  var term=byYear[Y].slice().sort(function(a,b){return a-b;});
  // deterministic (smooth-return) overlay, same formula the retirement chart uses
  function FV(pv,pmt,r,y){ return pv*Math.pow(1+r,y)+(r===0?pmt*y:pmt*((Math.pow(1+r,y)-1)/r)); }
  var det=[]; for(var t4=0;t4<=Y;t4++) det.push(FV(cfg.startIra,cfg.contribIra,cfg.muIra,t4)+FV(cfg.startBk,cfg.contribBk,cfg.muBk,t4));
  return {cfg:cfg, years:Y, pct:pct, term:term, det:det,
          start:cfg.startIra+cfg.startBk,
          pAbove:function(x){ var c=0; for(var i=0;i<term.length;i++) if(term[i]>=x)c++; return c/term.length; },
          pBelow:function(x){ var c=0; for(var i=0;i<term.length;i++) if(term[i]<x)c++; return c/term.length; }};
}
// KPI tile value — seeded, so it matches the popup exactly. Memoized: buildRetirePanel's compute()
// re-renders the KPI row on every input keystroke, and a full re-simulation there is wasted work.
var _mcMemo={k:null,v:null};
function mcMedian(){
  try{
    var c=mcCfg();
    var key=[c.startIra,c.startBk,c.contribIra,c.contribBk,c.muIra,c.muBk,c.volIra,c.volBk,c.rho,c.years,c.n,c.seed].join('|');
    if(_mcMemo.k===key) return _mcMemo.v;
    var r=mcRun(c);
    _mcMemo.k=key; _mcMemo.v=r.pct.p50[r.years];
    return _mcMemo.v;
  }catch(e){ return null; }
}

function _mcFan(r){
  var W=780,H=232,L=54,R=12,T=10,B=24, Y=r.years;
  var maxY=Math.max(r.pct.p90[Y], r.det[Y])*1.06 || 1;
  var x=function(t){ return L+(t/Y)*(W-L-R); };
  var y=function(v){ return (H-B)-(v/maxY)*((H-B)-T); };
  var ts=[]; for(var t=0;t<=Y;t++) ts.push(t);
  function line(a){ return ts.map(function(t,i){ return (i?'L':'M')+x(t).toFixed(1)+' '+y(a[t]).toFixed(1); }).join(' '); }
  function band(lo,hi){
    var up=ts.map(function(t,i){ return (i?'L':'M')+x(t).toFixed(1)+' '+y(hi[t]).toFixed(1); }).join(' ');
    var dn=ts.slice().reverse().map(function(t){ return 'L'+x(t).toFixed(1)+' '+y(lo[t]).toFixed(1); }).join(' ');
    return up+' '+dn+' Z';
  }
  var grid='', lbl='';
  for(var k=0;k<=4;k++){ var v=maxY*k/4, yy=y(v);
    grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" stroke="#f1f5f9" stroke-width="1"/>';
    lbl+='<text x="'+(L-6)+'" y="'+(yy+3.5).toFixed(1)+'" text-anchor="end" font-size="10" fill="#9ca3af">'+fmtUsd(v)+'</text>'; }
  var xl=''; var stp=Y>12?Math.ceil(Y/6):2;
  for(var t2=0;t2<=Y;t2+=stp){ xl+='<text x="'+x(t2).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="10" fill="#9ca3af">yr '+t2+'</text>'; }
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Simulated portfolio outcome range">'
    +grid
    +'<path d="'+band(r.pct.p10,r.pct.p90)+'" fill="rgba(29,158,117,0.14)"/>'
    +'<path d="'+band(r.pct.p25,r.pct.p75)+'" fill="rgba(29,158,117,0.30)"/>'
    +'<path d="'+line(r.pct.p50)+'" fill="none" stroke="#0F6E56" stroke-width="2.5"/>'
    +'<path d="'+line(r.det)+'" fill="none" stroke="#2E75B6" stroke-width="2" stroke-dasharray="5 4"/>'
    +lbl+xl+'</svg>';
}

function _mcBody(){
  var r=mcRun(), Y=r.years, est=mcEstimates();
  var vol=(MC.volIra!=null)?MC.volIra:est.all;
  if(MC.goal==null) MC.goal=Math.round(r.det[Y]/50000)*50000;
  var pg=r.pAbove(MC.goal), pl=r.pBelow(r.start);
  var pcts=[['P10',r.pct.p10[Y]],['P25',r.pct.p25[Y]],['Median',r.pct.p50[Y]],['P75',r.pct.p75[Y]],['P90',r.pct.p90[Y]]];
  var presets=[['Market-like',0.12],['Tech-tilted',0.18],['Your mix',est.all]];
  var chips=presets.map(function(p){
    var on=Math.abs(p[1]-vol)<0.005;
    return '<span class="mcp" data-v="'+p[1].toFixed(4)+'" style="cursor:pointer;font-size:11px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);margin-right:5px;'
      +(on?'background:#eef2ff;color:var(--accent);font-weight:700':'color:var(--muted)')+'">'+p[0]+' '+Math.round(p[1]*100)+'%</span>';
  }).join('');
  return ''
   +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">'
     +'<label style="font-size:12.5px;color:var(--muted);width:86px">Volatility</label>'
     +'<input type="range" id="mcVol" min="6" max="55" step="1" value="'+Math.round(vol*100)+'" style="flex:1">'
     +'<span id="mcVolOut" style="font-size:13px;font-weight:700;width:42px;text-align:right">'+Math.round(vol*100)+'%</span></div>'
   +'<div style="margin:0 0 10px 96px">'+chips+'</div>'
   +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
     +'<label style="font-size:12.5px;color:var(--muted);width:86px">Goal</label>'
     +'<input type="range" id="mcGoal" min="'+Math.round(r.start)+'" max="'+Math.round(Math.max(r.pct.p90[Y],r.det[Y]))+'" step="25000" value="'+MC.goal+'" style="flex:1">'
     +'<span id="mcGoalOut" style="font-size:13px;font-weight:700;width:62px;text-align:right">'+fmtUsd(MC.goal)+'</span></div>'
   +'<div id="mcFan">'+_mcFan(r)+'</div>'
   +'<div style="display:flex;gap:14px;margin:2px 0 12px 4px;font-size:11.5px;color:var(--muted)">'
     +'<span><span style="display:inline-block;width:14px;height:9px;border-radius:2px;background:rgba(29,158,117,.30);vertical-align:-1px"></span> P25–P75</span>'
     +'<span><span style="display:inline-block;width:14px;height:9px;border-radius:2px;background:rgba(29,158,117,.14);vertical-align:-1px"></span> P10–P90</span>'
     +'<span><span style="display:inline-block;width:14px;height:2px;background:#0F6E56;vertical-align:3px"></span> Median</span>'
     +'<span><span style="display:inline-block;width:14px;border-top:2px dashed #2E75B6;vertical-align:3px"></span> Smooth plan</span></div>'
   +'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px" id="mcPct">'
     +pcts.map(function(p){ return '<div style="border:1px solid var(--line);border-radius:8px;padding:7px 6px;text-align:center">'
       +'<div style="font-size:10.5px;color:var(--muted)">'+p[0]+'</div>'
       +'<div style="font-size:13px;font-weight:'+(p[0]==='Median'?'700':'400')+'">'+fmtUsd(p[1])+'</div></div>'; }).join('')
   +'</div>'
   +'<div style="display:flex;gap:10px;margin-bottom:12px">'
     +'<div style="flex:1;border:1px solid var(--line);border-left:5px solid #16a34a;border-radius:8px;padding:8px 12px"><div class="foot" style="margin:0">Chance of reaching goal</div><div id="mcPG" style="font-size:19px;font-weight:700;color:#16a34a">'+Math.round(pg*100)+'%</div></div>'
     +'<div style="flex:1;border:1px solid var(--line);border-left:5px solid #dc2626;border-radius:8px;padding:8px 12px"><div class="foot" style="margin:0">Chance of ending below today</div><div id="mcPL" style="font-size:19px;font-weight:700;color:#dc2626">'+Math.round(pl*100)+'%</div></div>'
   +'</div>'
   +'<div class="foot">'+MC.n.toLocaleString()+' simulated paths · IRA &amp; Brokerage modelled separately (correlation '+MC.rho+') on top of your retirement assumptions. '
   +'<b>Volatility is an assumption, not a measurement.</b> The default ('+Math.round(est.all*100)+'%) is derived from each holding’s 52-week high/low range, which <i>overstates</i> risk for names that simply trended hard — treat it as an upper bound and market-like 12–18% as a lower bound. '
   +'Returns are drawn i.i.d. lognormal, so fat tails and sequence-of-returns risk are not captured. Rules-based projection — <b>not financial advice</b>.</div>';
}

function _mcRedraw(){
  var r=mcRun(), Y=r.years;
  document.getElementById('mcFan').innerHTML=_mcFan(r);
  var pcts=[['P10',r.pct.p10[Y]],['P25',r.pct.p25[Y]],['Median',r.pct.p50[Y]],['P75',r.pct.p75[Y]],['P90',r.pct.p90[Y]]];
  document.getElementById('mcPct').innerHTML=pcts.map(function(p){
    return '<div style="border:1px solid var(--line);border-radius:8px;padding:7px 6px;text-align:center">'
      +'<div style="font-size:10.5px;color:var(--muted)">'+p[0]+'</div>'
      +'<div style="font-size:13px;font-weight:'+(p[0]==='Median'?'700':'400')+'">'+fmtUsd(p[1])+'</div></div>'; }).join('');
  document.getElementById('mcPG').textContent=Math.round(r.pAbove(MC.goal)*100)+'%';
  document.getElementById('mcPL').textContent=Math.round(r.pBelow(r.start)*100)+'%';
}

function openMonteCarlo(){
  if(typeof RET_CFG==='undefined') return;
  mTitle.innerHTML='Monte Carlo outcomes <span style="font-weight:400;color:var(--muted);font-size:13px">· '+MC.n.toLocaleString()+' simulations · '+Math.max(1,RET_CFG.years)+' years</span>';
  mBody.innerHTML=_mcBody();
  var _mcCard=ov.querySelector('.modal'); if(_mcCard) _mcCard.classList.add('wide');
  ov.classList.add('open');
  var v=document.getElementById('mcVol'), g=document.getElementById('mcGoal');
  if(v) v.oninput=function(){ MC.volIra=(+v.value)/100; document.getElementById('mcVolOut').textContent=v.value+'%';
    Array.prototype.forEach.call(document.querySelectorAll('.mcp'),function(el){
      var on=Math.abs(parseFloat(el.getAttribute('data-v'))-MC.volIra)<0.005;
      el.style.background=on?'#eef2ff':''; el.style.color=on?'var(--accent)':'var(--muted)'; el.style.fontWeight=on?'700':'400'; });
    _mcRedraw(); };
  if(g) g.oninput=function(){ MC.goal=+g.value; document.getElementById('mcGoalOut').textContent=fmtUsd(MC.goal); _mcRedraw(); };
  Array.prototype.forEach.call(document.querySelectorAll('.mcp'),function(el){
    el.onclick=function(){ MC.volIra=parseFloat(el.getAttribute('data-v'));
      var vv=document.getElementById('mcVol'); if(vv) vv.value=Math.round(MC.volIra*100);
      document.getElementById('mcVolOut').textContent=Math.round(MC.volIra*100)+'%';
      Array.prototype.forEach.call(document.querySelectorAll('.mcp'),function(e2){
        var on=Math.abs(parseFloat(e2.getAttribute('data-v'))-MC.volIra)<0.005;
        e2.style.background=on?'#eef2ff':''; e2.style.color=on?'var(--accent)':'var(--muted)'; e2.style.fontWeight=on?'700':'400'; });
      _mcRedraw(); };
  });
}
document.addEventListener('click', function(e){
  var t=e.target&&e.target.closest&&e.target.closest('.kpimc');
  if(t){ e.preventDefault(); openMonteCarlo(); }
});
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter'&&e.key!==' ') return;
  var el=document.activeElement;
  if(el&&el.classList&&el.classList.contains('kpimc')){ e.preventDefault(); openMonteCarlo(); }
});
