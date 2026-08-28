const fmtPct = v => v==null ? '—' : (v*100).toFixed(1)+'%';
const fmtUsd = v => v==null ? '—' : '$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPe = v => v==null ? '—' : v.toFixed(1);
const C={Bear:'#dc2626',Correction:'#f59e0b',Normal:'#16a34a',na:'#9ca3af'};
// ---------- Chart styling kit ----------
if(typeof Chart!=='undefined'&&Chart.defaults){
  Chart.defaults.font.family='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  Chart.defaults.font.size=11.5; Chart.defaults.color='#6b7280';
  Object.assign(Chart.defaults.plugins.legend.labels,{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:14});
  Object.assign(Chart.defaults.plugins.tooltip,{backgroundColor:'rgba(17,24,39,0.95)',padding:10,cornerRadius:8,boxPadding:4,titleFont:{weight:'700',size:12},bodyFont:{size:12}});
  Chart.defaults.animation.duration=650; Chart.defaults.animation.easing='easeOutQuart';
}
const PALETTE=['#2563eb','#7c3aed','#0ea5e9','#14b8a6','#22c55e','#84cc16','#eab308','#f97316','#ef4444','#ec4899','#64748b'];
const _cmap={}; let _ci=0;
function colorFor(k){ if(!(k in _cmap)) _cmap[k]=PALETTE[_ci++ % PALETTE.length]; return _cmap[k]; }
function _hx(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function withAlpha(h,a){const c=_hx(h);return `rgba(${c[0]},${c[1]},${c[2]},${a})`;}
function mix(a,b,t){const A=_hx(a),B=_hx(b);t=Math.max(0,Math.min(1,t));return `rgb(${Math.round(A[0]+(B[0]-A[0])*t)},${Math.round(A[1]+(B[1]-A[1])*t)},${Math.round(A[2]+(B[2]-A[2])*t)})`;}
function hGrad(base){return (ctx)=>{const ch=ctx.chart,ca=ch.chartArea;if(!ca)return base;const g=ch.ctx.createLinearGradient(ca.left,0,ca.right,0);g.addColorStop(0,withAlpha(base,0.5));g.addColorStop(1,base);return g;};}
function barValuePlugin(fmt,opts){opts=opts||{};return {id:'bvl',afterDatasetsDraw(chart){const {ctx}=chart;const ds=chart.data.datasets[0];const meta=chart.getDatasetMeta(0);const horiz=chart.options.indexAxis==='y';const zero=horiz?chart.scales.x.getPixelForValue(0):chart.scales.y.getPixelForValue(0);ctx.save();ctx.font='700 10.5px -apple-system,system-ui,sans-serif';ctx.textBaseline='middle';meta.data.forEach((el,i)=>{const v=ds.data[i];if(v==null)return;const t=fmt(v);if(horiz){const end=el.x,len=Math.abs(end-zero),inside=opts.inside&&len>36;if(inside){ctx.fillStyle='#fff';if(v<0){ctx.textAlign='left';ctx.fillText(t,end+6,el.y);}else{ctx.textAlign='right';ctx.fillText(t,end-6,el.y);}}else{ctx.fillStyle=opts.color||'#374151';if(v<0){ctx.textAlign='right';ctx.fillText(t,end-6,el.y);}else{ctx.textAlign='left';ctx.fillText(t,end+6,el.y);}}}else{ctx.fillStyle=opts.color||'#374151';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(t,el.x,el.y-4);}});ctx.restore();}};}
function centerPlugin(getTop,getBottom){return {id:'cc',afterDraw(chart){const {ctx,chartArea}=chart;if(!chartArea)return;const x=(chartArea.left+chartArea.right)/2,y=(chartArea.top+chartArea.bottom)/2;ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#111827';ctx.font='800 22px -apple-system,system-ui,sans-serif';ctx.fillText(getTop(),x,y-7);ctx.fillStyle='#9ca3af';ctx.font='600 10px -apple-system,system-ui,sans-serif';ctx.fillText(String(getBottom()).toUpperCase(),x,y+13);ctx.restore();}};}

document.getElementById('stamp').textContent='Snapshot from spreadsheet · live columns via STOCKHISTORY';

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active'); document.getElementById(t.dataset.p).classList.add('active');
  // grouped panels (Markets/Portfolio) fire live-price side-effects for their active sub-panel
  const _a=document.querySelector('#'+t.dataset.p+' .subpanel.active'), _p=(_a?_a.id:t.dataset.p);
  if(_p==='ira'||_p==='brokerage') autoLive(_p);
});
// sub-tab nav inside a grouped panel (Markets / Portfolio): toggles .subpanel within that panel only
document.querySelectorAll('.subtab').forEach(t=>t.onclick=()=>{
  const wrap=t.closest('.panel'); if(!wrap) return;
  wrap.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));
  wrap.querySelectorAll('.subpanel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active'); document.getElementById(t.dataset.sp).classList.add('active');
  const _s=t.dataset.sp; if(_s==='ira'||_s==='brokerage') autoLive(_s);
});

