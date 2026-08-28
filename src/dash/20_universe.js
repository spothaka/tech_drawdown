const TABKEYS=['sp','nasdaq','dow','etfs','thematic','mutualfunds'];
const TABLABEL={sp:'S&P',nasdaq:'NDX',dow:'DOW',etfs:'ETF',thematic:'THM',mutualfunds:'MF'};
const TABNAME={sp:'S&P 500',nasdaq:'Nasdaq-100',dow:'Dow Jones',etfs:'Top 100 ETFs',thematic:'Thematic ETFs',mutualfunds:'Mutual Funds'};
const TABCOL={sp:'#1F3864',nasdaq:'#2E75B6',dow:'#0F766E',etfs:'#B07D04',thematic:'#7C3AED',mutualfunds:'#6B7280'};
function uniqUniverse(){
  const m=new Map();
  TABKEYS.forEach(k=>(DATA[k]||[]).forEach(r=>{
    if(!r||!r.ticker)return;
    const e=m.get(r.ticker);
    if(!e){ const n=Object.assign({},r); n.tabs=[k]; m.set(r.ticker,n); }
    else{ if(!e.tabs.includes(k))e.tabs.push(k);
      if(e.off==null && r.off!=null){ const tabs=e.tabs; const n=Object.assign({},r); n.tabs=tabs; m.set(r.ticker,n); } }
  }));
  const arr=[...m.values()]; arr.forEach(e=>{ e._isetf=e.tabs.some(k=>k==='etfs'||k==='thematic'); }); return arr;
}
function tabChips(tabs){ return (tabs||[]).map(k=>`<span title="${TABNAME[k]||k}" style="display:inline-block;font-size:8.5px;font-weight:700;color:#fff;background:${TABCOL[k]};border-radius:8px;padding:0 5px;margin-left:3px;vertical-align:1px">${TABLABEL[k]}</span>`).join(''); }
