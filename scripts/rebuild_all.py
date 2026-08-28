# --- project-relative paths (generalized from the scratch build workspace) ---
# Set TDD_BASE to the project root, or leave blank to auto-detect (parent of scripts/).
import os
TDD_BASE = os.environ.get("TDD_BASE") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR    = os.path.join(TDD_BASE, "data")
DASH_DIR    = os.path.join(TDD_BASE, "dashboard")
DOCS_DIR    = os.path.join(TDD_BASE, "docs")
PORT_DIR    = os.path.join(TDD_BASE, "portfolio")
SCRIPTS_DIR = os.path.join(TDD_BASE, "scripts")
# ---------------------------------------------------------------------------

import json, openpyxl
WB=os.path.join(DATA_DIR,'tech100_drawdown_SP_NAS.xlsx')
DJ=os.path.join(SCRIPTS_DIR,'dash_data_live.json')
TPL=os.path.join(SCRIPTS_DIR,'dashboard_tpl.html')

wb=openpyxl.load_workbook(WB,data_only=True)
STOCK={'S&P 500 Live':'sp','Nasdaq-100 Live':'nasdaq','Dow Jones 100 Live':'dow'}
FUND={'Top 100 ETFs Live':'etfs','Thematic ETFs Live':'thematic','Mutual Funds Live':'mutualfunds'}
NUM={'price','high','off','recover','sma','smapct','sma50','sma50pct','fwdpe','divyield'}
TXT={'status','signal','cross'}
HMAP={'Ticker':'ticker','Company':'company','Sector':'sector','Category':'category',
 'Current Price ($)':'price','52-Wk High ($)':'high','% Off High':'off','Status':'status',
 'Drawdown Signal':'signal','% to Recover to High':'recover','Analyst Consensus':'consensus',
 'Forward P/E':'fwdpe','200-Day SMA ($)':'sma','% vs 200d SMA':'smapct','50-Day SMA ($)':'sma50',
 '% vs 50d SMA':'sma50pct','Cross Signal':'cross','Dividend Yield % (est.)':'divyield'}

def clean(key,v):
    if v is None: return ("—" if key in TXT else None)
    if isinstance(v,str):
        if 'N/A' in v or v.strip() in ('','#N/A'): return ("—" if key in TXT else None)
        return v.strip()
    if key in NUM: return float(v)
    return v

def read_sheet(sn):
    ws=wb[sn]; rows=list(ws.iter_rows(values_only=True))
    hi=next(i for i,r in enumerate(rows) if r and any(str(c).strip()=='Ticker' for c in r if c))
    hdr=[HMAP.get(str(c).strip()) if c else None for c in rows[hi]]
    out=[]
    for r in rows[hi+1:]:
        t=r[0]
        if t is None or not str(t).strip(): continue
        if str(t).strip().lower().startswith('summary'): break
        rec={}
        for c,key in zip(r,hdr):
            if key: rec[key]=clean(key,c)
        if rec.get('ticker'): out.append(rec)
    return out

fresh={}
for sn,k in {**STOCK,**FUND}.items(): fresh[k]=read_sheet(sn)
print("workbook rows:",{k:len(v) for k,v in fresh.items()})

# load current DATA (preserve ira/brokerage/coreRank; capture SOXQ overlay to re-apply)
d=json.load(open(DJ))
preserve={k:d[k] for k in ('ira','brokerage','coreRank') if k in d}
old_soxq=next((x for x in d.get('thematic',[]) if x.get('ticker')=='SOXQ' and x.get('price') is not None),None)

# swap in fresh universe
for k in fresh: d[k]=fresh[k]

# re-apply SOXQ live overlay (thematic tab has no STOCKHISTORY in the workbook)
def soxq_overlay(row):
    price,high,sma200,sma50=111.24,115.33,67.39,95.19
    off=price/high-1
    row.update(dict(price=price,high=high,off=off,
        status=('Bear' if off<=-0.2 else 'Correction' if off<=-0.1 else 'Normal'),
        signal='Near highs (<10% off)',recover=high/price-1,
        sma=sma200,smapct=price/sma200-1,sma50=sma50,sma50pct=price/sma50-1,cross='Golden Cross'))
sx=next((x for x in d['thematic'] if x.get('ticker')=='SOXQ'),None)
if sx and (sx.get('price') is None): soxq_overlay(sx); print("re-applied SOXQ overlay")