function statusCounts(a){const c={Bear:0,Correction:0,Normal:0,'—':0};a.forEach(x=>c[x.status]=(c[x.status]||0)+1);return c;}
function avgOff(a){const v=a.map(x=>x.off).filter(x=>x!=null);return v.length?v.reduce((s,b)=>s+b,0)/v.length:null;}

const chip=s=>`<td><span class="chip ${s==='—'?'na':s}">${s}</span></td>`;
const recCls={'Strong Buy':'sb','Buy':'b','Hold':'h','Sell':'s','Strong Sell':'s'};
const consCell=v=>v?`<td><span class="rec ${recCls[v]||''}">${v}</span></td>`:'<td>—</td>';
const sigCell=v=>`<td class="sig">${v||'—'}</td>`;
const tkrCell=(v,isetf,alert)=>`<td><a class="tkr" data-tk="${v}" data-etf="${isetf?1:0}">${v}</a>${splitBadge(v)}${dqBadge(v)}${alert?alertBadge(v):''}${(typeof earnMemoBadge==='function')?earnMemoBadge(v):''}</td>`;
function splitBadge(tk){
  var sp=(DATA.splits||{})[tk]; if(!sp||!sp.ratio) return '';
  if(sp.date){ var days=(Date.now()-new Date(sp.date+'T00:00:00').getTime())/864e5; if(!(days>=0&&days<=90)) return ''; }
  var rev=(sp.type==='reverse'), col=rev?'#b45309':'#16a34a', bg=rev?'#FFF3CD':'#E8F5E9';
  var when=sp.date?(' · '+new Date(sp.date+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})):'';
  var ttl=((rev?'Reverse split ':'Split ')+sp.ratio+(sp.date?(', effective '+sp.date):'')).replace(/["<>]/g,'');
  return ' <span title="'+ttl+'" style="display:inline-block;font-size:9px;font-weight:700;color:'+col+';background:'+bg+';border:1px solid '+col+';border-radius:10px;padding:0 4px;margin-left:4px;vertical-align:1px;white-space:nowrap">'+(rev?'⇊':'⇈')+' '+esc(sp.ratio)+when+'</span>';
}

function dqBadge(tk){
  var ks=['sp','nasdaq','dow','etfs','thematic','mutualfunds'], dq=null;
  for(var i=0;i<ks.length;i++){ var a=DATA[ks[i]]||[]; for(var j=0;j<a.length;j++){ if(a[j].ticker===tk&&a[j].dq){ dq=a[j].dq; break; } } if(dq) break; }
  if(!dq) return '';
  var err=(dq==='error'), col=err?'#b45309':'#6b7280', bg=err?'#FEF3C7':'#F3F4F6';
  var ttl=err?'Live value unavailable — drawdown & cross withheld (source-data error).':'No live price for this row yet.';
  var lbl=err?'\u26A0 data':'n/a';
  return ' <span title="'+ttl+'" style="display:inline-block;font-size:9px;font-weight:700;color:'+col+';background:'+bg+';border:1px solid '+col+';border-radius:10px;padding:0 4px;margin-left:4px;vertical-align:1px;white-space:nowrap">'+lbl+'</span>';
}
function alertBadge(tk){
  var A=(DATA.alerts||{})[tk]; if(!A) return '';
  var m={bear:['\u25BC','#dc2626','#FDECEC'],death:['\u2715','#dc2626','#FDECEC'],low52:['\u25BC','#b45309','#FEF3C7'],correction:['\u25B3','#b45309','#FEF3C7'],golden:['\u25B2','#16a34a','#E8F5E9'],recover:['\u25B2','#16a34a','#E8F5E9']};
  var g=m[A.kind]||['\u2022','#6b7280','#F3F4F6'];
  var ttl=((A.label||'change')+' \u00b7 '+(A.date||'')).replace(/["<>]/g,'');
  return ' <span class="alertb" role="button" tabindex="0" data-alert="'+esc(tk)+'" title="'+ttl+'" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;font-size:10px;font-weight:700;color:'+g[1]+';background:'+g[2]+';border:1px solid '+g[1]+';border-radius:50%;margin-left:5px;vertical-align:1px;cursor:pointer;line-height:1">'+g[0]+'</span>';
}
const crossCell=v=>v==='Golden Cross'?`<td><span class="rec sb">▲ Golden Cross</span></td>`:v==='Death Cross'?`<td><span class="rec s">▼ Death Cross</span></td>`:'<td>—</td>';
const riskCell=v=>{const c=v==='High'?'s':(v==='Med'?'h':(v==='Low'?'b':''));return v?`<td><span class="rec ${c}">${v}</span></td>`:'<td>—</td>';};

function makeTable(opts){
  const {tableId,data,cols,searchId,filters,footId}=opts;
  let sortKey=cols.find(c=>c.def)?.key||cols[0].key, sortAsc=cols.find(c=>c.def)?.asc??true;
  const table=document.getElementById(tableId);
  function render(){
    const q=(searchId?document.getElementById(searchId).value.toLowerCase():'');
    let rows=data.filter(r=>{
      if(q && !cols.some(c=>String(r[c.key]??'').toLowerCase().includes(q)))return false;
      for(const f of (filters||[])){const v=document.getElementById(f.id).value;if(v && String(r[f.key])!==v)return false;}
      return true;
    });
    rows.sort((a,b)=>{let x=a[sortKey],y=b[sortKey];if(x==null||x==='')x=Infinity;if(y==null||y==='')y=Infinity;
      if(typeof x==='string'||typeof y==='string'){x=String(x);y=String(y);return sortAsc?x.localeCompare(y):y.localeCompare(x);}
      return sortAsc?x-y:y-x;});
    let h='<thead><tr>'+cols.map(c=>`<th data-k="${c.key}" class="${c.key===sortKey?'sorted '+(sortAsc?'asc':''):''} ${c.num?'num':''}">${hcol(c.label)}</th>`).join('')+'</tr></thead><tbody>';
    h+=rows.map(r=>'<tr>'+cols.map(c=>{let v=r[c.key];
      if(c.render)return c.render(v,r);
      if(c.num)return `<td class="num ${typeof v==='number'&&v<0?'neg':''}">${v==null?'—':(c.fmt?c.fmt(v):v)}</td>`;
      return `<td class="${c.cls||''}">${v==null||v===''?'—':v}</td>`;}).join('')+'</tr>').join('')+'</tbody>';
    table.innerHTML=h;
    table.querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k===sortKey)sortAsc=!sortAsc;else{sortKey=k;sortAsc=true;}render();});
    if(footId)document.getElementById(footId).textContent=`${rows.length} of ${data.length} shown`;
  }
  if(searchId)document.getElementById(searchId).oninput=render;
  (filters||[]).forEach(f=>document.getElementById(f.id).onchange=render);
  table._render=render; render();
}

