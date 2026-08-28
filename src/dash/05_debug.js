// ===================== DEBUG (opt-in: ?debug=1 or Shift+D) =====================
// Hoisted: later modules (50/60/72/74/80) call these during panel build / live fetch.
function liveMcpTransport(){
  return (typeof window!=='undefined' && (window.liveMcp||window.mcp)) || null;
}
function hasLiveConnector(){
  var t=liveMcpTransport();
  return !!(t && t.callMcpTool);
}
var DBG=(function(){
  var BUF=[], MAX=500, on=false, open=false, el=null, tab='events';
  try{ on = (new URLSearchParams(location.search).get('debug')==='1') || (localStorage.getItem('tdd_debug')==='1'); }catch(e){}
  var COLOR={OK:'#1D9E75',INFO:'#2E75B6',WARN:'#B07D04',ERROR:'#C0392B'};
  function esc2(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function fmtAgo(t){ var s=Math.round((Date.now()-t)/1000); return s<60?s+'s':Math.round(s/60)+'m'; }
  function push(level,tag,msg,ctx){
    var e={t:Date.now(),level:(level||'INFO'),tag:tag||'',msg:msg||'',ctx:ctx||null};
    BUF.push(e); if(BUF.length>MAX) BUF.shift();
    if(on){ try{ var f=level==='ERROR'?console.error:(level==='WARN'?console.warn:console.log); f('[DBG] '+e.tag, e.msg, e.ctx||''); }catch(_){} if(open) render(); }
    return e;
  }
  function timer(tag,msg){ var t0=Date.now(); return function(ok,ctx){ ctx=ctx||{}; ctx.ms=Date.now()-t0; push(ok===false?'ERROR':'OK', tag, msg+(ok===false?' failed':''), ctx); }; }
  function provenance(){
    var D=(typeof DATA!=='undefined'&&DATA)?DATA:{}, tabs=['sp','nasdaq','dow','etfs','thematic','mutualfunds'], out=[], err=0, miss=0, tot=0;
    tabs.forEach(function(k){ var a=D[k]||[]; tot+=a.length; a.forEach(function(r){ if(r.dq==='error')err++; else if(r.dq==='missing')miss++; }); out.push([k,(D[k]||[]).length]); });
    return { tabs:out, total:tot, dqErr:err, dqMiss:miss,
      index:D.indexHistory?Object.keys(D.indexHistory).length:0,
      macro:(D.macroHistory&&D.macroHistory.series)?D.macroHistory.series.length:0,
      ira:(D.ira||[]).length, brokerage:(D.brokerage||[]).length, coreRank:(D.coreRank||[]).length,
      splits:D.splits?Object.keys(D.splits).length:0, asof:(D.macroHistory&&D.macroHistory.asof)||null };
  }
  function cacheStats(){ var raw=''; try{ raw=localStorage.getItem('tdd_pcache_v5')||''; }catch(e){} var n=0; try{ n=Object.keys(JSON.parse(raw||'{}')).length; }catch(e){} return {bytes:raw.length, entries:n}; }
  function env(){ var art=hasLiveConnector(); return {mode:art?'live connector reachable':'static / file:// — no connector', ua:(typeof navigator!=='undefined'?navigator.userAgent:''), debug:on, events:BUF.length}; }
  function report(){
    var p=provenance(), c=cacheStats(), e=env(), L=['Tech Drawdown — debug report', new Date().toISOString(), '',
      'ENV: '+e.mode, 'UA: '+e.ua, '',
      'PROVENANCE: '+p.total+' universe rows · dq error '+p.dqErr+' · missing '+p.dqMiss,
      '  tabs '+p.tabs.map(function(x){return x[0]+':'+x[1];}).join(' '),
      '  index '+p.index+'/4 · macro '+p.macro+'/10 · ira '+p.ira+' · brokerage '+p.brokerage+' · coreRank '+p.coreRank+' · splits '+p.splits,
      '  as_of '+(p.asof||'—'), '',
      'CACHE: '+c.entries+' entries · '+c.bytes+' bytes (tdd_pcache_v5)', '', 'EVENTS (last 50):'];
    BUF.slice(-50).forEach(function(x){ L.push('  '+new Date(x.t).toISOString().slice(11,19)+' ['+x.level+'] '+x.tag+' — '+x.msg+(x.ctx?(' '+JSON.stringify(x.ctx)):'')); });
    return L.join('\n');
  }
  function render(){
    if(!el) return; var body=el.querySelector('.dbgbody'); if(!body) return;
    if(tab==='events'){
      body.innerHTML=BUF.slice(-140).reverse().map(function(x){
        return '<div class="dbgrow"><span class="dbglv" style="color:'+(COLOR[x.level]||'#888')+'">'+x.level+'</span>'
          +'<span class="dbgtag">'+esc2(x.tag)+'</span><span>'+esc2(x.msg)+'</span>'
          +'<span class="dbgms">'+(x.ctx&&x.ctx.ms!=null?(x.ctx.ms+'ms'):fmtAgo(x.t))+'</span></div>';
      }).join('')||'<div class="dbgmuted">no events yet</div>';
    } else if(tab==='prov'){
      var p=provenance();
      body.innerHTML='<div class="dbgkv"><b>'+p.total+'</b> universe rows · dq error <b>'+p.dqErr+'</b> · missing <b>'+p.dqMiss+'</b></div>'
        +'<div class="dbgkv">'+p.tabs.map(function(x){return x[0]+' '+x[1];}).join(' · ')+'</div>'
        +'<div class="dbgkv">index <b>'+p.index+'/4</b> · macro <b>'+p.macro+'/10</b> · as_of '+esc2(p.asof||'—')+'</div>'
        +'<div class="dbgkv">ira '+p.ira+' · brokerage '+p.brokerage+' · coreRank '+p.coreRank+' · splits '+p.splits+'</div>';
    } else if(tab==='cache'){
      var c=cacheStats();
      body.innerHTML='<div class="dbgkv"><b>'+c.entries+'</b> entries · '+c.bytes+' bytes <span class="dbgmuted">(tdd_pcache_v5)</span></div><button class="dbgbtn" id="dbgClear">Clear cache</button>';
      var b=body.querySelector('#dbgClear'); if(b) b.onclick=function(){ try{ localStorage.removeItem('tdd_pcache_v5'); }catch(e){} push('INFO','cache','cleared by user'); render(); };
    } else {
      var ev=env();
      body.innerHTML='<div class="dbgkv">'+esc2(ev.mode)+'</div><div class="dbgkv dbgmuted">'+esc2(ev.ua)+'</div><div class="dbgkv">events buffered: '+ev.events+' · debug '+(on?'ON':'OFF')+'</div>';
    }
  }
  function build(){
    el=document.createElement('div'); el.className='dbgpanel';
    el.innerHTML='<div class="dbghd"><b>🐞 Debug</b><span class="dbgx" title="close (Shift+D)">×</span></div>'
      +'<div class="dbgtabs"><span data-t="events">Events</span><span data-t="prov">Provenance</span><span data-t="cache">Cache</span><span data-t="env">Env</span></div>'
      +'<div class="dbgbody"></div>'
      +'<div class="dbgft"><span class="dbgmuted">ring · last '+MAX+' · in-memory</span><button class="dbgbtn" id="dbgCopy">⧉ Copy report</button></div>';
    document.body.appendChild(el);
    el.querySelector('.dbgx').onclick=function(){ toggle(false); };
    var spans=el.querySelectorAll('.dbgtabs span');
    spans.forEach(function(s){ s.onclick=function(){ tab=s.getAttribute('data-t'); spans.forEach(function(z){z.classList.remove('on');}); s.classList.add('on'); render(); }; });
    if(spans[0]) spans[0].classList.add('on');
    el.querySelector('#dbgCopy').onclick=function(){ var t=report(); try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t); }catch(e){} var b=el.querySelector('#dbgCopy'), o=b.textContent; b.textContent='✓ copied'; setTimeout(function(){b.textContent=o;},1200); };
  }
  function toggle(force){
    open=(force===undefined)?!open:!!force; if(open) on=true;
    try{ localStorage.setItem('tdd_debug', open?'1':'0'); }catch(e){}
    if(open){ if(!el)build(); el.style.display='flex'; render(); } else if(el){ el.style.display='none'; }
  }
  try{ window.addEventListener('error', function(ev){ push('ERROR','window',(ev&&ev.message)||'error',{src:ev&&ev.filename,line:ev&&ev.lineno}); }); }catch(e){}
  try{ window.addEventListener('unhandledrejection', function(ev){ push('ERROR','promise', String((ev&&ev.reason&&ev.reason.message)||(ev&&ev.reason)||'rejection')); }); }catch(e){}
  try{ document.addEventListener('keydown', function(ev){ if(ev.shiftKey && (ev.key==='D'||ev.key==='d') && !/input|textarea|select/i.test((ev.target&&ev.target.tagName)||'')){ ev.preventDefault(); toggle(); } }); }catch(e){}
  if(on){ try{ if(document.body) toggle(true); else document.addEventListener('DOMContentLoaded', function(){ toggle(true); }); }catch(e){} }
  return { log:push, timer:timer, toggle:toggle, report:report, provenance:provenance, enabled:function(){return on;} };
})();
