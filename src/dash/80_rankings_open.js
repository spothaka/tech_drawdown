async function openSectorRanking(sector, comps){
  ov.classList.add('open'); mTitle.textContent=sector+' — company ranking'; mBody.innerHTML='';
  const st=comps.map(c=>({ticker:c.ticker,company:c.company,smapct:c.smapct,
    trend:(c.smapct!=null&&c.sma50pct!=null)?0.5*c.smapct+0.5*c.sma50pct:(c.smapct!=null?c.smapct:(c.sma50pct!=null?c.sma50pct:null)),
    cross:c.cross,off:c.off,fund:undefined}));
  let loaded=0;
  const canLive=hasLiveConnector();
  async function refreshSector(){ var b=document.getElementById('rkRefresh'); if(!b||b.disabled)return; b.disabled=true;
    pcDelKeys(st.map(c=>c.ticker),['F:','CT:']); st.forEach(c=>{c.fund=undefined;}); loaded=0; render();
    await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; var bb=document.getElementById('rkRefresh'); if(bb)bb.textContent='Refreshing… '+loaded+'/'+st.length; render(); });
    var b2=document.getElementById('rkRefresh'); if(b2){b2.disabled=false;b2.textContent='↻ Refresh now';}
    var a=document.getElementById('rkAsOf'); if(a)a.textContent='as of '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}); }
  async function recomputeSectorFund(){ pcDelKeys(st.map(c=>c.ticker),['F:']); st.forEach(c=>{c.fund=undefined;}); loaded=0; render();
    await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; render(); }); }
  RK_HOOKS.sector_company={recompute:recomputeSectorFund};
  function render(){
    const _items=st.map(c=>({id:c.ticker,metrics:_fmSector(c)}));
    const _sc=rankGroup(_items,getRuleset('sector_company'));
    RK_EXPL.sector_company={};
    st.forEach((c,i)=>{ c.comp=_sc[i].composite; RK_EXPL.sector_company[c.ticker]=_sc[i]; });
    const ranked=st.slice().sort((a,b)=>(b.comp==null?-1:b.comp)-(a.comp==null?-1:a.comp));
    let h=`<div class="foot" style="margin-bottom:8px">Ranking by <b>50% fundamentals + 50% SMA trend</b> (percentile-blended within ${esc(sector)}). Fundamentals loaded ${loaded}/${st.length}. <b>Rules-based screen — not financial advice.</b></div>`;
    h+='<table class="mdt"><thead><tr><th>#</th><th>Ticker</th><th>Company</th><th>Score</th><th>Fund</th><th>Trend</th><th>P/E</th><th>D/E</th><th>ROE</th><th>%vs200d</th></tr></thead><tbody>';
    ranked.forEach((c,i)=>{
      h+=`<tr><td>${c.comp!=null?(i+1):'—'}</td>`+
        `<td><a class="tkr" data-tk="${c.ticker}" data-etf="0">${c.ticker}</a>${splitBadge(c.ticker)}${dqBadge(c.ticker)}</td>`+
        `<td>${esc(c.company||'')}</td>`+
        `<td class="rkscore" data-rk="sector_company" data-tk="${c.ticker}" title="Why this score? Click for breakdown" style="font-weight:700;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px">${c.comp!=null?Math.round(c.comp*100):'—'}</td>`+
        `<td>${c.fund===undefined?'…':(c.fund&&c.fund.score!=null?((c.fund.score>=0?'+':'')+c.fund.score.toFixed(2)):'—')}</td>`+
        `<td class="${c.trend!=null&&c.trend<0?'neg':''}">${c.trend!=null?((c.trend*100).toFixed(1)+'%'):'—'}</td>`+
        `<td>${c.fund&&c.fund.pe!=null?c.fund.pe.toFixed(1):'—'}</td>`+
        `<td>${c.fund&&c.fund.de!=null?c.fund.de.toFixed(2):'—'}</td>`+
        `<td>${c.fund&&c.fund.roe!=null?(Math.round(c.fund.roe*100)+'%'):'—'}</td>`+
        `<td class="${c.smapct!=null&&c.smapct<0?'neg':''}">${c.smapct!=null?((c.smapct*100).toFixed(1)+'%'):'—'}</td></tr>`;
    });
    h+='</tbody></table>';
    _rkPaint('sector_company', render, h, canLive?refreshSector:null);
  }
  render();
  if(!hasLiveConnector()){ st.forEach(c=>{c.fund=null;}); loaded=st.length;
    mBody.insertAdjacentHTML('afterbegin','<div class="note">Live fundamentals need a live connector — showing SMA-trend ranking only.</div>'); render(); return; }
  await pool(st,6,async(c)=>{ c.fund=await fetchFund(c.ticker); loaded++; render(); });
}

