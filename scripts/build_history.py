"""Portfolio value history — pure transform + idempotent daily append.

Maintains data/history.json: an ordered list of daily household snapshots
    {"date":"YYYY-MM-DD", "total":<ira+brokerage>, "ira":<..>, "brokerage":<..>}
The benchmark card indexes `total` to 100 and overlays it on the real 1-year
index curves (DATA.indexHistory). No external fetch — totals come from the
already-computed IRA/Brokerage market values in the deployed dashboard DATA,
so the history is exactly consistent with what the portfolio tabs show.

Usage:
  python build_history.py --from-dashboard ../dashboard/tech_drawdown_dashboard.html [--date YYYY-MM-DD]
  python build_history.py --ira 297934 --brokerage 336164 [--date YYYY-MM-DD]
  python build_history.py --emit          # print DATA.history JSON slice to stdout
Appends today's record (idempotent per date: re-running the same day overwrites,
not duplicates). Prints the embed-ready DATA.history slice.
"""
import os, sys, json, re, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HIST = os.path.join(ROOT, 'data', 'history.json')
MAX_POINTS = 260  # ~5 years of weekly points; daily appends are downsampled below

def _load():
    if os.path.exists(HIST):
        try:
            return json.load(open(HIST, 'r', encoding='utf-8'))
        except Exception:
            return []
    return []

def _save(rows):
    os.makedirs(os.path.dirname(HIST), exist_ok=True)
    json.dump(rows, open(HIST, 'w', encoding='utf-8'), indent=0)

def totals_from_dashboard(path):
    html = open(path, 'r', encoding='utf-8').read()
    i = html.index('const DATA'); j = html.index('{', i)
    depth = 0; k = j
    while k < len(html):
        c = html[k]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    D = json.loads(html[j:k + 1])
    ira = sum(float(h.get('value') or 0) for h in D.get('ira', []))
    bk  = sum(float(h.get('value') or 0) for h in D.get('brokerage', []))
    return round(ira, 2), round(bk, 2)

def append(date, ira, bk):
    rows = _load()
    rec = {"date": date, "total": round(ira + bk, 2), "ira": round(ira, 2), "brokerage": round(bk, 2)}
    rows = [r for r in rows if r.get('date') != date]  # idempotent per date
    rows.append(rec)
    rows.sort(key=lambda r: r['date'])
    if len(rows) > MAX_POINTS:
        rows = rows[-MAX_POINTS:]
    _save(rows)
    return rec, rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-dashboard')
    ap.add_argument('--ira', type=float)
    ap.add_argument('--brokerage', type=float)
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    ap.add_argument('--emit', action='store_true')
    a = ap.parse_args()
    if a.emit and not (a.from_dashboard or a.ira is not None):
        print(json.dumps(_load(), separators=(',', ':')))
        return
    if a.from_dashboard:
        ira, bk = totals_from_dashboard(a.from_dashboard)
    elif a.ira is not None and a.brokerage is not None:
        ira, bk = a.ira, a.brokerage
    else:
        ap.error('need --from-dashboard or (--ira and --brokerage)')
    rec, rows = append(a.date, ira, bk)
    sys.stderr.write(f"appended {rec}  ({len(rows)} points)\n")
    print(json.dumps(rows, separators=(',', ':')))

if __name__ == '__main__':
    main()
