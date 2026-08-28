"""Build DATA.macroHistory from FMP light arrays + the consumer-sentiment series.
Pure transform (mirrors build_index_history.py). Input: ONE json file that is a dict
{ SOURCE_SYMBOL: rawArray }, where rawArray is FMP's light/eod shape
([{symbol,date,price} ...]) for commodities/forex/etf, or the economics-indicators
shape ([{date,value} ...]) for consumerSentiment. Prices/FX are downsampled WEEKLY
(last obs per ISO week, ~1y); sentiment is kept MONTHLY (last obs per year-month, ~13m).
FX is oriented as USD STRENGTH: EURUSD/GBPUSD are inverted (1/price -> USD per unit),
USDJPY/USDCNY are kept as-is. Rare earths uses the REMX ETF as a labeled proxy.
Emits {"series":[{key,name,unit,points:[{d,c}]} ...],"asof":today}.
Usage: python build_macro_history.py <raw.json> [--out macro_history.json]"""
import json, sys, os, datetime

# key = output id, src = symbol used in the input dict, mode = how to read/normalize
CFG = [
    {'key':'CLUSD','src':'CLUSD','name':'Oil · WTI','unit':'$/bbl','mode':'price'},
    {'key':'GCUSD','src':'GCUSD','name':'Gold','unit':'$/oz','mode':'price'},
    {'key':'SIUSD','src':'SIUSD','name':'Silver','unit':'$/oz','mode':'price'},
    {'key':'HGUSD','src':'HGUSD','name':'Copper','unit':'$/lb','mode':'price'},
    {'key':'REMX','src':'REMX','name':'Rare earths · REMX','unit':'$','mode':'price'},
    {'key':'USDEUR','src':'EURUSD','name':'USD / EUR','unit':'','mode':'fxinv'},
    {'key':'USDJPY','src':'USDJPY','name':'USD / JPY','unit':'','mode':'fx'},
    {'key':'USDGBP','src':'GBPUSD','name':'USD / GBP','unit':'','mode':'fxinv'},
    {'key':'USDCNY','src':'USDCNY','name':'USD / CNY','unit':'','mode':'fx'},
    {'key':'SENT','src':'consumerSentiment','name':'Consumer sentiment','unit':'UMich','mode':'sentiment'},
]
WK_DAYS=372; MO_MONTHS=14

def _num(x):
    for k in ('price','close','value','adjClose','open'):
        v=x.get(k) if isinstance(x,dict) else None
        if v is not None:
            try: return float(v)
            except (TypeError,ValueError): pass
    return None

def _rows(raw):
    """Normalize an input array (or {historical:[...]}/{data:[...]}) to sorted [{d,c_raw}]."""
    if isinstance(raw,dict): raw=raw.get('historical') or raw.get('data') or []
    out=[]
    for x in (raw or []):
        if not isinstance(x,dict): continue
        d=x.get('date') or x.get('day')
        v=_num(x)
        if d and v is not None:
            out.append({'d':str(d)[:10],'v':v})
    out.sort(key=lambda p:p['d'])
    return out

def _bucket(rows, days, monthly):
    if not rows: return []
    cutoff=(datetime.date.fromisoformat(rows[-1]['d'])-datetime.timedelta(days=days)).isoformat()
    rows=[r for r in rows if r['d']>=cutoff]
    seen={}
    for r in rows:
        dt=datetime.date.fromisoformat(r['d'])
        key=(dt.year,dt.month) if monthly else dt.isocalendar()[:2]
        seen[key]=r
    return sorted(seen.values(), key=lambda r:r['d'])

def build(data):
    series=[]
    for c in CFG:
        rows=_rows(data.get(c['src']))
        monthly = c['mode']=='sentiment'
        rows=_bucket(rows, MO_MONTHS*31 if monthly else WK_DAYS, monthly)
        if not rows: continue
        pts=[]
        for r in rows:
            v=r['v']
            if c['mode']=='fxinv':
                if not v: continue
                v=1.0/v
            dec = 4 if c['mode'] in ('fxinv','fx') and v<10 else 2
            pts.append({'d':r['d'],'c':round(v,dec)})
        if pts:
            series.append({'key':c['key'],'name':c['name'],'unit':c['unit'],'points':pts})
    return {'series':series,'asof':datetime.date.today().isoformat()}

def main():
    argv=sys.argv[1:]
    out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'macro_history.json')
    if '--out' in argv:
        i=argv.index('--out'); out=argv[i+1]; argv=argv[:i]+argv[i+2:]
    if not argv:
        print('usage: build_macro_history.py <raw.json> [--out macro_history.json]'); return
    data=json.load(open(argv[0]))
    mh=build(data)
    json.dump(mh,open(out,'w'),separators=(',',':'))
    print('macroHistory series:',[(s['key'],len(s['points'])) for s in mh['series']])
    print('wrote',os.path.relpath(out))

if __name__=='__main__': main()
