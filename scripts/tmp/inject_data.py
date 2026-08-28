"""Inject DATA into template and write both HTML copies."""
import json, os

SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SCRIPTS_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DASH_DIR    = os.path.normpath(os.path.join(SCRIPTS_DIR, '..', 'dashboard'))

tpl  = open(os.path.join(SCRIPTS_DIR, 'dashboard_tpl.html'), encoding='utf-8').read()
data = open(os.path.join(SCRIPTS_DIR, 'dash_data_live.json'), encoding='utf-8').read()

out = tpl.replace('const DATA = __DATA__;', 'const DATA = ' + data + ';')

# Validate
assert '__DATA__' not in out,           'FAIL: __DATA__ placeholder still present'
assert out.rstrip().endswith('</html>'), 'FAIL: missing </html> terminator'
sc = out.count('</script>')
assert sc == 2, f'FAIL: expected 2 </script>, got {sc}'

out_scripts = os.path.join(SCRIPTS_DIR, 'dashboard.html')
out_dash    = os.path.join(DASH_DIR,    'tech_drawdown_dashboard.html')

with open(out_scripts, 'w', encoding='utf-8') as f: f.write(out)
with open(out_dash,    'w', encoding='utf-8') as f: f.write(out)

# Byte-identity check
assert open(out_scripts, encoding='utf-8').read() == open(out_dash, encoding='utf-8').read(), 'FAIL: files not byte-identical'

print(f'deployed {len(out):,} bytes to both HTML copies — PASS')
print(f'  scripts/dashboard.html')
print(f'  dashboard/tech_drawdown_dashboard.html')