// ---------- Category fund ranking (Overview·Holdings·Returns·Risk·SMA, equal-weight; live connector) ----------
async function fetchEtfMetrics(ticker){
  const c=pcGet('ETM:'+ticker,DAY);
  if(c) return c;                                              // fresh successful result
  if(c===null && pcGet('ETM:'+ticker,NEG)===null) return null; // recent miss — hold off; stale miss falls through to retry
  try{
    let md=pcGet('ETF:'+ticker,DAY);
    if(md===undefined){ const m=await resolveEntity(ticker,true); if(!m){pcSet('ETM:'+ticker,null);return null;} md=await BDX.etfMarkdown(m.id); pcSet('ETF:'+ticker,md); }
    const res=BDX.etfMetrics(md);
    pcSet('ETM:'+ticker,res); return res;
  }catch(e){ pcSet('ETM:'+ticker,null); return null; }
}
async function openCategoryRanking(cat, funds, pid){
  ov.classList.add('open'); mTitle.textContent=cat+' — fund ranking'; mBody.innerHTML='';
  const full=(pid!=='mutualfunds');
  const st=funds.map(c=>({ticker:c.ticker,company:c.company,smapct:c.smapct,
    trend:(c.smapct!=null&&c.sma50pct!=null)?0.5*c.smapct+0.5*c.sma50pct:(c.smapct!=null?c.smapct:(c.sma50pct!=null?c.sma50pct:null)),
    m: full?undefined:null}));
  let loaded=0;
  const canLive=hasLiveConnector();
  async function refreshFund(){ var b=document.getElementById('rkRefresh'); if(!b||b.disabled)return; b.disabled=true;
    pcDelKeys(st.map(c=>c.ticker),['ETF:','ETM:']); st.forEach(c=>{c.m=undefined;}); loaded=0; render();
    await pool(st,6,async(c)=>{ c.m=await fetchEtfMetrics(c.ticker); loaded++; var bb=document.getElementById('rkRefresh'); if(bb)bb.textContent='Refreshing… '+loaded+'/'+st.length; render(); });
    var b2=document.getElementById('rkRefresh'); if(b2){b2.disabled=false;b2.textContent='↻ Refresh now';}
    var a=document.getElementById('rkAsOf'); if(a)a.textContent='as of '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}); }
  const inv=p=>p==null?null:1-p;
  const avgD=a=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;};
  const pctv=v=>v!=null?((v>=0?'+':'')+v.toFixed(1)+'%'):'—';
  function render(){
    const _fit=st.map(c=>({id:c.ticker,metrics:{trend:c.trend,expense:(c.m&&c.m.expense!=null?c.m.expense:null),premdisc:(c.m&&c.m.premdisc!=null?c.m.premdisc:null),top10:(c.m&&c.m.top10!=null?c.m.top10:null),ret1y:(c.m&&c.m.ret1y!=null?c.m.ret1y:null),ret3m:(c.m&&c.m.ret3m!=null?c.m.ret3m:null),maxdd:(c.m&&c.m.maxdd!=null?c.m.maxdd:null),vol60:(c.m&&c.m.vol60!=null?c.m.vol60:null)}}));
    const _fsc=rankGroup(_fit,getRuleset('fund_category'));
    RK_EXPL.fund_category={};
    st.forEach((c,i)=>{ c.comp=_fsc[i].composite; RK_EXPL.fund_category[c.ticker]=_fsc[i]; });
    const ranked=st.slice().sort((a,b)=>(b.comp==null?-1:b.comp)-(a.comp==null?-1:a.comp));
    let h=`<div class="foot" style="margin-bottom:8px">Ranking by <b>${full?'equal-weight: Overview · Holdings · Returns · Risk · SMA trend':'SMA trend only'}</b> (percentile-blended within ${esc(cat)}). ${full?('Loaded '+loaded+'/'+st.length+'. '):''}<b>Rules-based screen — not financial advice.</b></div>`;
    if(!full) h+='<div class="note" style="margin-bottom:8px">Fund overview / holdings / returns / risk aren\'t available for mutual funds via the connector — ranking by 50d/200d SMA trend only.</div>';
    h+='<div style="overflow:auto"><table class="mdt"><thead><tr><th>#</th><th>Ticker</th><th>Name</th><th>Score</th>'+(full?'<th>1Y</th><th>Max DD</th><th>Vol 60D</th><th>Expense</th><th>Top-10</th>':'')+'<th>%vs200d</th></tr></thead><tbody>';
    ranked.forEach((c,i)=>{
      h+=`<tr><td>${c.comp!=null?(i+1):'—'}</td>`+
        `<td><a class="tkr" data-tk="${c.ticker}" data-etf="1">${c.ticker}</a>${splitBadge(c.ticker)}${dqBadge(c.ticker)}</td>`+
        `<td>${esc(c.company||'')}</td>`+
        `<td class="rkscore" data-rk="fund_category" data-tk="${c.ticker}" title="Why this score? Click for breakdown" style="font-weight:700;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px">${c.comp!=null?Math.round(c.comp*100):'—'}</td>`;
      if(full){const m=c.m;
        h+=`<td class="${m&&m.ret1y<0?'neg':''}">${m===undefined?'…':(m&&m.ret1y!=null?pctv(m.ret1y):'—')}</td>`+
          `<td class="neg">${m&&m.maxdd!=null?pctv(m.maxdd):'—'}</td>`+
          `<td>${m&&m.vol60!=null?m.vol60.toFixed(1)+'%':'—'}</td>`+
          `<td>${m&&m.expense!=null?m.expense.toFixed(2)+'%':'—'}</td>`+
          `<td>${m&&m.top10!=null?Math.round(m.top10)+'%':'—'}</td>`;
      }
      h+=`<td class="${c.smapct!=null&&c.smapct<0?'neg':''}">${c.smapct!=null?(c.smapct*100).toFixed(1)+'%':'—'}</td></tr>`;
    });
    h+='</tbody></table></div>';
    _rkPaint('fund_category', render, h, (full&&canLive)?refreshFund:null);
  }
  render();
  if(full && !hasLiveConnector()){ st.forEach(c=>{c.m=null;}); loaded=st.length;
    mBody.insertAdjacentHTML('afterbegin','<div class="note">Live fund data needs a live connector — showing SMA-trend ranking only.</div>'); render(); return; }
  if(full){ await pool(st,6,async(c)=>{ c.m=await fetchEtfMetrics(c.ticker); loaded++; render(); }); }
}

// ---------- Risk summary (World events · Financial · Market; live connector) ----------
