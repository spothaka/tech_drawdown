function lpMarketable(h){ return h.type==='Equity/ETF'||h.type==='Mutual Fund'; }
function companyLiveMetrics(t){
  const pm=t&&t.price_performance&&t.price_performance.current_market;
  const ov=t&&t.company_overview;
  const price=(pm&&pm.current_price!=null)?pm.current_price:(ov&&ov.price!=null?ov.price:null);
  if(price==null)return null;
  const high=pm?pm.year_high:null, sma50=pm?pm.price_avg_50:null, sma200=pm?pm.price_avg_200:null;
  const off=high?price/high-1:null;
  const status=off==null?'—':(off<=-0.2?'Bear':off<=-0.1?'Correction':'Normal');
  const cross=(sma50!=null&&sma200!=null)?(Math.abs(sma50-sma200)<1e-9?'—':(sma50>=sma200?'Golden Cross':'Death Cross')):'—';
  return {price,high,off,status,sma:sma200,smapct:sma200?price/sma200-1:null,sma50,sma50pct:sma50?price/sma50-1:null,cross,
    recover:(high&&price)?high/price-1:null};
}
async function resolveTyped(ticker){
  const ek='STY:'+ticker; const c=pcGet(ek,30*DAY);
  if(c) return c;                                      // cached resolution
  if(c===null && pcGet(ek,NEG)===null) return null;    // recent miss — hold off; stale miss re-resolves
  const TU=String(ticker).toUpperCase();
  if(TKR_ALIAS[TU]){ const v={id:TKR_ALIAS[TU].id,name:TKR_ALIAS[TU].name,isETF:false}; pcSet(ek,v); return v; }
  let v=null;
  try{
    const rows=await BDX.search(ticker);
    let m=rows.find(x=>(x.listing_values||[]).some(l=>String(l).toUpperCase().endsWith(':'+TU)));
    if(!m) m=rows.find(x=>x.security_type==='ETF')||rows.find(x=>x.security_type==='COMPANY'&&x.listing_type==='PUBLIC')||rows[0];
    if(m) v={id:m.id,name:m.name,isETF:m.security_type==='ETF'};
  }catch(e){ v=null; }
  pcSet(ek,v); return v;
}
async function livePrice(ticker){
  const c=pcGet('LP:'+ticker,DAY);
  if(c) return c;                                        // cached price
  if(c===null && pcGet('LP:'+ticker,NEG)===null) return null; // recent miss — hold off; stale miss reprices
  let res=null;
  try{
    const m=await resolveTyped(ticker);
    if(m){
      if(m.isETF){
        let md=pcGet('ETF:'+ticker,DAY);
        if(md===undefined){ md=await BDX.etfMarkdown(m.id); pcSet('ETF:'+ticker,md); }
        res=md?BDX.etfQuote(md):null;
      } else {
        const t=await BDX.companyTearsheet(m.id,['company_overview']);
        res=BDX.companyQuote(t);
      }
    }
  }catch(e){ res=null; }
  pcSet('LP:'+ticker,res); return res;
}
function attachLivePrices(cfg){
  LIVECFG[cfg.key]=cfg;
  const btn=document.getElementById(cfg.btnId), stamp=document.getElementById(cfg.stampId);
  if(stamp) stamp.textContent=_lpAsOf?('Live prices as of '+_lpAsOf):'';
  if(!btn) return;
  if(!hasLiveConnector()){ btn.style.display='none'; return; }
  const n=cfg.raw.filter(lpMarketable).length;
  btn.style.display=''; btn.textContent='↻ Load live prices ('+n+')';
  btn.onclick=()=>runLive(cfg,true);
}
function autoLive(key){
  if(!hasLiveConnector()) return;
  if(pcGet('LPAUTO:'+key,DAY)!==undefined) return;
  const cfg=LIVECFG[key]; if(cfg) runLive(cfg,false);
}
async function runLive(cfg,force){
  const marketable=cfg.raw.filter(lpMarketable);
  if(force){ marketable.forEach(h=>{ if(('LP:'+h.ticker) in _pc){ delete _pc['LP:'+h.ticker]; _pcDirty=true; } }); }
  const btn=document.getElementById(cfg.btnId); if(btn) btn.disabled=true;
  let done=0,idx=0; const todo=marketable.slice();
  async function worker(){ while(idx<todo.length){ const h=todo[idx++];
    try{ const mm=await livePrice(h.ticker); if(mm) LIVEPX[h.ticker]=mm; }catch(e){}
    done++; if(btn) btn.textContent='Loading… '+done+'/'+todo.length; } }
  await Promise.all([0,0,0,0].map(()=>worker()));
  pcSet('LPAUTO:'+cfg.key,Date.now());
  _lpAsOf=new Date().toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  cfg.rebuild(cfg.raw);
  if(_retRecompute) _retRecompute();
}