for k,v in preserve.items(): d[k]=v
# merge split / reverse-split facts (data/splits.json) -> badges on all tabs (fallback to prior)
try:
    with open(os.path.join(DATA_DIR,'splits.json')) as _sf: d['splits']=json.load(_sf) or {}
except Exception:
    d['splits']=d.get('splits',{}) or {}
# portfolio value history (data/history.json) -> DATA.history for the benchmark card
try:
    with open(os.path.join(DATA_DIR,'history.json')) as _hf: d['history']=json.load(_hf) or []
except Exception:
    d['history']=d.get('history',[]) or []
# refresh DCF base prices + capital weights from the just-built market_data.xlsx, so the popup
# never argues with the universe table about what the price is (preserve-on-failure)
try:
    import sys as _s
    if SCRIPTS_DIR not in _s.path: _s.path.insert(0, SCRIPTS_DIR)
    import refresh_dcf_prices as _rdp; _rdp.main()
except Exception as _e:
    print('DCF price refresh skipped:', _e)
# precomputed DCF bases (data/dcf.json) -> DATA.dcf for the valuation strip/popup
try:
    with open(os.path.join(DATA_DIR,'dcf.json')) as _df: d['dcf']=json.load(_df) or {}
except Exception:
    d['dcf']=d.get('dcf',{}) or {}
# external fair-value anchors (data/dcf_anchor.json) -> DATA.dcf[sym].anchor for benchmark-calibration
try:
    with open(os.path.join(DATA_DIR,'dcf_anchor.json')) as _af:
        _anch=json.load(_af) or {}
    for _sym,_a in _anch.items():
        if _sym in d.get('dcf',{}): d['dcf'][_sym]['anchor']=_a
except Exception:
    pass
# Bigdata-sourced segment overrides (data/dcf_segments.json) -> DATA.dcf[sym].segments/segOk/segErr,
# applied AFTER the base load so an FMP-less build_dcf refresh can't drop them (Price Analysis tab).
try:
    with open(os.path.join(DATA_DIR,'dcf_segments.json')) as _sf:
        _segov=json.load(_sf) or {}
    for _sym,_o in _segov.items():
        if _sym in d.get('dcf',{}):
            d['dcf'][_sym]['segments']=_o.get('segments'); d['dcf'][_sym]['segOk']=_o.get('segOk'); d['dcf'][_sym]['segErr']=_o.get('segErr')
except Exception:
    pass
# DCF drift monitor artifact (data/dcf_monitor.json) -> DATA.dcfMonitor (Loop 5)
try:
    with open(os.path.join(DATA_DIR,'dcf_monitor.json')) as _mf: d['dcfMonitor']=json.load(_mf) or {}
except Exception:
    d['dcfMonitor']=d.get('dcfMonitor',{}) or {}

# --- data-integrity guard: suppress bogus signals from corrupt/#N/A STOCKHISTORY cells ---
import sys as _sys
if SCRIPTS_DIR not in _sys.path: _sys.path.insert(0, SCRIPTS_DIR)
import integrity_guard
d, _ig_findings = integrity_guard.sanitize(d)
print(integrity_guard.format_report(_ig_findings))

json.dump(d,open(DJ,'w'))
print("data keys:",list(d.keys()),"| ira",len(d.get('ira',[])),"brokerage",len(d.get('brokerage',[])),"coreRank",len(d.get('coreRank',[])))

# rebuild the template from src/dash/ modules (source of truth) before injecting DATA
import build_glossary as _gl; _gl.main()  # regenerate src/dash/12_glossary_data.js from data/glossary/*.json
import assemble_dashboard as _asm; _asm.write()
# regenerate deployed
tpl=open(TPL).read(); data=open(DJ).read()
out=tpl.replace('const DATA = __DATA__;','const DATA = '+data+';')
assert '__DATA__' not in out and out.rstrip().endswith('</html>') and out.count('</script>')==2
open(os.path.join(SCRIPTS_DIR,'dashboard.html'),'w').write(out)
open(os.path.join(DASH_DIR,'tech_drawdown_dashboard.html'),'w').write(out)
print("deployed bytes",len(out))
# DELL check
for k in ('sp','dow'):
    r=next((x for x in d[k] if x['ticker']=='DELL'),None)
    if r: print(f"DELL[{k}] now: price={r['price']} off={r['off']:.4f} status={r['status']} cross={r['cross']}")
