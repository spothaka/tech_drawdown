const LIVEPX={}, LIVECFG={}; let _lpAsOf=null; let _retRecompute=null;
function iraUniv(tk){ for(const k of ['sp','nasdaq','dow','etfs','thematic','mutualfunds']){const a=DATA[k];if(!a)continue;const r=a.find(x=>x.ticker===tk);if(r)return {r,k};} return null; }
// Shared, guarded market value for a holding. Rejects a corrupt/unit-mismatched live
// quote (implied value >3x off the imported value) so one bad runtime price can't blow
// up account totals; falls back live -> embedded -> universe -> imported value.
function mktValue(h,u){
  const mkable=(h.type==='Equity/ETF'||h.type==='Mutual Fund'), lv=LIVEPX[h.ticker];
  const bad=v=>(v!=null&&typeof h.value==='number'&&h.value>0&&(v>h.value*3||v<h.value/3));
  let _lp=(lv&&lv.price!=null)?lv.price:(h.price!=null?h.price:(u&&u.r?u.r.price:null));
  let mkt=(mkable&&typeof h.qty==='number'&&typeof _lp==='number')?h.qty*_lp:null;
  if(bad(mkt)){ _lp=(h.price!=null)?h.price:(u&&u.r?u.r.price:null); mkt=(mkable&&typeof h.qty==='number'&&typeof _lp==='number')?h.qty*_lp:null; if(bad(mkt)) mkt=null; }
  if(mkt==null) mkt=(typeof h.value==='number')?h.value:null;
  return {mkt,_lp,mkable};
}
function buildIraPanel(raw){
  const panel=document.getElementById('ira'); if(!panel)return;
  const rows=(raw||[]).map(h=>{
    const u=iraUniv(h.ticker), isCD=h.type==='CD';
    const lv=LIVEPX[h.ticker];
    const _mv=mktValue(h,u), mkable=_mv.mkable, _lp=_mv._lp, mkt=_mv.mkt;
    const cost=(typeof h.qty==='number'&&typeof h.paid==='number')?(isCD?h.qty*h.paid/100:h.qty*h.paid):null;
    const gl=(mkt!=null&&cost!=null)?mkt-cost:null, glp=(gl!=null&&cost)?gl/cost:null;
    const isetf=(h.type==='Mutual Fund')?true:(u?(u.k==='etfs'||u.k==='thematic'):false);
    return {ticker:h.ticker,type:h.type,qty:h.qty,price:_lp,cost,mkt,gl,glp,
      off:(lv&&lv.off!=null?lv.off:(h.off!=null?h.off:(u?u.r.off:null))),status:(lv&&lv.status?lv.status:(h.status!=null?h.status:(u?u.r.status:'—'))),cross:(lv&&lv.cross?lv.cross:(h.cross!=null?h.cross:(u?u.r.cross:'—'))),mkable,isetf};
  });
  const totMkt=rows.reduce((s,r)=>s+(r.mkt||0),0);
  rows.forEach(r=>r.weight=totMkt?(r.mkt||0)/totMkt:null);
  const totCost=rows.reduce((s,r)=>s+(r.cost||0),0);
  const totGL=totMkt-totCost, totGLp=totCost?totGL/totCost:null;
  panel.innerHTML=`
    <div class="note" style="border-left-color:#E0A106">Your IRA holdings joined to the dashboard's live drawdown &amp; trend metrics. Market value = shares × current live price from the data connector (press <b>Load live prices</b> to refresh; auto-loads on first open each day); falls back to your imported value when no live price. Status/Cross come from the same live quote. <b>Not financial advice.</b></div>
    <div class="kpis" id="iraK"></div>
    <div class="grid2">
      <div class="card"><h3>Allocation by holding</h3><div class="chartbox"><canvas id="iraAlloc"></canvas></div></div>
      <div class="card"><h3>Gain / loss by holding (%)</h3><div class="chartbox"><canvas id="iraGL"></canvas></div></div>
    </div>
    <div class="controls"><input id="iraSearch" placeholder="Search holding…">
      <select id="iraTypeF"><option value="">All types</option>${[...new Set(rows.map(r=>r.type))].map(t=>'<option>'+t+'</option>').join('')}</select>
      <button id="iraLoad" style="display:none;padding:7px 12px;border:1px solid #E0A106;background:#E0A106;color:#fff;border-radius:8px;font-weight:600;cursor:pointer">↻ Load live prices</button>
      <span id="iraAsOf" class="foot" style="align-self:center;margin:0"></span></div>
    <div class="tablewrap"><table id="iraTable"></table></div>
    <div class="foot" id="iraFoot"></div>
    <div id="iraStrat" style="margin-top:14px"></div>`;
  document.getElementById('iraK').innerHTML=`
    <div class="kpi"><div class="v">${fmtUsd(totMkt)}</div><div class="l">Market value</div></div>
    <div class="kpi"><div class="v">${fmtUsd(totCost)}</div><div class="l">Cost basis</div></div>
    <div class="kpi ${totGL>=0?'norm':'bear'}"><div class="v">${fmtUsd(totGL)}</div><div class="l">Total gain / loss</div></div>
    <div class="kpi"><div class="v">${fmtPct(totGLp)}</div><div class="l">Return</div></div>
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">Holdings</div></div>`;
  const alloc=rows.filter(r=>r.mkt).slice().sort((a,b)=>b.mkt-a.mkt);
  new Chart(document.getElementById('iraAlloc'),{type:'doughnut',
    data:{labels:alloc.map(r=>r.ticker.length>16?r.ticker.slice(0,15)+'…':r.ticker),datasets:[{data:alloc.map(r=>+(r.mkt).toFixed(2)),backgroundColor:alloc.map(r=>colorFor(r.ticker)),borderColor:'#fff',borderWidth:2,hoverOffset:8,spacing:1}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'right',labels:{boxWidth:8,padding:7,font:{size:10}}},tooltip:{callbacks:{label:c=>' '+c.label+': '+fmtUsd(c.parsed)+' ('+(totMkt?(c.parsed/totMkt*100).toFixed(1):0)+'%)'}}}},
    plugins:[centerPlugin(()=>'$'+Math.round(totMkt).toLocaleString(),()=>'Total')]});
  const glr=rows.filter(r=>r.glp!=null).slice().sort((a,b)=>b.glp-a.glp);
  new Chart(document.getElementById('iraGL'),{type:'bar',
    data:{labels:glr.map(r=>r.ticker.length>12?r.ticker.slice(0,11)+'…':r.ticker),datasets:[{data:glr.map(r=>+(r.glp*100).toFixed(1)),backgroundColor:glr.map(r=>r.glp>=0?'#16a34a':'#dc2626'),borderRadius:5,borderSkipped:false,maxBarThickness:18,categoryPercentage:0.9}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:34,left:6}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>(c.parsed.x>=0?'+':'')+c.parsed.x+'% vs cost'}}},scales:{x:{display:false,grid:{display:false}},y:{grid:{display:false},border:{display:false},ticks:{font:{weight:'700'},color:'#374151'}}}},
    plugins:[barValuePlugin(v=>(v>=0?'+':'')+v+'%',{})]});
  makeTable({tableId:'iraTable',data:rows,searchId:'iraSearch',footId:'iraFoot',
    filters:[{id:'iraTypeF',key:'type'}],
    cols:[
      {key:'ticker',label:'Holding',render:(v,r)=>r.mkable?tkrCell(v,r.isetf,true):`<td>${v.length>30?v.slice(0,28)+'…':v}</td>`},
      {key:'type',label:'Type'},
      {key:'qty',label:'Qty',num:true,fmt:v=>v==null?'—':(+v).toLocaleString(undefined,{maximumFractionDigits:3})},
      {key:'price',label:'Price',num:true,fmt:fmtUsd},
      {key:'cost',label:'Cost Basis',num:true,fmt:fmtUsd},
      {key:'mkt',label:'Market Value',num:true,fmt:fmtUsd,def:true,asc:false},
      {key:'gl',label:'Gain/Loss',num:true,fmt:fmtUsd},
      {key:'glp',label:'Gain/Loss %',num:true,fmt:fmtPct},
      {key:'weight',label:'Weight',num:true,fmt:fmtPct},
      {key:'off',label:'% Off High',num:true,fmt:fmtPct},
      {key:'status',label:'Status',render:v=>chip(v)},
      {key:'cross',label:'Cross',render:v=>crossCell(v)}
    ]});
  document.getElementById('iraStrat').innerHTML=decorateHeaders(acctSection(retModel(RET_ACCTS[0]),null));
  attachLivePrices({key:'ira',raw,btnId:'iraLoad',stampId:'iraAsOf',rebuild:buildIraPanel});
}
// ---------- Retirement & Income planning (two-account household) ----------
const RET_BUCK={FBGRX:'growth',AMD:'growth',SNOW:'growth',GOOG:'growth',ACHR:'growth',AMZN:'growth',ASML:'growth',AVEX:'growth',GLW:'growth',JOBY:'growth',META:'growth',MGK:'growth',MSFT:'growth',NVO:'growth',SMH:'growth',SOXQ:'growth',SPYM:'growth',UBER:'growth',VOO:'growth',FXAIX:'growth',
  DELL:'div',TGT:'div',JEPI:'div',JEPQ:'div',SCHD:'div',KO:'div',XLV:'div',CVS:'div',UNH:'div'};
