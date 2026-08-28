// ---------- Change-alert popup (opened by the inline .alertb badge on held tickers) ----------
// Reuses the shared modal (ov / mTitle / mBody from 74_fundamentals) and the .tkr handler
// (the "View fundamentals" link inside the popup routes to openTicker). Data is DATA.alerts,
// keyed by ticker, produced by scripts/build_alerts.py (pure yesterday-vs-today diff).
function openAlert(tk){
  var A=(DATA.alerts||{})[tk]; if(!A) return;
  var sev=A.sev||'warn';
  var col=(sev==='good')?'#16a34a':((A.kind==='correction'||A.kind==='low52')?'#b45309':'#dc2626');
  function pct(x){ return (x==null)?'—':((x<0?'−':'+')+Math.abs(x*100).toFixed(1)+'%'); }
  function rw(label,val){ return '<div style="color:var(--muted)">'+esc(label)+'</div><div>'+val+'</div>'; }
  var det='';
  var f=A.from||{}, t=A.to||{};
  if(f.status&&t.status&&f.status!==t.status) det+=rw('Status', esc(f.status)+' → <b style="color:'+col+'">'+esc(t.status)+'</b>');
  if(f.off!=null&&t.off!=null) det+=rw('Off high', pct(f.off)+' → <b>'+pct(t.off)+'</b>');
  if(A.cross) det+=rw('Trend', esc(A.cross));
  if(t.price!=null) det+=rw('Price', '$'+Number(t.price).toLocaleString());
  var hist=(A.history||[]).map(function(h){
    return '<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--line)"><span style="color:#9ca3af;width:72px;flex:none">'+esc(h.date||'')+'</span><span>'+esc(h.text||'')+'</span></div>';
  }).join('');
  mTitle.innerHTML=esc(tk)+' · <span style="color:'+col+'">'+esc(A.label||'change')+'</span>';
  mBody.innerHTML=
    '<div class="foot" style="margin-top:0">'+esc(A.account||'')+' · '+esc(A.date||'')+'</div>'
    +(det?('<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px;margin-top:10px;border-top:1px solid var(--line);padding-top:12px">'+det+'</div>'):'')
    +(hist?('<div class="foot" style="margin:14px 0 4px">Recent changes · last 14 days</div>'+'<div style="font-size:12.5px">'+hist+'</div>'):'')
    +'<div style="margin-top:14px"><a class="tkr" data-tk="'+esc(tk)+'" data-etf="0" style="font-size:12.5px;padding:6px 12px;border:1px solid var(--line);border-radius:8px;cursor:pointer;text-decoration:none;color:var(--ink)">View fundamentals ↗</a></div>'
    +'<div class="foot" style="margin-top:12px">Compares today’s snapshot against yesterday for names you hold. Corrupt or missing price rows are skipped. Informational, not advice.</div>';
  ov.classList.add('open');
}
document.addEventListener('click', function(e){
  var b=e.target&&e.target.closest&&e.target.closest('.alertb');
  if(b){ e.preventDefault(); e.stopPropagation(); openAlert(b.getAttribute('data-alert')); }
});
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter'&&e.key!==' ') return;
  var b=document.activeElement;
  if(b&&b.classList&&b.classList.contains('alertb')){ e.preventDefault(); openAlert(b.getAttribute('data-alert')); }
});
