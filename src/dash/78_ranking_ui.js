async function fetchFund(ticker){
  const c=pcGet('F:'+ticker,DAY);
  if(c) return c;                                            // fresh successful result
  if(c===null && pcGet('F:'+ticker,NEG)===null) return null; // recent miss — hold off; stale miss falls through to retry
  const ct=pcGet('CT:'+ticker,DAY);
  if(ct){ const k=ct.k||{}; const res=_fundRes(k); pcSet('F:'+ticker,res); return res; }
  try{
    const m=await resolveEntity(ticker,false);
    if(!m){pcSet('F:'+ticker,null);return null;}
    const t=await BDX.companyTearsheet(m.id,['financial_ratios','key_metrics']);
    const k=BDX.companyK(t);
    const res=_fundRes(k);
    pcSet('F:'+ticker,res); return res;
  }catch(e){ pcSet('F:'+ticker,null); return null; }
}
function pctRanks(vals){
  const idx=vals.map((v,i)=>[v,i]).filter(p=>p[0]!=null).sort((a,b)=>a[0]-b[0]);
  const out=new Array(vals.length).fill(null), n=idx.length;
  idx.forEach((p,r)=>{ out[p[1]]= n>1? r/(n-1) : 1; });
  return out;
}
async function pool(items,n,worker){ let i=0; await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{ while(i<items.length){ const idx=i++; await worker(items[idx]); } })); }
// ===== Ranking rules editor (V2 Phase 3) — drives getRuleset() via RANK_STORE =====
function _rkClone(o){return JSON.parse(JSON.stringify(o));}
function _rkApply(id){
  var rs=_rkClone(getRuleset(id));
  (rs.dimensions||[]).forEach(function(d){var el=document.getElementById('rkw_'+id+'_'+d.id); if(el) d.weight=+el.value;});
  (rs.factors||[]).forEach(function(f){var t=document.getElementById('rkf_'+id+'_'+f.id), w=document.getElementById('rkfw_'+id+'_'+f.id);
    if(t){ if(!t.checked){f.weight=0;} else if(w){f.weight=+w.value;} else if(f.weight===0){delete f.weight;} }});
  RANK_STORE.setActive(id,rs);
}
function _rkApplyThresholds(){
  var cf=_rkClone(getRuleset('company_fundamentals'));
  cf.factors.forEach(function(f){
    if(f.type==='boolAbove'){ var t=document.getElementById('rkth_'+f.id); if(t&&t.value!=='')f.threshold=+t.value; }
    else { var g=document.getElementById('rkg_'+f.id), b=document.getElementById('rkb_'+f.id);
      if(g&&g.value!=='')f.good=+g.value; if(b&&b.value!=='')f.bad=+b.value; }
  });
  RANK_STORE.setActive('company_fundamentals',cf);
}
function _rkRecomputeFund(id){ var hk=RK_HOOKS[id]; if(hk&&hk.recompute) hk.recompute(); }
function _rkThresholdsHTML(){
  var cf=getRuleset('company_fundamentals'), mod=RANK_STORE.isModified('company_fundamentals');
  var h='<div style="border-top:1px solid #E5E7EB;margin-top:8px;padding-top:8px">';
  h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><b style="font-size:12px">Fundamentals thresholds</b>'
    +'<span id="rkmod_company_fundamentals" style="display:'+(mod?'inline-block':'none')+';font-size:10.5px;padding:1px 7px;border-radius:20px;background:#FFF3CD;color:#92610a">modified</span>'
    +'<span style="flex:1"></span><button class="rkbtn" data-a="resetcf">Reset</button></div>';
  h+='<div class="foot" style="margin-bottom:6px">good = scores +1, bad = scores −1; feeds the Fundamentals factor. Margins/yields are fractions (0.20 = 20%).</div>';
  cf.factors.forEach(function(f){
    h+='<div style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:11.5px"><span style="width:118px">'+esc(f.label||f.id)+'</span>';
    if(f.type==='boolAbove'){ h+='<span style="width:30px;text-align:right;color:#888">thr</span><input type="number" step="any" id="rkth_'+f.id+'" value="'+(f.threshold==null?'':f.threshold)+'" style="width:66px;font-size:11px">'; }
    else { h+='<span style="width:30px;text-align:right;color:#16a34a">good</span><input type="number" step="any" id="rkg_'+f.id+'" value="'+(f.good==null?'':f.good)+'" style="width:62px;font-size:11px">'
        +'<span style="width:24px;text-align:right;color:#dc2626">bad</span><input type="number" step="any" id="rkb_'+f.id+'" value="'+(f.bad==null?'':f.bad)+'" style="width:62px;font-size:11px">'; }
    h+='</div>';
  });
  return h+'</div>';
}
function _fundRes(k){ return {score:fundScoreNorm(k), pe:k.price_to_earnings_ratio_ttm, ps:k.price_to_sales_ratio_ttm, pb:k.price_to_book_ratio_ttm, ev:k.ev_to_ebitda_ttm, roe:k.return_on_equity_ttm, roa:k.return_on_assets_ttm, gm:k.gross_profit_margin_ttm, nm:k.net_profit_margin_ttm, de:k.debt_to_equity_ratio_ttm, cr:k.current_ratio_ttm, div:k.dividend_yield_ttm, fcf:k.free_cash_flow_yield_ttm}; }
function _fmSector(c){ var f=c.fund||{}; return {trend:c.trend, fundScore:(f.score!=null?f.score:null), pe:f.pe, ps:f.ps, pb:f.pb, ev:f.ev, roe:f.roe, roa:f.roa, gm:f.gm, nm:f.nm, de:f.de, cr:f.cr, div:f.div, fcf:f.fcf, cross:c.cross, smapct:c.smapct, off:c.off}; }
function _rkCondFields(){ return [
  {v:'factor:trend',l:'Trend %ile'},{v:'factor:fund',l:'Fund %ile'},{v:'composite',l:'Composite'},
  {v:'metric:pe',l:'P/E'},{v:'metric:ps',l:'P/S'},{v:'metric:pb',l:'P/B'},{v:'metric:ev',l:'EV/EBITDA'},
  {v:'metric:roe',l:'ROE'},{v:'metric:roa',l:'ROA'},{v:'metric:gm',l:'Gross margin'},{v:'metric:nm',l:'Net margin'},
  {v:'metric:de',l:'Debt/Equity'},{v:'metric:cr',l:'Current ratio'},{v:'metric:div',l:'Div yield'},{v:'metric:fcf',l:'FCF yield'},
  {v:'metric:cross',l:'Cross',str:true},{v:'metric:smapct',l:'%vs200d'},{v:'metric:off',l:'Off high'} ]; }
