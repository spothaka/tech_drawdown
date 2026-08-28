#!/usr/bin/env bash
# Full test suite for Tech Drawdown.
#   - ranking engine parity (Node, plain console asserts)
#   - dashboard client modules + whole-artifact integration (Node built-in test runner)
#   - build-script transforms (pytest, if installed)
# Usage: bash tests/run_all.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

# Resolve a working Python. On Linux/CI `python3` works and is picked first; on a
# Windows box where `python3` is the Microsoft Store stub (runs but exits non-zero),
# the probe skips it and falls through. Override with PYTHON_BIN=/path/to/python.
PY=""
for cand in "${PYTHON_BIN:-}" python3 python \
            "/c/Users/${USER:-${USERNAME:-}}/AppData/Local/Programs/Python/Python312/python.exe"; do
  [ -n "$cand" ] || continue
  if "$cand" -c 'import sys' >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then echo "ERROR: no working Python found (set PYTHON_BIN)"; exit 2; fi
echo "Using Python: $PY"
echo

echo "== 1. Golden-master byte check (assembled == deployed template) =="
"$PY" scripts/assemble_dashboard.py || { echo "  GOLDEN-MASTER MISMATCH"; fail=1; }

echo
echo "== 2. Ranking engine parity (Node) =="
for f in tests/ranking/golden_master.js tests/ranking/golden_master_fund.js tests/ranking/golden_master_sector.js; do
  echo "-- $f"
  node "$f" || fail=1
done

echo
echo "== 3. Dashboard client modules + integration (node --test) =="
node --test tests/dash/test_*.js || fail=1

echo
echo "== 4. Build-script transforms (pytest) =="
if "$PY" -m pytest --version >/dev/null 2>&1; then
  "$PY" -m pytest -q tests/scripts || fail=1
else
  echo "  (pytest not installed — skipping; run: pip install pytest --break-system-packages)"
fi

echo
if [ "$fail" -eq 0 ]; then echo "ALL TESTS PASSED"; else echo "SOME TESTS FAILED"; fi
exit "$fail"
