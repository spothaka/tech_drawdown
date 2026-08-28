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

import json, openpyxl, re
WB=os.path.join(DATA_DIR,'tech100_drawdown_SP_NAS.xlsx')
HTML=os.path.join(DASH_DIR,'tech_drawdown_dashboard.html')

# ---- source of truth: fresh workbook read (same mapping as build) ----
wb=openpyxl.load_workbook(WB,data_only=True)
SHEETS={'S&P 500 Live':'sp','Nasdaq-100 Live':'nasdaq','Dow Jones 100 Live':'dow',
        'Top 100 ETFs Live':'etfs','Thematic ETFs Live':'thematic','Mutual Funds Live':'mutualfunds'}
NUM={'price','high','off','recover','sma','smapct','sma50','sma50pct','fwdpe','divyield'}
TXT={'status','signal','cross'}
HMAP={'Ticker':'ticker','Company':'company','Sector':'sector','Category':'category','Current Price ($)':'price',
 '52-Wk High ($)':'high','% Off High':'off','Status':'status','Drawdown Signal':'signal','% to Recover to High':'recover',
 'Analyst Consensus':'consensus','Forward P/E':'fwdpe','200-Day SMA ($)':'sma','% vs 200d SMA':'smapct',
 '50-Day SMA ($)':'sma50','% vs 50d SMA':'sma50pct','Cross Signal':'cross','Dividend Yield % (est.)':'divyield'}
def clean(key,v):
    if v is None: return ("—" if key in TXT else None)
    if isinstance(v,str):
        if 'N/A' in v or v.strip() in ('','#N/A'): return ("—" if key in TXT else None)
        return v.strip()
    if key in NUM: return float(v)
    return v
def read_sheet(sn):
    rows=list(wb[sn].iter_rows(values_only=True))
    hi=next(i for i,r in enumerate(rows) if r and any(str(c).strip()=='Ticker' for c in r if c))
    hdr=[HMAP.get(str(c).strip()) if c else None for c in rows[hi]]
    out=[]
    for r in rows[hi+1:]:
        if r[0] is None or not str(r[0]).strip(): continue
        if str(r[0]).strip().lower().startswith('summary'): break
        rec={key:clean(key,c) for c,key in zip(r,hdr) if key}
        if rec.get('ticker'): out.append(rec)
    return out
src={k:read_sheet(sn) for sn,k in SHEETS.items()}

# ---- artifact DATA ----
h=open(HTML).read(); i=h.index('const DATA = ')+13; j=h.index(';\n',i)
D=json.loads(h[i:j])

def num_eq(a,b):
    if a is None and b is None: return True
    if a is None or b is None: return False
    try: return abs(float(a)-float(b))<=1e-6
    except: return str(a)==str(b)

mism=0; cov_issues=0; internal=0; checked=0
print("="*70); print("A) COVERAGE + FIELD-BY-FIELD (artifact vs current workbook)"); print("="*70)
for k in src:
    S={r['ticker']:r for r in src[k]}; A={r['ticker']:r for r in D[k]}
    miss=set(S)-set(A); extra=set(A)-set(S)
    if miss or extra:
        cov_issues+=1; print(f"[{k}] COVERAGE: missing {list(miss)[:5]} extra {list(extra)[:5]}")
    fields=set(); [fields.update(r.keys()) for r in src[k]]
    tabmis=0
    for t,s in S.items():
        a=A.get(t)
        if not a: continue
        checked+=1
        for f in fields:
            if k=='thematic' and t=='SOXQ': continue  # intentional live overlay (workbook thematic is blank)
            if not num_eq(a.get(f),s.get(f)):
                tabmis+=1; mism+=1
                if tabmis<=3: print(f"[{k}] {t}.{f}: artifact={a.get(f)} workbook={s.get(f)}")
    pop=sum(1 for r in src[k] if r.get('price') is not None)
    print(f"[{k:11}] {len(src[k])} rows | {pop} priced | field mismatches: {tabmis}")

print("\n"+"="*70); print("B) INTERNAL CONSISTENCY (recompute from price/high/SMA in the workbook)"); print("="*70)
for k in src:
    bad=0
    for r in src[k]:
        p,hi_,s2,s5=r.get('price'),r.get('high'),r.get('sma'),r.get('sma50')
        if p is None: continue
        if hi_ and r.get('off') is not None and abs((p/hi_-1)-r['off'])>2e-3: bad+=1
        if s2 and r.get('smapct') is not None and abs((p/s2-1)-r['smapct'])>2e-3: bad+=1
        if s2 and s5 and r.get('cross') not in ('—',None):
            exp='Golden Cross' if s5>=s2 else 'Death Cross'
            if exp!=r['cross']: bad+=1
    internal+=bad
    if bad: print(f"[{k}] {bad} rows where stored value disagrees with recompute (workbook cells not fully recalced)")
if internal==0: print("All populated rows internally consistent (off / %vsSMA / cross match recompute).")

print("\n"+"="*70); print("C) PORTFOLIO TABS (recompute + join)"); print("="*70)
def uni(t):
    for k in ['sp','nasdaq','dow','etfs','thematic','mutualfunds']:
        r=next((x for x in D[k] if x.get('ticker')==t),None)
        if r: return r
    return None
for acct in ('ira','brokerage'):
    rows=D.get(acct,[]); tot=0; cost=0; perr=0
    for hd in rows:
        v=hd.get('value'); isCD=hd.get('type')=='CD'
        c=(hd['qty']*hd['paid']/100 if isCD else hd['qty']*hd['paid']) if (isinstance(hd.get('qty'),(int,float)) and isinstance(hd.get('paid'),(int,float))) else None
        tot+=v or 0; cost+=c or 0
        u=uni(hd['ticker'])
        emb = hd.get('off') is not None
        if hd.get('type') in ('Equity/ETF','Mutual Fund') and not emb and u is None:
            perr+=1
    print(f"[{acct}] holdings={len(rows)} | market value=${tot:,.0f} | cost basis=${cost:,.0f} | gain=${tot-cost:,.0f} ({(tot-cost)/cost*100:.1f}%) | uncovered marketable={perr}")

print("\n"+"="*70)
dell=next((x for x in D['sp'] if x['ticker']=='DELL'),None)
print(f"DELL[sp] artifact: price={dell['price']} off={dell['off']:.4f} status={dell['status']} cross={dell['cross']}")
print(f"SUMMARY: tickers checked={checked} | field mismatches={mism} | coverage issues={cov_issues} | internal inconsistencies={internal}")
print("RESULT:", "PASS - artifact matches workbook on every field" if (mism==0 and cov_issues==0) else "FAIL - see mismatches above")