const RET_Y={JEPI:0.075,JEPQ:0.095,SCHD:0.035,KO:0.030,XLV:0.015,CVS:0.040,UNH:0.015,DELL:0.018,TGT:0.033,VOO:0.013,FXAIX:0.013,FBGRX:0,_cd:0.038};
function retBucket(h){ return (h.type==='CD'||h.type==='Cash')?'fixed':(RET_BUCK[h.ticker]||'growth'); }
function retYield(h){ if(h.type==='CD')return RET_Y._cd; if(RET_Y[h.ticker]!=null)return RET_Y[h.ticker]; return retBucket(h)==='div'?0.025:0.003; }
const RET_ACCTS=[
  {dataKey:'ira',name:'IRA',role:'Income',color:'#E0A106',taxFree:true,tgt:{growth:0.20,div:0.65,fixed:0.15},tgtY:{growth:0.012,div:0.057,fixed:0.040},note:'Tax-sheltered — rebalance freely and host the income assets here (dividends compound untaxed).'},
  {dataKey:'brokerage',name:'Brokerage',role:'Growth',color:'#2E75B6',taxFree:false,tgt:{growth:0.85,div:0.10,fixed:0.05},tgtY:{growth:0.009,div:0.030,fixed:0.040},note:'Taxable — move tax-aware: fund growth with new cash, wind income ETFs down gradually, harvest losses.'}
];
const RET_CFG={years:10,infl:0.025,iraC:8000,iraER:0.06,bkC:50000,bkER:0.095};
function retActions(m){
  const a=m.a, income=(a.role==='Income');
  return m.rows.slice().sort((x,y)=>y.mkt-x.mkt).map(r=>{
    let act,cls,why;
    if(r.bucket==='fixed'){act=income?'Redeploy':'Hold';cls='h';why=income?'At CD maturity → dividend/income sleeve (tax-free in IRA)':'Short reserve';}
    else if(r.bucket==='div'){ if(income){act='Hold / Add';cls='b';why='Core income holding';} else {act='Trim (tax-aware)';cls='h';why=(/JEPI|JEPQ/.test(r.ticker)?'High-tax income ETF — wind down; income role belongs in the IRA':'Income tilt — reduce gradually toward growth');} }
    else { if(income){act=(r.ticker==='FBGRX')?'Sell → income':'Trim → income';cls='h';why='Reduce growth; fund the income sleeve (tax-free in IRA)';} else {act='Hold / Add';cls='b';why='Growth core';} }
    let tlh=''; if(!a.taxFree && typeof r.qty==='number' && typeof r.paid==='number'){ const gl=r.mkt-r.qty*r.paid; if(gl<0) tlh=' · <span style="color:#dc2626">TLH candidate</span>'; }
    return {r,act,cls,why:why+tlh};
  });
}
function retModel(cfg){
  const raw=DATA[cfg.dataKey]||[];
  const rows=raw.map(h=>{
    const mv=mktValue(h,iraUniv(h.ticker));
    return {ticker:h.ticker,type:h.type,mkt:(mv.mkt!=null?mv.mkt:0),qty:h.qty,paid:h.paid,bucket:retBucket(h),y:retYield(h)};
  });
  const total=rows.reduce((s,r)=>s+r.mkt,0); const cur={growth:0,div:0,fixed:0}; rows.forEach(r=>cur[r.bucket]+=r.mkt);
  const curYield=total?rows.reduce((s,r)=>s+r.mkt*r.y,0)/total:0;
  const tgtYield=cfg.tgt.growth*cfg.tgtY.growth+cfg.tgt.div*cfg.tgtY.div+cfg.tgt.fixed*cfg.tgtY.fixed;
  return {a:cfg,rows,total,cur,curYield,tgtYield};
}
function acctSection(m,fv){
  const a=m.a, t=m.total||1, bl=['growth','div','fixed'], bln={growth:'Growth',div:'Dividend / income',fixed:'Fixed income'};
  const actTxt=d=>Math.abs(d)<t*0.01?'<span style="color:#6b7280">Hold</span>':(d>0?'<span style="color:#16a34a;font-weight:600">+ Add '+fmtUsd(d)+'</span>':'<span style="color:#dc2626;font-weight:600">− Trim '+fmtUsd(-d)+'</span>');
  let bt='<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="color:#6b7280;text-align:right"><th style="text-align:left">Sleeve</th><th>Current</th><th>Cur %</th><th>Target %</th><th>Target $</th><th style="text-align:left;padding-left:10px">Action today</th></tr></thead><tbody>';
  bt+=bl.map(b=>{const tv=t*a.tgt[b],d=tv-m.cur[b];return '<tr><td>'+bln[b]+'</td><td align="right">'+fmtUsd(m.cur[b])+'</td><td align="right">'+(m.cur[b]/t*100).toFixed(0)+'%</td><td align="right">'+(a.tgt[b]*100).toFixed(0)+'%</td><td align="right">'+fmtUsd(tv)+'</td><td style="padding-left:10px">'+actTxt(d)+'</td></tr>';}).join('')+'</tbody></table>';
  let ht='<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:10px"><thead><tr style="color:#6b7280"><th style="text-align:left">Holding</th><th style="text-align:right">Value</th><th style="text-align:left;padding-left:10px">Action</th><th style="text-align:left;padding-left:10px">Rationale</th></tr></thead><tbody>';
  ht+=retActions(m).map(o=>'<tr><td>'+(o.r.ticker.length>16?o.r.ticker.slice(0,14)+'…':o.r.ticker)+'</td><td align="right">'+fmtUsd(o.r.mkt)+'</td><td style="padding-left:10px"><span class="rec '+o.cls+'">'+o.act+'</span></td><td style="padding-left:10px;color:#6b7280">'+o.why+'</td></tr>').join('');
  const gapB=(a.role==='Income')?'div':'growth', gap=t*a.tgt[gapB]-m.cur[gapB];
  if(gap>t*0.02) ht+='<tr style="background:#f0fdf4"><td><b>'+(a.role==='Income'?'Dividend / income sleeve':'Growth core')+'</b><br><span style="font-size:11px;color:#6b7280">'+(a.role==='Income'?'SCHD / DGRO + JEPI-type':'broad-market + quality growth')+'</span></td><td align="right">—</td><td style="padding-left:10px"><span class="rec b">Add '+fmtUsd(gap)+'</span></td><td style="padding-left:10px;color:#6b7280">Build toward the '+a.role.toLowerCase()+' target</td></tr>';
  ht+='</tbody></table>';
  return '<div class="card"><h3 style="border-left:5px solid '+a.color+';padding-left:9px">'+a.name+' — '+a.role+' role <span style="font-weight:400;color:#6b7280;font-size:12.5px">· '+fmtUsd(t)+' now'+(fv!=null?(' → '+fmtUsd(fv)+' @ yr '+RET_CFG.years):'')+' · target yield '+(m.tgtYield*100).toFixed(1)+'%</span></h3>'
    +'<div style="font-size:12px;color:#6b7280;margin:2px 0 8px">'+a.note+'</div>'+bt+ht+'</div>';
}
function buildRetirePanel(){
  const panel=document.getElementById('retire'); if(!panel) return;
  let ira, bk;
  const FV=(pv,pmt,r,y)=>pv*Math.pow(1+r,y)+(r===0?pmt*y:pmt*((Math.pow(1+r,y)-1)/r));
  const incETF=(DATA.brokerage||[]).filter(h=>/JEPI|JEPQ|SCHD/.test(h.ticker)).reduce((s,h)=>s+(h.value||0),0);
  panel.innerHTML=`
    <div class="note" style="border-left-color:#E0A106"><b>Household retirement plan</b> — IRA as the <b>income engine</b> (dividends-only, preserve principal) and the taxable Brokerage as the <b>growth engine</b>. Illustrative, rules-based projections from the assumptions below — not personalized advice.</div>
    <div class="controls" style="gap:16px;flex-wrap:wrap">
      <label style="font-size:13px;color:#374151">Years <input id="retYears" type="number" min="1" max="40" step="1" style="width:58px"></label>
      <label style="font-size:13px;color:#374151">Inflation % <input id="retInfl" type="number" min="0" max="10" step="0.5" style="width:60px"></label>
      <label style="font-size:13px;color:#374151">IRA $/yr <input id="retIraC" type="number" min="0" step="500" style="width:84px"></label>
      <label style="font-size:13px;color:#374151">IRA return % <input id="retIraER" type="number" min="0" max="20" step="0.5" style="width:66px"></label>
      <label style="font-size:13px;color:#374151">Brokerage $/yr <input id="retBkC" type="number" min="0" step="1000" style="width:92px"></label>
      <label style="font-size:13px;color:#374151">Brokerage return % <input id="retBkER" type="number" min="0" max="25" step="0.5" style="width:66px"></label>
    </div>
    <div class="kpis" id="retK"></div>
    <div id="benchCard"></div>
    <div id="ddCard"></div>
    <div class="card"><h3>Combined balance to retirement — Current Plan vs Rebalance Plan</h3><div class="chartbox tall"><canvas id="retAcc"></canvas></div><div class="foot">Estimated combined balance if you hold today's mix (Current Plan) vs. move to the target allocations (Rebalance Plan). The lines can run close — rebalancing mainly trades a little growth for a higher, sustainable dividend income, which the IRA card quantifies.</div></div>
    <div id="retAccts"></div>
    <div class="note" style="border-left-color:#2E75B6"><b>Asset location.</b> Your income ETFs (JEPI, JEPQ, SCHD ≈ ${fmtUsd(incETF)}) currently sit in the <b>taxable</b> brokerage, where distributions are taxed yearly. Over time, host the income role in the <b>IRA</b> (tax-free) and let the brokerage compound growth. You can't transfer holdings into an IRA except via the ${'$'}8k/yr contribution, so shift <i>each account internally</i> toward its role. <b>Not financial or tax advice.</b></div>`;
  document.getElementById('retYears').value=RET_CFG.years;
  document.getElementById('retInfl').value=RET_CFG.infl*100;
  document.getElementById('retIraC').value=RET_CFG.iraC;
  document.getElementById('retIraER').value=RET_CFG.iraER*100;
  document.getElementById('retBkC').value=RET_CFG.bkC;
  document.getElementById('retBkER').value=RET_CFG.bkER*100;
  let accChart;
  function compute(){
    RET_CFG.years=Math.max(1,Math.round(+document.getElementById('retYears').value||10));
    RET_CFG.infl=Math.max(0,(+document.getElementById('retInfl').value||2.5)/100);
    RET_CFG.iraC=Math.max(0,+document.getElementById('retIraC').value||0);
    RET_CFG.iraER=Math.max(0,(+document.getElementById('retIraER').value||6)/100);
    RET_CFG.bkC=Math.max(0,+document.getElementById('retBkC').value||0);
    RET_CFG.bkER=Math.max(0,(+document.getElementById('retBkER').value||9.5)/100);
    ira=retModel(RET_ACCTS[0]); bk=retModel(RET_ACCTS[1]);
    const y=RET_CFG.years;
    const iraFV=FV(ira.total,RET_CFG.iraC,RET_CFG.iraER,y), bkFV=FV(bk.total,RET_CFG.bkC,RET_CFG.bkER,y);
    const combNow=ira.total+bk.total, combFV=iraFV+bkFV;
    const incMo=iraFV*ira.tgtYield/12, incToday=incMo/Math.pow(1+RET_CFG.infl,y);
    document.getElementById('retK').innerHTML=`
      <div class="kpi"><div class="v">${fmtUsd(combNow)}</div><div class="l">Combined value now</div></div>
      <div class="kpi"><div class="v">${fmtUsd(combFV)}</div><div class="l">Combined @ yr ${y}</div></div>
      <div class="kpi norm"><div class="v">${fmtUsd(incMo)}</div><div class="l">IRA dividend income / mo</div></div>
      <div class="kpi"><div class="v">${fmtUsd(incToday)}</div><div class="l">…in today's dollars</div></div>
      <div class="kpi"><div class="v">${fmtUsd(bkFV)}</div><div class="l">Brokerage growth @ yr ${y}</div></div>${DATA.dividends?`
      <div class="kpi kpidiv" role="button" tabindex="0" title="Open dividend income calendar" style="cursor:pointer;position:relative;outline:1.5px solid var(--accent);outline-offset:-2px"><span style="position:absolute;top:9px;right:9px;color:var(--accent);display:inline-flex"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><text x="12" y="18.5" font-size="10" fill="currentColor" stroke="none" text-anchor="middle" font-weight="700">$</text></svg></span><div class="v">${fmtUsd(DATA.dividends.annual)}<span style="font-size:12px;color:var(--muted);font-weight:400">/yr</span></div><div class="l" style="color:var(--accent)">Dividend income \u2192</div></div>`:''}${(typeof mcMedian==='function'&&mcMedian()!=null)?`
      <div class="kpi kpimc" role="button" tabindex="0" title="Open Monte Carlo outcomes" style="cursor:pointer;position:relative;outline:1.5px solid var(--accent);outline-offset:-2px"><span style="position:absolute;top:9px;right:9px;color:var(--accent);display:inline-flex"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21V4M3 21h18"/><rect x="6" y="12" width="3" height="6" fill="currentColor" stroke="none"/><rect x="11" y="7" width="3" height="11" fill="currentColor" stroke="none"/><rect x="16" y="10" width="3" height="8" fill="currentColor" stroke="none"/></svg></span><div class="v">${fmtUsd(mcMedian())}</div><div class="l" style="color:var(--accent)">Median @ yr ${y} \u2192</div></div>`:''}${(typeof ltTopHidden==='function'&&ltTopHidden())?(function(h){return `
      <div class="kpi kpilt" role="button" tabindex="0" title="What you actually own (fund look-through)" style="cursor:pointer;position:relative;outline:1.5px solid #dc2626;outline-offset:-2px"><span style="position:absolute;top:9px;right:9px;color:#dc2626;display:inline-flex"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/><path d="M3 3l18 18"/></svg></span><div class="v">${h.sym} ${h.partial?'\u2265':''}${h.pct.toFixed(1)}%</div><div class="l" style="color:#dc2626">Hidden exposure${h.partial?' (partial)':''} \u2192</div></div>`;})(ltTopHidden()):''}`;
    const yrs=[...Array(y+1).keys()];
    const bTR={growth:0.095,div:0.065,fixed:0.04};
    const aR=al=>al.growth*bTR.growth+al.div*bTR.div+al.fixed*bTR.fixed;
    const wts=m=>({growth:m.cur.growth/(m.total||1),div:m.cur.div/(m.total||1),fixed:m.cur.fixed/(m.total||1)});
    const iraCurER=Math.max(0,RET_CFG.iraER+(aR(wts(ira))-aR(ira.a.tgt)));
    const bkCurER=Math.max(0,RET_CFG.bkER+(aR(wts(bk))-aR(bk.a.tgt)));
    const rebS=yrs.map(t=>+(FV(ira.total,RET_CFG.iraC,RET_CFG.iraER,t)+FV(bk.total,RET_CFG.bkC,RET_CFG.bkER,t)).toFixed(0));
    const curS=yrs.map(t=>+(FV(ira.total,RET_CFG.iraC,iraCurER,t)+FV(bk.total,RET_CFG.bkC,bkCurER,t)).toFixed(0));
    if(accChart)accChart.destroy();
    accChart=new Chart(document.getElementById('retAcc'),{type:'line',
      data:{labels:yrs.map(t=>'Yr '+t),datasets:[
        {label:'Rebalance Plan',data:rebS,borderColor:'#16a34a',backgroundColor:withAlpha('#16a34a',0.10),fill:true,tension:0.3,pointRadius:0,borderWidth:3},
        {label:'Current Plan',data:curS,borderColor:'#9ca3af',borderDash:[6,4],fill:false,tension:0.3,pointRadius:0,borderWidth:2.5}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{mode:'index',intersect:false,callbacks:{label:cx=>' '+cx.dataset.label+': '+fmtUsd(cx.parsed.y),afterBody:items=>{if(items.length>=2){const d=Math.abs(items[0].parsed.y-items[1].parsed.y);return '\nDifference: '+fmtUsd(d);}return '';}}}},scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>'$'+Math.round(v/1000)+'k'},grid:{color:'#f1f5f9'}}}}});
    document.getElementById('retAccts').innerHTML='<div class="note">Per-account rebalancing plans now live on the <b>IRA Portfolio</b> and <b>Brokerage Portfolio</b> tabs.</div>';
  }
  ['retYears','retInfl','retIraC','retIraER','retBkC','retBkER'].forEach(id=>document.getElementById(id).oninput=compute);
  _retRecompute=compute;
  compute();
  if(typeof buildBenchmark==='function') buildBenchmark();
  if(typeof buildDrawdown==='function') buildDrawdown();
}
async function openCoreRanking(){
  const R=DATA.coreRank||[]; if(!R.length) return;
  ov.classList.add('open'); mTitle.textContent='Growth-core — live ranking'; mBody.innerHTML='';
  const st=R.map(c=>{ var row=rowByTicker(c.ticker)||{};
    var tr=(row.smapct!=null&&row.sma50pct!=null)?0.5*row.smapct+0.5*row.sma50pct:(row.smapct!=null?row.smapct:null);
    return {ticker:c.ticker,held:c.held,upside:(c.up!=null?c.up:null),smapct:(row.smapct!=null?row.smapct:null),trend:tr,fund:undefined}; });
  let loaded=0; const canLive=hasLiveConnector();
  var _fmCore=function(c){ var f=c.fund||{}; return {trend:c.trend, roe:f.roe, roa:f.roa, gm:f.gm, nm:f.nm, pe:f.pe, ev:f.ev, upside:c.upside}; };
  async function refreshCore(){ var b=document.getElementById('rkRefresh'); if(!b||b.disabled)return; b.disabled=true;
    pcDelKeys(st.map(c=>c.ticker),['F:','CT:']); st.forEach(c=>{c.fund=undefined;}); loaded=0; render();
    await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; var bb=document.getElementById('rkRefresh'); if(bb)bb.textContent='Refreshing… '+loaded+'/'+st.length; render(); });
    var b2=document.getElementById('rkRefresh'); if(b2){b2.disabled=false;b2.textContent='↻ Refresh now';}
    var a=document.getElementById('rkAsOf'); if(a)a.textContent='as of '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}); }
  RK_HOOKS.growth_core={recompute:async function(){ pcDelKeys(st.map(c=>c.ticker),['F:']); st.forEach(c=>{c.fund=undefined;}); loaded=0; render(); await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; render(); }); }};
  function render(){
    const _items=st.map(c=>({id:c.ticker,metrics:_fmCore(c)}));
    const _sc=rankGroup(_items,getRuleset('growth_core'));
    RK_EXPL.growth_core={};
    st.forEach((c,i)=>{ c.comp=_sc[i].composite; c._d=_sc[i]; RK_EXPL.growth_core[c.ticker]=_sc[i]; });
    const ranked=st.slice().sort((a,b)=>(b.comp==null?-1:b.comp)-(a.comp==null?-1:a.comp));
    var pc=function(v){return v==null?'—':Math.round(v*100);};
    let h=`<div class="foot" style="margin-bottom:8px">Quality + Valuation + Trend + Analyst — percentile-blended within the shortlist (Quality-tilted default). Fundamentals loaded ${loaded}/${st.length}. Analyst upside from the daily snapshot. <b>Rules-based screen — not financial advice.</b></div>`;
    h+='<table class="mdt"><thead><tr><th>#</th><th>Ticker</th><th>Score</th><th>Qual</th><th>Val</th><th>Trend</th><th>Analyst</th><th>P/E</th><th>%vs200d</th><th>Own?</th></tr></thead><tbody>';
    ranked.forEach((c,i)=>{ var dm=(c._d&&c._d.dimensions)||{};
      h+=`<tr><td>${c.comp!=null?(i+1):'—'}</td>`+
        `<td><a class="tkr" data-tk="${c.ticker}" data-etf="0">${c.ticker}</a>${splitBadge(c.ticker)}${dqBadge(c.ticker)}</td>`+
        `<td class="rkscore" data-rk="growth_core" data-tk="${c.ticker}" title="Why this score? Click for breakdown" style="font-weight:700;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px">${c.comp!=null?Math.round(c.comp*100):'—'}</td>`+
        `<td>${pc(dm.quality)}</td><td>${pc(dm.valuation)}</td><td>${pc(dm.trend)}</td><td>${pc(dm.analyst)}</td>`+
        `<td>${c.fund&&c.fund.pe!=null?c.fund.pe.toFixed(1):'…'}</td>`+
        `<td class="${c.smapct!=null&&c.smapct<0?'neg':''}">${c.smapct!=null?(c.smapct*100).toFixed(1)+'%':'—'}</td>`+
        `<td>${c.held?'<span style="color:#16a34a;font-weight:600">held</span>':'<span style="color:#6b7280">add</span>'}</td></tr>`; });
    h+='</tbody></table>';
    _rkPaint('growth_core', render, h, canLive?refreshCore:null);
  }
  render();
  if(!canLive){ mBody.insertAdjacentHTML('afterbegin','<div class="note">Live growth-core needs a live connector — showing snapshot-based trend/analyst scoring only (fundamentals not fetched).</div>'); return; }
  await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; render(); });
}

