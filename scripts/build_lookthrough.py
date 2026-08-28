"""Fund look-through -> data/fund_holdings.json -> DATA.lookthrough

Decomposes held ETFs/mutual funds into their underlying companies so the dashboard can show
TRUE single-name exposure (direct holdings + fund look-through combined).

Design rules (learned the hard way on the DCF):
  * Store the TOP-N holdings per fund plus an explicit `residual` weight. The long tail is shown as a
    "diversified remainder" bucket — NEVER silently dropped, because dropping it UNDERSTATES
    concentration, which is the exact failure this feature exists to prevent.
  * Cash / money-market / securities-lending rows (the feed leaves `asset` empty) go to a `cash` bucket.
  * A fund we cannot fetch is NOT dropped — the client shows it as an "unmapped" bucket.
  * Every fund carries its own `asOf` (ETFs update daily; MUTUAL FUNDS disclose quarterly, so FBGRX /
    FXAIX can lag ~90 days) and a `synthetic` flag (JEPI/JEPQ hold equity-linked notes, so their
    look-through is approximate).

Usage: python build_lookthrough.py --sym SMH --raw smh.json [--synthetic]
       python build_lookthrough.py --emit
"""
import os, sys, json, argparse, datetime

HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
OUT=os.path.join(ROOT,'data','fund_holdings.json')
SCHED=os.path.join(ROOT,'data','dividend_schedule.json')
TOPN=50

def _known():
    try:
        d=json.load(open(SCHED,encoding='utf-8'))
        return sorted([k for k in d if not k.startswith('_')])
    except Exception:
        return []

def build(sym, rows, synthetic=False):
    eq=[]; cash=0.0; asOf=None
    for r in rows:
        w=r.get('weightPercentage')
        if not isinstance(w,(int,float)): continue
        a=(r.get('asset') or '').strip()
        asOf=asOf or (r.get('updatedAt') or '')[:10]
        if not a:                       # cash / money-market / sec-lending
            cash+=max(0.0,w); continue
        eq.append({'sym':a,'name':(r.get('name') or '').strip(),'w':round(w,4)})
    if not eq: return None
    eq.sort(key=lambda x:-x['w'])
    top=eq[:TOPN]
    topw=sum(x['w'] for x in top)
    allw=sum(x['w'] for x in eq)
    residual=max(0.0, allw-topw)        # the long tail we did not store
    # coverage sanity: disclosed weights should be ~100%
    total=allw+cash
    return {'asOf':asOf, 'n':len(eq), 'top':top,
            'topW':round(topw,3), 'residualW':round(residual,3), 'cashW':round(cash,3),
            'disclosedW':round(total,3), 'synthetic':bool(synthetic)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--sym'); ap.add_argument('--raw'); ap.add_argument('--synthetic',action='store_true')
    ap.add_argument('--emit',action='store_true')
    a=ap.parse_args()
    store={'asOf':datetime.date.today().isoformat(),'funds':{},'known':_known()}
    if os.path.exists(OUT):
        try:
            store=json.load(open(OUT,encoding='utf-8'))
            store['known']=_known()
        except Exception: pass
    if a.emit or not a.sym:
        print(json.dumps(store,separators=(',',':'))); return
    raw=json.load(open(a.raw,encoding='utf-8'))
    rows=raw if isinstance(raw,list) else raw.get('result',[])
    f=build(a.sym, rows, a.synthetic)
    if not f:
        sys.stderr.write('%s -> no usable holdings\n'%a.sym); sys.exit(1)
    store['funds'][a.sym]=f
    store['asOf']=datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    json.dump(store,open(OUT,'w',encoding='utf-8'),separators=(',',':'))
    sys.stderr.write('%-6s %3d holdings  top%d=%.1f%%  tail=%.1f%%  cash=%.1f%%  disclosed=%.1f%%  asOf %s%s\n'
        % (a.sym, f['n'], TOPN, f['topW'], f['residualW'], f['cashW'], f['disclosedW'], f['asOf'],
           '  [SYNTHETIC]' if f['synthetic'] else ''))

if __name__=='__main__': main()