function buildStockPanel(pid,data,label){
  const has=data.some(x=>x.off!=null);
  const panel=document.getElementById(pid);
  panel.innerHTML=`
    ${has?'':`<div class="note"><b>Live prices not yet populated.</b> All ${data.length} ${label} names are loaded; their price / drawdown columns fill in once the workbook is opened in Excel 365 (so STOCKHISTORY can fetch) and the dashboard refreshes. Sector breakdown, analyst columns, and search work now.</div>`}
    <div class="kpis" id="${pid}K"></div>
    <div class="grid2">
      <div class="card"><h3>Companies by sector — trend rank (50d &amp; 200d SMA)</h3><div class="chartbox"><canvas id="${pid}Sec"></canvas></div></div>
      <div class="card" id="${pid}StatusCard"><h3>${has?'Status mix':'Avg drawdown by sector'}</h3><div class="chartbox"><canvas id="${pid}Chart2"></canvas></div></div>
    </div>
    <div class="controls">
      <input id="${pid}Search" placeholder="Search ticker or company…">
      <select id="${pid}StatusF"><option value="">All statuses</option><option>Bear</option><option>Correction</option><option>Normal</option></select>
      <select id="${pid}SecF"><option value="">All sectors</option></select>
    </div>
    <div class="tablewrap"><table id="${pid}Table"></table></div>
    <div class="foot" id="${pid}Foot"></div>`;

  const c=statusCounts(data),a=avgOff(data);
  document.getElementById(pid+'K').innerHTML=`
    <div class="kpi"><div class="v">${data.length}</div><div class="l">${label} names</div></div>
    <div class="kpi"><div class="v">${has?fmtPct(a):'—'}</div><div class="l">Avg off high</div></div>
    <div class="kpi bear"><div class="v">${c.Bear||0}</div><div class="l">Bear</div></div>
    <div class="kpi corr"><div class="v">${c.Correction||0}</div><div class="l">Correction</div></div>
    <div class="kpi norm"><div class="v">${c.Normal||0}</div><div class="l">Normal</div></div>`;

  // Sector trend ranking: score = mean over the sector of (½·%vs200dSMA + ½·%vs50dSMA). Rank 1 = strongest uptrend.
  const secAgg={};
  data.forEach(x=>{const s=x.sector;const o=secAgg[s]||(secAgg[s]={c:0,sc:[],a2:0,n2:0,gc:0,ng:0});o.c++;
    if(x.smapct!=null&&x.sma50pct!=null)o.sc.push(0.5*x.smapct+0.5*x.sma50pct);
    if(x.smapct!=null){o.n2++;if(x.smapct>0)o.a2++;}
    if(x.cross==='Golden Cross'||x.cross==='Death Cross'){o.ng++;if(x.cross==='Golden Cross')o.gc++;}});
  let secList=Object.entries(secAgg).map(([s,o])=>({sector:s,count:o.c,
    score:o.sc.length?o.sc.reduce((a,b)=>a+b,0)/o.sc.length:null,
    above200:o.n2?o.a2/o.n2:null,golden:o.ng?o.gc/o.ng:null}));
  const hasScore=secList.some(x=>x.score!=null);
  secList.sort((a,b)=>{if(hasScore){const av=a.score==null?-1e9:a.score,bv=b.score==null?-1e9:b.score;if(bv!==av)return bv-av;}return b.count-a.count;});
  let _rk=0;secList.forEach(x=>{x.rank=(x.score!=null)?(++_rk):null;});
  const trendColor=v=>{if(v==null)return '#9ca3af';const t=Math.max(0,Math.min(1,(v+0.1)/0.2));return t<0.5?mix('#dc2626','#f59e0b',t/0.5):mix('#f59e0b','#16a34a',(t-0.5)/0.5);};
  new Chart(document.getElementById(pid+'Sec'),{type:'bar',
    data:{labels:secList.map(x=>(x.rank?('#'+x.rank+'  '):'')+x.sector),datasets:[{data:secList.map(x=>x.count),backgroundColor:secList.map(x=>trendColor(x.score)),borderRadius:6,borderSkipped:false,maxBarThickness:22,categoryPercentage:0.85}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,onClick:(e,els)=>{if(els.length){const sec=secList[els[0].index].sector;openSectorRanking(sec,data.filter(x=>x.sector===sec));}},layout:{padding:{right:30}},plugins:{legend:{display:false},tooltip:{callbacks:{
      title:items=>secList[items[0].dataIndex].sector,
      label:cx=>{const x=secList[cx.dataIndex];const L=[' '+x.count+' companies'];
        if(x.score!=null)L.push(' Trend score '+(x.score>=0?'+':'')+(x.score*100).toFixed(1)+'%');
        if(x.above200!=null)L.push(' '+Math.round(x.above200*100)+'% above 200d SMA');
        if(x.golden!=null)L.push(' '+Math.round(x.golden*100)+'% golden cross');
        return L;}}}},scales:{x:{display:false,beginAtZero:true,grid:{display:false}},y:{grid:{display:false},border:{display:false},ticks:{font:{weight:'600'},color:'#374151'}}}},
    plugins:[barValuePlugin(v=>v,{color:'#6b7280'})]});

  if(has){
    const sc=statusCounts(data);const labels=['Bear','Correction','Normal'].filter(k=>sc[k]>0);
    new Chart(document.getElementById(pid+'Chart2'),{type:'doughnut',
      data:{labels,datasets:[{data:labels.map(k=>sc[k]),backgroundColor:labels.map(k=>C[k]),borderColor:'#fff',borderWidth:3,hoverOffset:8,spacing:2}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c2=>` ${c2.label}: ${c2.parsed}`}}}},
      plugins:[centerPlugin(()=>String(labels.reduce((s,k)=>s+sc[k],0)),()=>'names')]});
  }else{
    const avg={};data.forEach(x=>{if(x.off==null)return;(avg[x.sector]=avg[x.sector]||[]).push(x.off)});
    const rows=Object.entries(avg).map(([s,v])=>[s,v.reduce((a,b)=>a+b,0)/v.length]).sort((a,b)=>a[1]-b[1]);
    if(rows.length){const d2=rows.map(r=>+(r[1]*100).toFixed(1));const wmin=Math.min(...d2,-0.0001);
      new Chart(document.getElementById(pid+'Chart2'),{type:'bar',
      data:{labels:rows.map(r=>r[0]),datasets:[{data:d2,backgroundColor:d2.map(v=>mix('#fecaca','#b91c1c',v/wmin)),borderRadius:6,borderSkipped:false,maxBarThickness:22,categoryPercentage:0.85}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{left:8,right:14}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.x+'% avg off high'}}},scales:{x:{display:false,grid:{display:false}},y:{grid:{display:false},border:{display:false},ticks:{font:{weight:'600'},color:'#374151'}}}},
      plugins:[barValuePlugin(v=>v+'%',{inside:true})]});}
    else{document.getElementById(pid+'StatusCard').style.display='none';}
  }

  const secSel=document.getElementById(pid+'SecF');
  [...new Set(data.map(x=>x.sector))].sort().forEach(s=>{const o=document.createElement('option');o.textContent=s;secSel.appendChild(o);});
  makeTable({tableId:pid+'Table',data,searchId:pid+'Search',footId:pid+'Foot',
    filters:[{id:pid+'StatusF',key:'status'},{id:pid+'SecF',key:'sector'}],
    cols:[{key:'ticker',label:'Ticker',render:v=>tkrCell(v,false)},{key:'company',label:'Company'},{key:'sector',label:'Sector'},
     {key:'price',label:'Price',num:true,fmt:fmtUsd},{key:'high',label:'52-Wk High',num:true,fmt:fmtUsd},
     {key:'off',label:'% Off High',num:true,fmt:fmtPct,def:true,asc:true},
     {key:'status',label:'Status',render:v=>chip(v)},
     {key:'signal',label:'Drawdown Signal',render:v=>sigCell(v)},
     {key:'recover',label:'% to Recover',num:true,fmt:fmtPct},
     {key:'sma',label:'200d SMA',num:true,fmt:fmtUsd},
     {key:'smapct',label:'% vs 200d SMA',num:true,fmt:fmtPct},
     {key:'sma50',label:'50d SMA',num:true,fmt:fmtUsd},
     {key:'sma50pct',label:'% vs 50d SMA',num:true,fmt:fmtPct},
     {key:'cross',label:'Cross Signal',render:v=>crossCell(v)},
     {key:'consensus',label:'Analyst Consensus',render:v=>consCell(v)},
     {key:'fwdpe',label:'Fwd P/E',num:true,fmt:fmtPe}].concat(pid==='sp'?[{key:'risk',label:'Risk (W/F/M)',render:v=>riskCell(v)}]:[])});
}

buildStockPanel('sp',DATA.sp,'S&P 500');
buildStockPanel('nasdaq',DATA.nasdaq,'Nasdaq-100');
buildStockPanel('dow',DATA.dow,'Dow Jones');