function _rkCondLabel(field){ var m={}; _rkCondFields().forEach(function(f){m[f.v]=f.l;}); return m[field]||field; }
function _rkCondSummary(c){ if(!c)return ''; var w=c.when||{}, a=c.action||{};
  var opm={lt:'<',lte:'≤',gt:'>',gte:'≥',eq:'=',ne:'≠',in:'in',between:'between'};
  var cond=(w.all||w.any||w.not)?'(advanced)':(_rkCondLabel(w.field)+' '+(opm[w.op]||w.op)+' '+w.value);
  var act=a.type==='gate'?'exclude':a.type==='bonus'?('+'+a.amount):a.type==='penalty'?('−'+a.amount):a.type==='cap'?('cap '+a.value):a.type==='floor'?('floor '+a.value):a.type;
  return cond+' → '+act; }
function _rkFiredHTML(id,d){ if(!d)return ''; var cm={}; (getRuleset(id).conditions||[]).forEach(function(c){cm[c.id]=c;});
  var lab=function(fid){ return _rkCondSummary(cm[fid])||fid; };
  if(d.excluded){ return '<div style="margin-top:8px;color:#dc2626;font-weight:600">Excluded'+((d.fired&&d.fired.length)?': '+d.fired.map(lab).map(esc).join('; '):'')+'</div>'; }
  if(d.fired&&d.fired.length){ return '<div style="margin-top:8px;font-size:11.5px">Rules fired: '+d.fired.map(function(x){return '<span style="border:1px solid #E5E7EB;border-radius:20px;padding:1px 7px;margin-right:3px">'+esc(lab(x))+'</span>';}).join('')+'</div>'; }
  return ''; }
