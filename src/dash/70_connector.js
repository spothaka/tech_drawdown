const BD='mcp__19cd706c-b33d-4ada-ab87-ccf9b2b5e357__';
const FMP='mcp__babebb48-cec8-4712-9cc1-edbc77f0e0d0__';  // FMP connector (DCF endpoint)
const fundCache={};
// ---------- Persistent fundamentals cache (localStorage; weekly TTL, sentiment daily) ----------
const DAY=864e5, NEG=15*6e4; // data caches use DAY (24h); NEG = retry TTL for connector misses (15 min)
const PCACHE_KEY='tdd_pcache_v5';
let _pc={}; try{ _pc=JSON.parse(localStorage.getItem(PCACHE_KEY)||'{}')||{}; }catch(e){ _pc={}; }
let _pcDirty=false, _pcT=null;
function _pcFlush(){ if(!_pcDirty)return; _pcDirty=false; try{ localStorage.setItem(PCACHE_KEY,JSON.stringify(_pc)); }catch(e){ const ents=Object.entries(_pc).sort((a,b)=>a[1].ts-b[1].ts); for(let i=0;i<Math.ceil(ents.length/3);i++) delete _pc[ents[i][0]]; try{localStorage.setItem(PCACHE_KEY,JSON.stringify(_pc));}catch(_){} } }
function pcGet(key,ttl){ const e=_pc[key]; if(e&&(Date.now()-e.ts)<ttl) return e.v; return undefined; }
function pcSet(key,v){ _pc[key]={v,ts:Date.now()}; _pcDirty=true; clearTimeout(_pcT); _pcT=setTimeout(_pcFlush,800); }
function pcDel(tk){ ['CT:','SENT:','ETF:','EID:','F:','ETM:'].forEach(p=>{ if((p+tk) in _pc){delete _pc[p+tk]; _pcDirty=true;} }); _pcFlush(); }
function pcDelKeys(tickers,prefixes){ tickers.forEach(function(tk){ prefixes.forEach(function(p){ if((p+tk) in _pc){ delete _pc[p+tk]; _pcDirty=true; } }); }); _pcFlush(); }
const TKR_ALIAS={GOOG:{id:'4A6F00',name:'Alphabet Inc.'},GOOGL:{id:'4A6F00',name:'Alphabet Inc.'}};
async function resolveEntity(ticker,isETF){
  const ek='EID:'+ticker; const c=pcGet(ek,30*DAY);
  if(c) return c;                                      // cached resolution
  if(c===null && pcGet(ek,NEG)===null) return null;    // recent miss — hold off; stale miss re-resolves
  const TU=String(ticker).toUpperCase();
  if(!isETF && TKR_ALIAS[TU]){ const v=TKR_ALIAS[TU]; pcSet(ek,v); return v; }
  const rows=await BDX.search(ticker);
  let m=rows.find(x=>x.security_type===(isETF?'ETF':'COMPANY') && (x.listing_values||[]).some(l=>String(l).toUpperCase().endsWith(':'+TU)));
  if(!m)m=isETF?rows.find(x=>x.security_type==='ETF'):rows.find(x=>x.security_type==='COMPANY'&&x.listing_type==='PUBLIC');
  if(!m)m=rows[0];
  const v=m?{id:m.id,name:m.name}:null; pcSet(ek,v); return v;
}
