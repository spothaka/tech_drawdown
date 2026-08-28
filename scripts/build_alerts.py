"""Change alerts — new Bear / Death-Cross / recovery / 52-week-low for HELD names.

Pure diff (no connector calls): compares yesterday's deployed DATA against today's
merged DATA for held tickers (IRA union Brokerage) and emits status/trend/low
transitions. Appends to data/alerts.json (rolling history) and prints the embed-ready
DATA.alerts map, keyed by ticker for O(1) lookup in the holdings tables:

  DATA.alerts["CVS"] = {kind,sev,label,date,account,cross,
                        from:{status,off}, to:{status,off,price},
                        history:[{date,kind,text}, ...]}   # last 14 days

Guardrail: rows the integrity guard flagged dq:"error"/"missing" are skipped — a
corrupt price must never fake a Death Cross or a new low. First run just records a
baseline (real transitions appear on the next daily diff).

Usage:
  python build_alerts.py --prior prior_DATA.json --today today_DATA.json [--date YYYY-MM-DD]
  python build_alerts.py --emit           # rebuild DATA.alerts from data/alerts.json only (carry)
"""
import os, sys, json, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(ROOT, 'data', 'alerts.json')
UNIV = ['sp', 'nasdaq', 'dow', 'etfs', 'thematic', 'mutualfunds']
STAT = {'Normal': 0, 'Correction': 1, 'Bear': 2}
PRIORITY = ['bear', 'death', 'low52', 'correction', 'golden', 'recover']  # badge = first match
WINDOW_DAYS = 14        # a badge/event stays visible this long
KEEP_DAYS = 60          # prune the store beyond this

def _load_store():
    if os.path.exists(STORE):
        try: return json.load(open(STORE, 'r', encoding='utf-8'))
        except Exception: return []
    return []

def _save_store(evs):
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    json.dump(evs, open(STORE, 'w', encoding='utf-8'), separators=(',', ':'))

def _held(D):
    out = []
    for key in ('ira', 'brokerage'):
        for r in D.get(key, []):
            t = r.get('ticker'); ty = (r.get('type') or '')
            if t and ty not in ('CD', 'Cash'):
                out.append(t)
    # dedupe, preserve order
    seen = set(); res = []
    for t in out:
        if t not in seen: seen.add(t); res.append(t)
    return res

def _account(D, tk):
    i = any(r.get('ticker') == tk for r in D.get('ira', []))
    b = any(r.get('ticker') == tk for r in D.get('brokerage', []))
    return 'Both' if (i and b) else ('IRA' if i else 'Brokerage')

def _snap(D, tk):
    """Resolve {status,cross,off,price,low} for a held ticker; None if unresolved/corrupt."""
    base = None
    for r in D.get('brokerage', []):
        if r.get('ticker') == tk and r.get('status'):
            base = r; break
    if base is None:
        for key in UNIV:
            for r in D.get(key, []):
                if r.get('ticker') == tk and r.get('status'):
                    base = r; break
            if base is not None: break
    if base is None:
        return None
    if base.get('dq') in ('error', 'missing'):
        return None
    low = base.get('low')
    if low is None:  # brokerage rows carry no 52-wk low — borrow the universe row's
        for key in UNIV:
            for r in D.get(key, []):
                if r.get('ticker') == tk and r.get('low') is not None and r.get('dq') not in ('error', 'missing'):
                    low = r.get('low'); break
            if low is not None: break
    return {'status': base.get('status'), 'cross': base.get('cross'),
            'off': base.get('off'), 'price': base.get('price'), 'low': low}

def _pctoff(off):
    if off is None: return '—'
    return ('−' if off < 0 else '+') + format(abs(off) * 100, '.0f') + '% off high'