function _rkCondHTML(id){
  var rs=getRuleset(id), conds=rs.conditions||[], flds=_rkCondFields();
  var ops=[['lt','<'],['lte','≤'],['gt','>'],['gte','≥'],['eq','='],['ne','≠']];
  var acts=[['gate','Exclude'],['bonus','Bonus +'],['penalty','Penalty −'],['cap','Cap ≤'],['floor','Floor ≥']];
  var fo=function(sel){return flds.map(function(f){return '<option value="'+f.v+'"'+(f.v===sel?' selected':'')+'>'+esc(f.l)+'</option>';}).join('');};
  var oo=function(sel){return ops.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===sel?' selected':'')+'>'+o[1]+'</option>';}).join('');};
  var ao=function(sel){return acts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===sel?' selected':'')+'>'+o[1]+'</option>';}).join('');};
  var h='<div style="border-top:1px solid #E5E7EB;margin-top:8px;padding-top:8px">';
  h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><b style="font-size:12px">Conditions (screen)</b><span style="flex:1"></span><button class="rkbtn" data-a="addcond">+ Add</button></div>';
  h+='<div class="foot" style="margin-bottom:6px">IF a condition holds THEN exclude or adjust the score (applied after the blend). Nested AND/OR via Import.</div>';
  if(!conds.length) h+='<div class="foot">No conditions.</div>';
  conds.forEach(function(c,i){ var w=(c.when&&!c.when.all&&!c.when.any&&!c.when.not)?c.when:null; var a=c.action||{};
    h+='<div class="rkcond" data-i="'+i+'" style="display:flex;align-items:center;gap:4px;margin:3px 0;flex-wrap:wrap;font-size:11px">';
    if(!w){ h+='<span class="foot" style="flex:1">'+esc(_rkCondSummary(c))+' — advanced, edit via Import</span>'; }
    else { var amt=(a.amount!=null?a.amount:(a.value!=null?a.value:'')); var noAmt=(a.type==='gate');
      h+='<select class="rkcf" style="font-size:11px">'+fo(w.field)+'</select>'
        +'<select class="rkco" style="font-size:11px">'+oo(w.op)+'</select>'
        +'<input class="rkcv" value="'+(w.value==null?'':esc(String(w.value)))+'" style="width:54px;font-size:11px" placeholder="val">'
        +'<span style="color:#888">→</span><select class="rkca" style="font-size:11px">'+ao(a.type)+'</select>'
        +'<input class="rkcamt" value="'+esc(String(amt))+'" '+(noAmt?'disabled':'')+' style="width:44px;font-size:11px" placeholder="amt">'; }
    h+='<button class="rkbtn rkcdel" title="delete">×</button></div>';
  });
  return h+'</div>';
}
function _rkCondRead(row){ var cf=row.querySelector('.rkcf'); if(!cf) return null;
  var strf={}; _rkCondFields().forEach(function(f){if(f.str)strf[f.v]=1;});
  var field=cf.value, op=row.querySelector('.rkco').value, raw=row.querySelector('.rkcv').value;
  var val=strf[field]?raw:(raw===''?null:+raw);
  var act=row.querySelector('.rkca').value, ae=row.querySelector('.rkcamt'), amt=(ae&&ae.value!=='')?+ae.value:0;
  var action=act==='gate'?{type:'gate'}:((act==='bonus'||act==='penalty')?{type:act,amount:amt}:{type:act,value:amt});
  return {when:{field:field,op:op,value:val},action:action};
}
function _rkWireCond(id, rerender){
  var host=document.getElementById('rkEditorHost'); if(!host) return;
  Array.prototype.forEach.call(host.querySelectorAll('.rkcond'),function(row){
    var i=+row.getAttribute('data-i');
    var edit=function(){ var rs=_rkClone(getRuleset(id)); var c=_rkCondRead(row); if(!c) return; rs.conditions=rs.conditions||[]; c.id=(rs.conditions[i]&&rs.conditions[i].id)||('rule'+Date.now().toString(36)); rs.conditions[i]=c; RANK_STORE.setActive(id,rs);
      var mb=document.getElementById('rkmod_'+id); if(mb)mb.style.display=RANK_STORE.isModified(id)?'inline-block':'none';
      var ca=row.querySelector('.rkca'), amt=row.querySelector('.rkcamt'); if(ca&&amt)amt.disabled=(ca.value==='gate'); rerender(); };
    Array.prototype.forEach.call(row.querySelectorAll('.rkcf,.rkco,.rkca'),function(el){el.onchange=edit;});
    Array.prototype.forEach.call(row.querySelectorAll('.rkcv,.rkcamt'),function(el){el.oninput=edit;});
    var del=row.querySelector('.rkcdel'); if(del)del.onclick=function(){ var rs=_rkClone(getRuleset(id)); (rs.conditions||[]).splice(i,1); RANK_STORE.setActive(id,rs); _rkRemount(id,rerender); rerender(); };
  });
}
function _rkEditorHTML(id){
  var rs=getRuleset(id), mod=RANK_STORE.isModified(id);
  var facById={}; rs.factors.forEach(function(f){facById[f.id]=f;});
  var dims=rs.dimensions||rs.factors.map(function(f){return {id:f.id,factors:[f.id],label:f.label||f.id};});
  var h='<div style="background:#FBFAF6;border:1px solid #E5E7EB;border-radius:8px;padding:10px 12px;margin-bottom:10px">';
  h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><b style="font-size:12.5px">Ranking rules</b>'
    +'<span id="rkmod_'+id+'" style="display:'+(mod?'inline-block':'none')+';font-size:10.5px;padding:1px 7px;border-radius:20px;background:#FFF3CD;color:#92610a">modified</span>'
    +'<span style="flex:1"></span>'
    +'<select id="rkpre_'+id+'" style="font-size:11.5px"><option value="">Presets…</option>'+RANK_STORE.listPresets(id).map(function(n){return '<option>'+esc(n)+'</option>';}).join('')+'</select>'
    +'<button class="rkbtn" data-a="save" data-id="'+id+'">Save</button><button class="rkbtn" data-a="reset" data-id="'+id+'">Reset</button>'
    +'<button class="rkbtn" data-a="export" data-id="'+id+'">Export</button><button class="rkbtn" data-a="import" data-id="'+id+'">Import</button></div>';
  dims.forEach(function(d){var w=(d.weight==null?1:d.weight);
    h+='<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:120px;font-size:12px">'+esc(d.label||d.id)+'</span>'
      +'<input type="range" min="0" max="3" step="1" value="'+w+'" id="rkw_'+id+'_'+d.id+'" style="flex:1">'
      +'<span id="rkwo_'+id+'_'+d.id+'" style="width:12px;text-align:right;font-size:11.5px">'+w+'</span></div>';
    if(d.factors.length){h+='<div style="margin:0 0 5px 124px;display:flex;flex-wrap:wrap;gap:6px">';
      d.factors.forEach(function(fid){var f=facById[fid]||{id:fid}; var on=(f.weight!==0), fwv=(f.weight==null||f.weight===0?1:f.weight);
        h+='<span style="font-size:11px;border:1px solid #E5E7EB;border-radius:20px;padding:1px 7px">'
          +'<label style="cursor:pointer"><input type="checkbox" id="rkf_'+id+'_'+fid+'" '+(on?'checked':'')+' style="vertical-align:-1px"> '+esc(f.label||fid)+(f.invert?' ·inv':'')+'</label> '
          +'<input type="number" id="rkfw_'+id+'_'+fid+'" min="0" max="3" step="1" value="'+fwv+'" style="width:34px;font-size:11px" title="factor weight"></span>';});
      h+='</div>';}
  });
  if(id==='sector_company'){ h+=_rkThresholdsHTML(); h+=_rkCondHTML('sector_company'); }
  return h+'</div>';
}
function _rkWire(id, rerender){
  var host=document.getElementById('rkEditorHost'); if(!host) return; var rs=getRuleset(id);
  (rs.dimensions||[]).forEach(function(d){var el=document.getElementById('rkw_'+id+'_'+d.id);
    if(el) el.oninput=function(){document.getElementById('rkwo_'+id+'_'+d.id).textContent=el.value; _rkApply(id); document.getElementById('rkmod_'+id).style.display=RANK_STORE.isModified(id)?'inline-block':'none'; rerender();};});
  rs.factors.forEach(function(f){var t=document.getElementById('rkf_'+id+'_'+f.id), w=document.getElementById('rkfw_'+id+'_'+f.id);
    if(t) t.onchange=function(){_rkApply(id); document.getElementById('rkmod_'+id).style.display=RANK_STORE.isModified(id)?'inline-block':'none'; rerender();};
    if(w) w.oninput=function(){_rkApply(id); rerender();};});
  var pre=document.getElementById('rkpre_'+id); if(pre) pre.onchange=function(){ if(pre.value){var p=RANK_STORE.loadPreset(id,pre.value); if(p){RANK_STORE.setActive(id,p); _rkRemount(id,rerender); rerender();}}};
  if(id==='sector_company'){ var _cf=getRuleset('company_fundamentals');
    _cf.factors.forEach(function(f){ ['rkg_'+f.id,'rkb_'+f.id,'rkth_'+f.id].forEach(function(eid){ var el=document.getElementById(eid); if(el) el.onchange=function(){ _rkApplyThresholds(); var mb=document.getElementById('rkmod_company_fundamentals'); if(mb)mb.style.display=RANK_STORE.isModified('company_fundamentals')?'inline-block':'none'; _rkRecomputeFund(id); }; }); }); }
  if(id==='sector_company') _rkWireCond(id, rerender);
  Array.prototype.forEach.call(host.querySelectorAll('.rkbtn'),function(b){ if(b.classList&&b.classList.contains('rkcdel'))return; b.onclick=function(){var a=b.getAttribute('data-a');
    if(a==='reset'){RANK_STORE.resetActive(id); if(id==='sector_company')RANK_STORE.resetActive('company_fundamentals'); _rkRemount(id,rerender); rerender(); if(id==='sector_company')_rkRecomputeFund(id);}
    else if(a==='resetcf'){RANK_STORE.resetActive('company_fundamentals'); _rkRemount(id,rerender); _rkRecomputeFund(id);}
    else if(a==='addcond'){ var _r=_rkClone(getRuleset(id)); _r.conditions=_r.conditions||[]; _r.conditions.push({id:'rule'+Date.now().toString(36),when:{field:'metric:nm',op:'lt',value:0},action:{type:'gate'}}); RANK_STORE.setActive(id,_r); _rkRemount(id,rerender); rerender(); }
    else if(a==='save'){var n=prompt('Preset name:'); if(n){var r=RANK_STORE.savePreset(id,n,getRuleset(id)); if(!r.ok)alert('Cannot save:\n'+r.errors.join('\n')); else _rkRemount(id,rerender);}}
    else if(a==='export'){_rkExport(id);} else if(a==='import'){_rkImport(id,rerender);}};});
}
function _rkRemount(id,rerender){var host=document.getElementById('rkEditorHost'); if(host){host.innerHTML=_rkEditorHTML(id); _rkWire(id,rerender);}}
function _rkExport(id){try{var b=new Blob([RANK_STORE.exportRuleset(id)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=id+'.ruleset.json';a.click();setTimeout(function(){URL.revokeObjectURL(u);},1000);}catch(e){alert('Export failed: '+e.message);}}
function _rkImport(id,rerender){var inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=function(){var f=inp.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){var r=RANK_STORE.importRuleset(id,rd.result);if(!r.ok)alert('Invalid ruleset:\n'+r.errors.join('\n'));else{_rkRemount(id,rerender);rerender();}};rd.readAsText(f);};inp.click();}
function _rkPaint(id, rerender, tableHTML, onRefresh){
  var _th=document.getElementById('rkTableHost');
  if(!_th || _th.getAttribute('data-rk')!==id){
    mBody.innerHTML='<style>.rkbtn{font-size:11.5px;padding:2px 8px;border:1px solid #cbb26a;background:#fff;border-radius:6px;cursor:pointer;margin-left:3px}.rkbtn:hover{background:#FFF7E6}.rkbtn:disabled{opacity:.5;cursor:default}</style>'
      +'<div style="margin-bottom:8px"><button class="rkbtn" id="rkToggle">⚙ Edit rules</button>'
      +(onRefresh?'<button class="rkbtn" id="rkRefresh">↻ Refresh now</button><span id="rkAsOf" class="foot" style="margin-left:8px;font-size:10.5px"></span>':'')
      +'</div>'
      +'<div id="rkEditorHost" style="display:none"></div><div id="rkTableHost" data-rk="'+id+'"></div>';
    var host=document.getElementById('rkEditorHost');
    document.getElementById('rkToggle').onclick=function(){ if(host.style.display==='none'){host.innerHTML=_rkEditorHTML(id);_rkWire(id,rerender);host.style.display='';} else {host.style.display='none';} };
    if(onRefresh){ document.getElementById('rkRefresh').onclick=function(){ onRefresh(); }; }
  }
  document.getElementById('rkTableHost').innerHTML=decorateHeaders(tableHTML);
}
// ---- explain-per-row: score breakdown from rankGroup output (read-only) ----
const RK_EXPL={sector_company:{}, fund_category:{}, growth_core:{}};
const RK_HOOKS={};
function _rkBar(v){ var w=v==null?0:Math.max(0,Math.min(100,Math.round(v*100))); var col=v==null?'#ccc':(v>=0.66?'#16a34a':(v>=0.33?'#f59e0b':'#dc2626')); return '<span style="display:inline-block;width:74px;height:7px;background:#eee;border-radius:4px;vertical-align:middle;overflow:hidden"><span style="display:block;height:100%;width:'+w+'%;background:'+col+'"></span></span>'; }
function _rkPct(v){ return v==null?'—':Math.round(v*100)+''; }
function _rkExplain(id, tk){
  var d=(RK_EXPL[id]||{})[tk]; if(!d) return;
  var rs=getRuleset(id); var facById={}; (rs.factors||[]).forEach(function(f){facById[f.id]=f;});
  var dims=rs.dimensions||(rs.factors||[]).map(function(f){return{id:f.id,factors:[f.id],label:f.label||f.id};});
  var h='<div style="font-size:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><b style="font-size:13.5px">'+esc(tk)+' — score breakdown</b><span style="flex:1"></span><span style="font-weight:700;font-size:16px">'+(d.composite!=null?Math.round(d.composite*100):'—')+'</span></div>';
  h+='<div class="foot" style="margin-bottom:8px">Composite = weighted mean of dimension percentiles within the group (0–100). Higher = stronger vs peers.</div>';
  dims.forEach(function(dim){ var dv=d.dimensions?d.dimensions[dim.id]:null; var dw=(dim.weight==null?1:dim.weight);
    h+='<div style="display:flex;align-items:center;gap:8px;margin:5px 0"><span style="width:120px"><b>'+esc(dim.label||dim.id)+'</b></span>'+_rkBar(dv)+'<span style="width:32px;text-align:right">'+_rkPct(dv)+'</span>'+(dw!==1?'<span class="foot" style="font-size:10.5px">×'+dw+'</span>':'')+'</div>';
    (dim.factors||[]).forEach(function(fid){ var f=facById[fid]||{id:fid}; var fv=d.factors?d.factors[fid]:null; var fw=(f.weight==null||f.weight===0?1:f.weight);
      h+='<div style="display:flex;align-items:center;gap:8px;margin:2px 0 2px 20px;color:#666"><span style="width:100px;font-size:11.5px">'+esc(f.label||fid)+(f.invert?' ·inv':'')+'</span>'+_rkBar(fv)+'<span style="width:32px;text-align:right;font-size:11.5px">'+_rkPct(fv)+'</span>'+(fw!==1?'<span class="foot" style="font-size:10.5px">×'+fw+'</span>':'')+'</div>'; });
  });
  h+=_rkFiredHTML(id,d);
  h+='<div class="foot" style="margin-top:8px">Percentiles are within the current group; “·inv” = lower raw value ranks higher; “×n” = active weight. <b>Rules-based — not financial advice.</b></div></div>';
  _rkPopover(h);
}
function _rkPopover(html){
  var ex=document.getElementById('rkPop'); if(ex) ex.remove();
  var d=document.createElement('div'); d.id='rkPop';
  d.style.cssText='position:fixed;z-index:10050;left:50%;top:50%;transform:translate(-50%,-50%);max-width:440px;width:90%;max-height:80vh;overflow:auto;background:#fff;border:1px solid #cbb26a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);padding:14px 18px 16px';
  d.innerHTML='<div style="text-align:right;margin:-6px -8px 2px 0"><span id="rkPopX" style="cursor:pointer;font-size:19px;color:#999;padding:2px 8px">×</span></div>'+html;
  document.body.appendChild(d);
  var close=function(){ if(d.parentNode)d.remove(); document.removeEventListener('keydown',esch); document.removeEventListener('click',outside,true); };
  var esch=function(e){ if(e.key==='Escape'){ e.stopPropagation(); close(); } };
  var outside=function(e){ if(!d.contains(e.target) && !(e.target.closest&&e.target.closest('.rkscore'))) close(); };
  document.getElementById('rkPopX').onclick=close;
  document.addEventListener('keydown',esch);
  setTimeout(function(){ document.addEventListener('click',outside,true); },0);
}
document.addEventListener('click',function(e){ var s=e.target.closest&&e.target.closest('.rkscore'); if(s){ e.preventDefault(); e.stopPropagation(); _rkExplain(s.getAttribute('data-rk'), s.getAttribute('data-tk')); } });
