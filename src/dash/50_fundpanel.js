function etfLiveMetrics(md){
  if(!md||typeof md!=='string')return null;
  const g=re=>{const m=md.match(re);return m?parseFloat(m[1].replace(/,/g,'')):null;};
  const price=g(/\|\s*Last Price\s*\|\s*\$?([\d.,]+)/i);
  const high=g(/\|\s*52-Week High\s*\|\s*\$?([\d.,]+)/i);
  const sma50=g(/\|\s*50-Day MA\s*\|\s*\$?([\d.,]+)/i);
  const sma200=g(/\|\s*200-Day MA\s*\|\s*\$?([\d.,]+)/i);
  if(price==null)return null;
  const off=high?price/high-1:null;
  const status=off==null?'—':(off<=-0.2?'Bear':off<=-0.1?'Correction':'Normal');
  const cross=(sma50!=null&&sma200!=null)?(Math.abs(sma50-sma200)<1e-9?'—':(sma50>=sma200?'Golden Cross':'Death Cross')):'—';
  return {price,high,off,status,sma:sma200,smapct:sma200?price/sma200-1:null,sma50,sma50pct:sma50?price/sma50-1:null,cross,
    recover:(high&&price)?high/price-1:null,
    signal:off==null?'—':(off<=-0.5?'Deep value zone (>50% off)':off<=-0.2?'Bear (-20% to -50%)':off<=-0.1?'Correction (-10% to -20%)':'Near highs (<10% off)')};
}
function buildFundPanel(pid,data,label,unit){
  const has=data.some(x=>x.off!=null);
  document.getElementById(pid).innerHTML=`
    <div class="note" id="${pid}Pending"></div>
    <div class="kpis" id="${pid}K"></div>
    <div class="grid2">
      <div class="card"><h3>By category — trend rank (50d &amp; 200d SMA)</h3><div class="chartbox"><canvas id="${pid}Cat"></canvas></div></div>
      <div class="card" id="${pid}StatusCard"><h3>Status mix</h3><div class="chartbox"><canvas id="${pid}Status"></canvas></div></div>
    </div>
    <div class="controls">
      <input id="${pid}Search" placeholder="Search ticker or name…">
      <select id="${pid}StatusF"><option value="">All statuses</option><option>Bear</option><option>Correction</option><option>Normal</option></select>
      <select id="${pid}CatF"><option value="">All categories</option></select>
      <button id="${pid}Load" style="display:none;padding:7px 12px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:8px;font-weight:600;cursor:pointer">↻ Load live prices</button>
    </div>
    <div class="tablewrap"><table id="${pid}Table"></table></div>
    <div class="foot" id="${pid}Foot"></div>`;
  document.getElementById(pid+'Pending').innerHTML = has
    ? `${data.length} ${label}. Drawdown columns are live from the spreadsheet.`
    : `<b>Live prices not yet populated.</b> ${data.length} ${label} are loaded; price / drawdown columns fill in once the workbook is opened in Excel 365 and the dashboard refreshes. Category and search work now.`;
  if(!has) document.getElementById(pid+'StatusCard').style.display='none';
  const c=statusCounts(data),a=avgOff(data);
  document.getElementById(pid+'K').innerHTML=`
    <div class="kpi"><div class="v">${data.length}</div><div class="l">${unit} tracked</div></div>
    <div class="kpi"><div class="v">${has?fmtPct(a):'—'}</div><div class="l">Avg off high</div></div>
    <div class="kpi bear"><div class="v">${c.Bear||0}</div><div class="l">Bear</div></div>
    <div class="kpi corr"><div class="v">${c.Correction||0}</div><div class="l">Correction</div></div>
    <div class="kpi norm"><div class="v">${c.Normal||0}</div><div class="l">Normal</div></div>`;
  // Category trend ranking: score = mean over the category of (½·%vs200dSMA + ½·%vs50dSMA). #1 = strongest.
  const catAgg={};
  data.forEach(x=>{const s=x.category;const o=catAgg[s]||(catAgg[s]={c:0,sc:[],a2:0,n2:0,gc:0,ng:0});o.c++;
    if(x.smapct!=null&&x.sma50pct!=null)o.sc.push(0.5*x.smapct+0.5*x.sma50pct);
    if(x.smapct!=null){o.n2++;if(x.smapct>0)o.a2++;}
    if(x.cross==='Golden Cross'||x.cross==='Death Cross'){o.ng++;if(x.cross==='Golden Cross')o.gc++;}});
  let catList=Object.entries(catAgg).map(([s,o])=>({cat:s,count:o.c,
    score:o.sc.length?o.sc.reduce((a,b)=>a+b,0)/o.sc.length:null,
    above200:o.n2?o.a2/o.n2:null,golden:o.ng?o.gc/o.ng:null}));
  const catScored=catList.some(x=>x.score!=null);
  catList.sort((a,b)=>{if(catScored){const av=a.score==null?-1e9:a.score,bv=b.score==null?-1e9:b.score;if(bv!==av)return bv-av;}return b.count-a.count;});
  let _ck=0;catList.forEach(x=>{x.rank=(x.score!=null)?(++_ck):null;});
  const catShow=catList.slice(0,16);
  const catColor=v=>{if(v==null)return '#9ca3af';const t=Math.max(0,Math.min(1,(v+0.1)/0.2));return t<0.5?mix('#dc2626','#f59e0b',t/0.5):mix('#f59e0b','#16a34a',(t-0.5)/0.5);};
  new Chart(document.getElementById(pid+'Cat'),{type:'bar',
    data:{labels:catShow.map(x=>(x.rank?('#'+x.rank+'  '):'')+x.cat),datasets:[{data:catShow.map(x=>x.count),backgroundColor:catShow.map(x=>catColor(x.score)),borderRadius:6,borderSkipped:false,maxBarThickness:20,categoryPercentage:0.85}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,onClick:(e,els)=>{if(els.length){const cat=catShow[els[0].index].cat;openCategoryRanking(cat,data.filter(x=>x.category===cat),pid);}},layout:{padding:{right:30}},plugins:{legend:{display:false},tooltip:{callbacks:{
      title:items=>catShow[items[0].dataIndex].cat,
      label:cx=>{const x=catShow[cx.dataIndex];const L=[' '+x.count+' funds'];
        if(x.score!=null)L.push(' Trend score '+(x.score>=0?'+':'')+(x.score*100).toFixed(1)+'%');
        if(x.above200!=null)L.push(' '+Math.round(x.above200*100)+'% above 200d SMA');
        if(x.golden!=null)L.push(' '+Math.round(x.golden*100)+'% golden cross');
        return L;}}}},scales:{x:{display:false,beginAtZero:true,grid:{display:false}},y:{grid:{display:false},border:{display:false},ticks:{font:{weight:'600'},color:'#374151'}}}},
    plugins:[barValuePlugin(v=>v,{color:'#6b7280'})]});
  if(has){const sc=statusCounts(data);const labels=['Bear','Correction','Normal'].filter(k=>sc[k]>0);
    new Chart(document.getElementById(pid+'Status'),{type:'doughnut',data:{labels,datasets:[{data:labels.map(k=>sc[k]),backgroundColor:labels.map(k=>C[k]),borderColor:'#fff',borderWidth:3,hoverOffset:8,spacing:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c2=>` ${c2.label}: ${c2.parsed}`}}}},plugins:[centerPlugin(()=>String(labels.reduce((s,k)=>s+sc[k],0)),()=>unit)]});}
  const catSel=document.getElementById(pid+'CatF');
  [...new Set(data.map(x=>x.category))].sort().forEach(s=>{const o=document.createElement('option');o.textContent=s;catSel.appendChild(o);});
  makeTable({tableId:pid+'Table',data,searchId:pid+'Search',footId:pid+'Foot',
    filters:[{id:pid+'StatusF',key:'status'},{id:pid+'CatF',key:'category'}],
    cols:[{key:'ticker',label:'Ticker',render:v=>tkrCell(v,true)},{key:'company',label:'Name'},{key:'category',label:'Category'},
     {key:'divyield',label:'Div Yield (est.)',num:true,fmt:fmtPct},
     {key:'price',label:'Price',num:true,fmt:fmtUsd},{key:'high',label:'52-Wk High',num:true,fmt:fmtUsd},
     {key:'off',label:'% Off High',num:true,fmt:fmtPct,def:true,asc:true},
     {key:'status',label:'Status',render:v=>chip(v)},
     {key:'signal',label:'Drawdown Signal',render:v=>sigCell(v)},
     {key:'recover',label:'% to Recover',num:true,fmt:fmtPct},
     {key:'sma',label:'200d SMA',num:true,fmt:fmtUsd},
     {key:'smapct',label:'% vs 200d SMA',num:true,fmt:fmtPct},
     {key:'sma50',label:'50d SMA',num:true,fmt:fmtUsd},
     {key:'sma50pct',label:'% vs 50d SMA',num:true,fmt:fmtPct},
     {key:'cross',label:'Cross Signal',render:v=>crossCell(v)}]});
  (function(){
    const blanks=data.filter(x=>x.price==null), btn=document.getElementById(pid+'Load');
    if(!btn)return;
    if(!blanks.length||!hasLiveConnector()){btn.style.display='none';return;}
    btn.style.display=''; btn.textContent='↻ Load live prices ('+blanks.length+')';
    btn.onclick=async()=>{
      btn.disabled=true; let done=0,idx=0; const todo=blanks.slice(), tbl=document.getElementById(pid+'Table');
      async function worker(){
        while(idx<todo.length){ const row=todo[idx++];
          try{
            let md=pcGet('ETF:'+row.ticker,DAY);
            if(md===undefined){ const m=await resolveEntity(row.ticker,true); if(m){ md=await BDX.etfMarkdown(m.id); pcSet('ETF:'+row.ticker,md);} else md=null; }
            const mm=md?BDX.etfQuote(md):null; if(mm)Object.assign(row,mm);
          }catch(e){}
          done++; btn.textContent='Loading… '+done+'/'+todo.length;
          if(done%6===0&&tbl&&tbl._render)tbl._render();
        }
      }
      await Promise.all([0,0,0,0].map(()=>worker()));
      buildFundPanel(pid,data,label,unit);
    };
  })();
}
buildFundPanel('etfs',DATA.etfs,'largest US ETFs by assets','ETFs');
buildFundPanel('thematic',DATA.thematic,'thematic ETFs','ETFs');
buildFundPanel('mutualfunds',DATA.mutualfunds,'mutual funds','Funds');