def _transitions(prev, cur, date, tk, account):
    evs = []
    ps, cs = prev.get('status'), cur.get('status')
    if ps in STAT and cs in STAT and STAT[cs] != STAT[ps]:
        if STAT[cs] > STAT[ps]:
            kind = 'bear' if cs == 'Bear' else 'correction'
            evs.append(dict(kind=kind, sev='warn', label='entered ' + cs,
                            text='Entered ' + cs + ' (' + _pctoff(cur.get('off')) + ')'))
        else:
            evs.append(dict(kind='recover', sev='good', label='recovered to ' + cs,
                            text='Recovered to ' + cs))
    pc, cc = prev.get('cross'), cur.get('cross')
    if cc == 'Death Cross' and pc != 'Death Cross':
        evs.append(dict(kind='death', sev='warn', label='Death Cross', text='Death Cross (50-day below 200-day)'))
    elif cc == 'Golden Cross' and pc != 'Golden Cross':
        evs.append(dict(kind='golden', sev='good', label='Golden Cross', text='Golden Cross (50-day above 200-day)'))
    plow, clow = prev.get('low'), cur.get('low')
    if clow is not None and plow is not None and clow < plow * 0.999:
        px = cur.get('price')
        evs.append(dict(kind='low52', sev='warn', label='new 52-week low',
                        text='New 52-week low' + (' ($' + format(px, ',.2f') + ')' if px is not None else '')))
    for e in evs:
        e.update(date=date, ticker=tk, account=account,
                 **{'from': {'status': ps, 'off': prev.get('off')},
                    'to': {'status': cs, 'off': cur.get('off'), 'price': cur.get('price')},
                    'cross': cc if cc in ('Death Cross', 'Golden Cross') else None})
    return evs

def _within(evdate, today, days):
    try:
        d0 = datetime.date.fromisoformat(evdate); d1 = datetime.date.fromisoformat(today)
        return 0 <= (d1 - d0).days <= days
    except Exception:
        return True

def build_map(store, today):
    """Group the last WINDOW_DAYS of events by ticker -> primary + history."""
    recent = [e for e in store if _within(e.get('date', today), today, WINDOW_DAYS)]
    by = {}
    for e in recent:
        by.setdefault(e['ticker'], []).append(e)
    out = {}
    for tk, evs in by.items():
        evs_sorted = sorted(evs, key=lambda x: x.get('date', ''), reverse=True)
        def rank(e):
            k = e.get('kind')
            return (PRIORITY.index(k) if k in PRIORITY else 99, )
        primary = sorted(evs_sorted, key=lambda e: (rank(e), _neg_date(e.get('date', ''))))[0]
        out[tk] = {
            'kind': primary.get('kind'), 'sev': primary.get('sev'), 'label': primary.get('label'),
            'date': primary.get('date'), 'account': primary.get('account'),
            'cross': primary.get('cross'), 'from': primary.get('from'), 'to': primary.get('to'),
            'history': [{'date': e.get('date'), 'kind': e.get('kind'), 'text': e.get('text')} for e in evs_sorted],
        }
    return out

def _neg_date(d):
    try: return -datetime.date.fromisoformat(d).toordinal()
    except Exception: return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--prior'); ap.add_argument('--today')
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    ap.add_argument('--emit', action='store_true')
    a = ap.parse_args()
    store = _load_store()
    if a.emit or not (a.prior and a.today):
        print(json.dumps(build_map(store, a.date), separators=(',', ':')))
        return
    prevD = json.load(open(a.prior, encoding='utf-8'))
    curD = json.load(open(a.today, encoding='utf-8'))
    held = _held(curD)
    new = []
    for tk in held:
        p = _snap(prevD, tk); c = _snap(curD, tk)
        if not p or not c:
            continue
        new += _transitions(p, c, a.date, tk, _account(curD, tk))
    # dedupe by (date,ticker,kind); append only unseen
    seen = {(e.get('date'), e.get('ticker'), e.get('kind')) for e in store}
    added = 0
    for e in new:
        k = (e.get('date'), e.get('ticker'), e.get('kind'))
        if k not in seen:
            store.append(e); seen.add(k); added += 1
    # prune
    store = [e for e in store if _within(e.get('date', a.date), a.date, KEEP_DAYS)]
    _save_store(store)
    sys.stderr.write('alerts: +%d new (%d held scanned, %d in store)\n' % (added, len(held), len(store)))
    print(json.dumps(build_map(store, a.date), separators=(',', ':')))

if __name__ == '__main__':
    main()
