"""Make scripts/ importable so tests can exercise the build modules directly.

The scripts are standalone (module-level code guarded by `if __name__ == '__main__'`),
so importing them is side-effect-free and lets us unit-test their pure transforms.
"""
import os
import sys

SCRIPTS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