function coreCard(){
  const R=DATA.coreRank||[]; if(!R.length)return '';
  const heat=v=>{const x=Math.max(0,Math.min(1,(v-45)/50));return x<0.5?mix('#dc2626','#f59e0b',x/0.5):mix('#f59e0b','#16a34a',(x-0.5)/0.5);};
  const pct=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';
  let h='<div class="card"><h3>Growth-core shortlist — live scorecard <span style="font-weight:400;color:#6b7280;font-size:12px">· quality + valuation + trend + analyst</span></h3><button onclick="openCoreRanking()" style="font-size:11.5px;padding:3px 10px;border:1px solid #cbb26a;background:#fff;border-radius:6px;cursor:pointer;margin:0 0 8px">⚙ Customize &amp; rank (live) →</button>';
  h+='<div class="tablewrap"><table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="color:#6b7280"><th style="text-align:left">#</th><th style="text-align:left">Ticker</th><th>Composite</th><th>Qual</th><th>Val</th><th>Trend</th><th>Analyst</th><th>P/E</th><th>% off high</th><th>Cross</th><th>Upside</th><th>Own?</th></tr></thead><tbody>';
  R.forEach(r=>{ h+='<tr><td>'+r.rank+'</td><td><b>'+r.ticker+'</b>'+splitBadge(r.ticker)+dqBadge(r.ticker)+'</td>'
    +'<td align="center"><span style="display:inline-block;min-width:32px;padding:2px 6px;border-radius:6px;color:#fff;font-weight:700;background:'+heat(r.comp)+'">'+r.comp+'</span></td>'
    +'<td align="center">'+r.Q+'</td><td align="center">'+r.V+'</td><td align="center">'+r.T+'</td><td align="center">'+r.A+'</td>'
    +'<td align="center">'+r.pe+'</td><td align="center" class="'+(r.off<0?'neg':'')+'">'+pct(r.off)+'</td>'
    +'<td align="center">'+(r.cross==='Golden'?'<span class="rec sb">▲</span>':'<span class="rec s">▼</span>')+'</td>'
    +'<td align="center" class="'+(r.up<0?'neg':'')+'">'+pct(r.up)+'</td>'
    +'<td align="center">'+(r.held?'<span style="color:#16a34a;font-weight:600">held</span>':'<span style="color:#6b7280">add</span>')+'</td></tr>'; });
  h+='</tbody></table></div>';
  h+='<div style="font-size:12.5px;margin-top:8px"><b>Read:</b> On the current blend, <b>'+(R[0]?R[0].ticker:'—')+'</b> screens strongest and <b>'+(R.length?R[R.length-1].ticker:'—')+'</b> weakest. This snapshot refreshes daily; open <b>⚙ Customize &amp; rank (live)</b> above to re-score with fresh fundamentals and your own weights, thresholds &amp; rules.</div>';
  h+='<div class="foot" style="margin-top:6px">Composite = 35% quality (margins, balance sheet) + 25% valuation (P/E, PEG) + 20% trend (vs 200-day, cross, drawdown) + 20% analyst (consensus upside). Live data via connector, Jun 2026. NVDA &amp; AAPL not held directly (NVDA via SMH/SOXQ). Rules-based screen — not financial advice.</div></div>';
  return h;
}
function buildBrokeragePanel(raw){
  const panel=document.getElementById('brokerage'); if(!panel)return;
  const rows=(raw||[]).map(h=>{
    const u=iraUniv(h.ticker), isCD=h.type==='CD';
    const lv=LIVEPX[h.ticker];
    const _mv=mktValue(h,u), mkable=_mv.mkable, _lp=_mv._lp, mkt=_mv.mkt;
    const cost=(typeof h.qty==='number'&&typeof h.paid==='number')?(isCD?h.qty*h.paid/100:h.qty*h.paid):null;
    const gl=(mkt!=null&&cost!=null)?mkt-cost:null, glp=(gl!=null&&cost)?gl/cost:null;
    const isetf=(h.type==='Mutual Fund')?true:(u?(u.k==='etfs'||u.k==='thematic'):false);
    return {ticker:h.ticker,type:h.type,qty:h.qty,price:_lp,cost,mkt,gl,glp,
      off:(lv&&lv.off!=null?lv.off:(h.off!=null?h.off:(u?u.r.off:null))),status:(lv&&lv.status?lv.status:(h.status!=null?h.status:(u?u.r.status:'—'))),cross:(lv&&lv.cross?lv.cross:(h.cross!=null?h.cross:(u?u.r.cross:'—'))),mkable,isetf};
  });
  const totMkt=rows.reduce((s,r)=>s+(r.mkt||0),0);
  rows.forEach(r=>r.weight=totMkt?(r.mkt||0)/totMkt:null);
  const totCost=rows.reduce((s,r)=>s+(r.cost||0),0);
  const totGL=totMkt-totCost, totGLp=totCost?totGL/totCost:null;
  panel.innerHTML=`
    <div class="note" style="border-left-color:#E0A106">Your Brokerage holdings joined to the dashboard's live drawdown &amp; trend metrics. Market value = shares × current live price from the data connector (press <b>Load live prices</b> to refresh; auto-loads on first open each day); falls back to your imported value when no live price. Status/Cross come from the same live quote. <b>Not financial advice.</b></div>
    <div class="kpis" id="bkK"></div>
    <div class="grid2">
      <div class="card"><h3>Allocation by holding</h3><div class="chartbox"><canvas id="bkAlloc"></canvas></div></div>
      <div class="card"><h3>Gain / loss by holding (%)</h3><div class="chartbox"><canvas id="bkGL"></canvas></div></div>
    </div>
    <div class="controls"><input id="bkSearch" placeholder="Search holding…">
      <select id="bkTypeF"><option value="">All types</option>${[...new Set(rows.map(r=>r.type))].map(t=>'<option>'+t+'</option>').join('')}</select>
      <button id="bkLoad" style="display:none;padding:7px 12px;border:1px solid #E0A106;background:#E0A106;color:#fff;border-radius:8px;font-weight:600;cursor:pointer">↻ Load live prices</button>
      <span id="bkAsOf" class="foot" style="align-self:center;margin:0"></span></div>
    <div class="tablewrap"><table id="bkTable"></table></div>
    <div class="foot" id="bkFoot"></div>
    <div id="bkStrat" style="margin-top:14px"></div>
    <div id="bkCore" style="margin-top:14px"></div>`;
  document.getElementById('bkK').innerHTML=`
    <div class="kpi"><div class="v">${fmtUsd(totMkt)}</div><div class="l">Market value</div></div>
    <div class="kpi"><div class="v">${fmtUsd(totCost)}</div><div class="l">Cost basis</div></div>
    <div class="kpi ${totGL>=0?'norm':'bear'}"><div class="v">${fmtUsd(totGL)}</div><div class="l">Total gain / loss</div></div>
    <div class="kpi"><div class="v">${fmtPct(totGLp)}</div><div class="l">Return</div></div>
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">Holdings</div></div>`;
  const alloc=rows.filter(r=>r.mkt).slice().sort((a,b)=>b.mkt-a.mkt);
  new Chart(document.getElementById('bkAlloc'),{type:'doughnut',
    data:{labels:alloc.map(r=>r.ticker.length>16?r.ticker.slice(0,15)+'…':r.ticker),datasets:[{data:alloc.map(r=>+(r.mkt).toFixed(2)),backgroundColor:alloc.map(r=>colorFor(r.ticker)),borderColor:'#fff',borderWidth:2,hoverOffset:8,spacing:1}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'right',labels:{boxWidth:8,padding:7,font:{size:10}}},tooltip:{callbacks:{label:c=>' '+c.label+': '+fmtUsd(c.parsed)+' ('+(totMkt?(c.parsed/totMkt*100).toFixed(1):0)+'%)'}}}},
    plugins:[centerPlugin(()=>'$'+Math.round(totMkt).toLocaleString(),()=>'Total')]});
  const glr=rows.filter(r=>r.glp!=null).slice().sort((a,b)=>b.glp-a.glp);
  new Chart(document.getElementById('bkGL'),{type:'bar',
    data:{labels:glr.map(r=>r.ticker.length>12?r.ticker.slice(0,11)+'…':r.ticker),datasets:[{data:glr.map(r=>+(r.glp*100).toFixed(1)),backgroundColor:glr.map(r=>r.glp>=0?'#16a34a':'#dc2626'),borderRadius:5,borderSkipped:false,maxBarThickness:18,categoryPercentage:0.9}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:34,left:6}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>(c.parsed.x>=0?'+':'')+c.parsed.x+'% vs cost'}}},scales:{x:{display:false,grid:{display:false}},y:{grid:{display:false},border:{display:false},ticks:{font:{weight:'700'},color:'#374151'}}}},
    plugins:[barValuePlugin(v=>(v>=0?'+':'')+v+'%',{})]});
  makeTable({tableId:'bkTable',data:rows,searchId:'bkSearch',footId:'bkFoot',
    filters:[{id:'bkTypeF',key:'type'}],
    cols:[
      {key:'ticker',label:'Holding',render:(v,r)=>r.mkable?tkrCell(v,r.isetf,true):`<td>${v.length>30?v.slice(0,28)+'…':v}</td>`},
      {key:'type',label:'Type'},
      {key:'qty',label:'Qty',num:true,fmt:v=>v==null?'—':(+v).toLocaleString(undefined,{maximumFractionDigits:3})},
      {key:'price',label:'Price',num:true,fmt:fmtUsd},
      {key:'cost',label:'Cost Basis',num:true,fmt:fmtUsd},
      {key:'mkt',label:'Market Value',num:true,fmt:fmtUsd,def:true,asc:false},
      {key:'gl',label:'Gain/Loss',num:true,fmt:fmtUsd},
      {key:'glp',label:'Gain/Loss %',num:true,fmt:fmtPct},
      {key:'weight',label:'Weight',num:true,fmt:fmtPct},
      {key:'off',label:'% Off High',num:true,fmt:fmtPct},
      {key:'status',label:'Status',render:v=>chip(v)},
      {key:'cross',label:'Cross',render:v=>crossCell(v)}
    ]});
  document.getElementById('bkStrat').innerHTML=decorateHeaders(acctSection(retModel(RET_ACCTS[1]),null));
  document.getElementById('bkCore').innerHTML=decorateHeaders(coreCard());
  attachLivePrices({key:'brokerage',raw,btnId:'bkLoad',stampId:'bkAsOf',rebuild:buildBrokeragePanel});
}
buildIraPanel(DATA.ira||[]);
buildBrokeragePanel(DATA.brokerage||[]);
buildRetirePanel();

// ---------- Fundamentals popup (live via Bigdata connector; live-connector only) ----------
