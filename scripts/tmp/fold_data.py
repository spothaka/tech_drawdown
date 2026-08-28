"""Fold all fresh derived feeds into dash_data_live.json before assembly."""
import json, os, sys
# scripts/tmp/fold_data.py -> up 2 levels to reach project root
BASE        = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS_DIR = os.path.join(BASE, 'scripts')
DATA_DIR    = os.path.join(BASE, 'data')
TMP_DIR     = os.path.join(SCRIPTS_DIR, 'tmp')
sys.path.insert(0, SCRIPTS_DIR)

d = json.load(open(os.path.join(SCRIPTS_DIR, 'dash_data_live.json')))

# 1. Fresh universe
uni = json.load(open(os.path.join(TMP_DIR, 'universe_data.json')))
for k in ('sp','nasdaq','dow','etfs','thematic','mutualfunds'):
    if k in uni: d[k] = uni[k]
print('Universe:', {k: len(d[k]) for k in ('sp','nasdaq','dow','etfs','thematic','mutualfunds')})

# 2. History
try:
    d['history'] = json.load(open(os.path.join(DATA_DIR,'history.json')))
    print('history:', len(d['history']), 'points')
except Exception as e: print('history skip:', e)

# 3. Alerts
try:
    d['alerts'] = json.load(open(os.path.join(DATA_DIR,'alerts.json')))
    print('alerts loaded')
except Exception as e: print('alerts skip:', e)

# 4. Dividends
try:
    d['dividends'] = json.load(open(os.path.join(DATA_DIR,'dividend_schedule.json')))
    print('dividends loaded')
except Exception as e: print('dividends skip:', e)

# 5. DCF
try:
    d['dcf'] = json.load(open(os.path.join(DATA_DIR,'dcf.json')))
    try:
        anch = json.load(open(os.path.join(DATA_DIR,'dcf_anchor.json')))
        for sym,a in anch.items():
            if sym in d['dcf']: d['dcf'][sym]['anchor'] = a
    except: pass
    try:
        segs = json.load(open(os.path.join(DATA_DIR,'dcf_segments.json')))
        for sym,o in segs.items():
            if sym in d['dcf']:
                d['dcf'][sym]['segments'] = o.get('segments')
                d['dcf'][sym]['segOk'] = o.get('segOk')
                d['dcf'][sym]['segErr'] = o.get('segErr')
    except: pass
    print('dcf:', len(d['dcf']), 'symbols')
except Exception as e: print('dcf skip:', e)

# 6. DCF monitor
try:
    d['dcfMonitor'] = json.load(open(os.path.join(DATA_DIR,'dcf_monitor.json')))
    print('dcfMonitor:', len(d['dcfMonitor'].get('names',{})), 'symbols')
except Exception as e: print('dcfMonitor skip:', e)

# 7. Splits
try:
    d['splits'] = json.load(open(os.path.join(DATA_DIR,'splits.json')))
except: pass

# 8. Lookthrough
try:
    d['lookthrough'] = json.load(open(os.path.join(DATA_DIR,'fund_holdings.json')))
    print('lookthrough loaded')
except Exception as e: print('lookthrough skip:', e)

# 9. Earnings
try:
    d['earnings'] = json.load(open(os.path.join(DATA_DIR,'earnings.json')))
    print('earnings loaded')
except Exception as e: print('earnings skip:', e)

print('indexHistory entries:', len(d.get('indexHistory',{})))
print('macroHistory series:', len(d.get('macroHistory',{}).get('series',[])))

# Integrity guard
import integrity_guard
d, findings = integrity_guard.sanitize(d)
print(integrity_guard.format_report(findings))

# Verify 19 keys
assert len(d) == 19, f'Expected 19 keys, got {len(d)}: {list(d.keys())}'
print('Keys OK:', list(d.keys()))

json.dump(d, open(os.path.join(SCRIPTS_DIR, 'dash_data_live.json'), 'w'))
print('dash_data_live.json written OK')
