// ===================== COLUMN GLOSSARY — layman tooltips (English; i18n-ready) =====================
// GLOSS_DATA + GLOSS_LANG come from the generated 12_glossary_data.js (loaded just before this).
var GLOSS = (function(){
  function norm(s){ return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,''); }
  var DICT = (typeof GLOSS_DATA!=='undefined' && GLOSS_DATA[GLOSS_LANG]) ? GLOSS_DATA[GLOSS_LANG] : {};
  var EN   = (typeof GLOSS_DATA!=='undefined' && GLOSS_DATA['en']) ? GLOSS_DATA['en'] : DICT;
  // index: normalized header string -> key (built from each entry's label + match[])
  var IDX = {};
  Object.keys(EN).forEach(function(k){
    var e = EN[k], names = [e.label].concat(e.match||[]);
    names.forEach(function(n){ var nk=norm(n); if(nk && !(nk in IDX)) IDX[nk]=k; });
  });
  function entry(key){ return DICT[key] || EN[key] || null; }        // current lang, fall back to English
  function keyFor(headerText){ return IDX[norm(headerText)] || null; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  // wrap a header label in the hover affordance (returns plain label if unknown)
  function hcol(label){
    var key = keyFor(label); if(!key) return esc(label);
    var e = entry(key), disp = (e && e.label) || label;
    var tip = ((e&&e.full)?e.full:'') + ((e&&e.plain)?(' — '+e.plain):'');
    return '<span class="hcol" tabindex="0" role="button" data-g="'+key+'" aria-label="'+esc(disp)+': '+esc(tip)+'">'+esc(disp)+'<span class="hci" aria-hidden="true">&#9432;</span></span>';
  }
  // decorate header cells inside an HTML fragment (hand-built + markdown tables); idempotent
  function decorateHeaders(html){
    if(!html || html.indexOf('<th')<0) return html;
    return html.replace(/<th\b([^>]*)>([\s\S]*?)<\/th>/g, function(m, attrs, inner){
      if(/class=["'][^"']*hcol/.test(m) || /class=["'][^"']*hcol/.test(inner)) return m; // already done
      var text = inner.replace(/<[^>]+>/g,'').trim();
      if(!text) return m;
      var key = keyFor(text); if(!key) return m;
      return '<th'+attrs+'>'+hcol(text)+'</th>';
    });
  }
  // ---- tooltip bubble (styled; native title is the no-JS fallback) ----
  var bub=null;
  function ensureBubble(){ if(bub) return bub; bub=document.createElement('div'); bub.className='gtip'; bub.setAttribute('role','tooltip'); document.body.appendChild(bub); return bub; }
  function show(el){
    var key=el.getAttribute('data-g'); var e=entry(key); if(!e) return;
    var b=ensureBubble();
    b.innerHTML='<b>'+esc(e.full||e.label||'')+'</b>'+(e.plain?('<span class="p">'+esc(e.plain)+'</span>'):'');
    b.style.display='block'; b.style.visibility='hidden';
    var r=el.getBoundingClientRect(), bw=b.offsetWidth, bh=b.offsetHeight, pad=8;
    var left=Math.min(Math.max(pad, r.left), window.innerWidth-bw-pad);
    var top=r.bottom+6; if(top+bh>window.innerHeight-pad) top=r.top-bh-6;   // flip above if no room
    b.style.left=left+'px'; b.style.top=top+'px'; b.style.visibility='visible';
  }
  function hide(){ if(bub) bub.style.display='none'; }
  document.addEventListener('mouseover', function(ev){ var el=ev.target&&ev.target.closest&&ev.target.closest('.hcol'); if(el) show(el); });
  document.addEventListener('mouseout',  function(ev){ var el=ev.target&&ev.target.closest&&ev.target.closest('.hcol'); if(el) hide(); });
  document.addEventListener('focusin',   function(ev){ var el=ev.target&&ev.target.closest&&ev.target.closest('.hcol'); if(el) show(el); });
  document.addEventListener('focusout',  hide);
  // touch: tap toggles (no hover on touch devices)
  document.addEventListener('click', function(ev){ if(!(window.matchMedia&&window.matchMedia('(hover: none)').matches)) return; var el=ev.target&&ev.target.closest&&ev.target.closest('.hcol'); if(el){ if(bub&&bub.style.display==='block') hide(); else show(el); } });
  document.addEventListener('keydown', function(ev){ if(ev.key==='Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  return { hcol:hcol, decorateHeaders:decorateHeaders, keyFor:keyFor };
})();
function hcol(label){ return GLOSS.hcol(label); }
function decorateHeaders(html){ return GLOSS.decorateHeaders(html); }
