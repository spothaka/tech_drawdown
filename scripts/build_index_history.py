"""Phase C — build DATA.indexHistory from FMP historical-price-eod-light JSON.
Pure transform: reads one or more raw FMP light arrays ([{symbol,date,price},...]),
keeps the last ~1 year, downsamples to WEEKLY (last trading day per ISO week), and
emits {SYM:{name, points:[{d,c}]}}. Nasdaq-100 (^NDX/QQQ) is gated on the current
FMP plan, so ^IXIC (Nasdaq Composite) is used as the Nasdaq line.
Usage: python build_index_history.py <raw1.json> [raw2.json ...] [--out index_history.json]"""
import json, sys, os, datetime
NAMES={'^DJI':'Dow Jones','^IXIC':'Nasdaq','^GSPC':'S&P 500','^RUT':'Russell 2000',
       '^NDX':'Nasdaq-100','QQQ':'Nasdaq-100','DIA':'Dow Jones','SPY':'S&P 500','IWM':'Russell 2000'}
ORDER=['^DJI','^IXIC','^NDX','QQQ','^GSPC','^RUT','DIA','SPY','IWM']
DAYS=372
def weekly(pts):
    seen={}
    for p in pts:
        wk=datetime.date.fromisoformat(p['d']).isocalendar()[:2]
        seen[wk]=p
    return sorted(seen.values(), key=lambda p:p['d'])
def series(path):
    arr=json.load(open(path))
    if isinstance(arr,dict): arr=arr.get('historical') or arr.get('data') or []
    sym=next((x.get('symbol') for x in arr if x.get('symbol')), None)
    pts=[{'d':x['date'],'c':round(float(x['price']),2)} for x in arr if x.get('price') is not None and x.get('date')]
    pts.sort(key=lambda p:p['d'])
    if pts:
        cutoff=(datetime.date.fromisoformat(pts[-1]['d'])-datetime.timedelta(days=DAYS)).isoformat()
        pts=[p for p in pts if p['d']>=cutoff]
    return sym, weekly(pts)
def main():
    argv=sys.argv[1:]; out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'index_history.json')
    if '--out' in argv:
        i=argv.index('--out'); out=argv[i+1]; argv=argv[:i]+argv[i+2:]
    args=argv
    got={}
    for p in args:
        sym,pts=series(p)
        if sym and pts: got[sym]=pts
    ih={}
    for sym in ORDER:
        if sym in got and NAMES.get(sym) and NAMES[sym] not in [v['name'] for v in ih.values()]:
            ih[sym]={'name':NAMES[sym],'points':got[sym]}
    json.dump(ih,open(out,'w'),separators=(',',':'))
    print('indexHistory:',{s:(v['name'],len(v['points'])) for s,v in ih.items()})
    print('wrote',os.path.relpath(out))
if __name__=='__main__': main()
