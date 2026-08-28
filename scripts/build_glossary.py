"""Generate src/dash/12_glossary_data.js from data/glossary/*.json (build-time embed).
The deployed dashboard is a single self-contained file, so glossary text is externalized
as editable per-language JSON here and baked in at build time. English only today;
drop in data/glossary/<lang>.json (UTF-8) to add a language (i18n roadmap).
Usage: python build_glossary.py   (writes src/dash/12_glossary_data.js)"""
import os, sys, json, glob
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("TDD_BASE") or os.path.dirname(HERE)
GDIR = os.path.join(BASE, "data", "glossary")
OUT  = os.path.join(BASE, "src", "dash", "12_glossary_data.js")

def main():
    langs = {}
    for p in sorted(glob.glob(os.path.join(GDIR, "*.json"))):
        lang = os.path.splitext(os.path.basename(p))[0]
        langs[lang] = json.load(open(p, encoding="utf-8"))
    if "en" not in langs:
        print("ERROR: data/glossary/en.json is required"); sys.exit(1)
    body = ("// GENERATED from data/glossary/*.json by scripts/build_glossary.py — DO NOT EDIT HERE.\n"
            "var GLOSS_DATA=" + json.dumps(langs, ensure_ascii=False, separators=(",", ":")) + ";\n"
            "var GLOSS_LANG='en';\n")
    open(OUT, "w", encoding="utf-8").write(body)
    print("wrote", os.path.relpath(OUT), "-", ", ".join("%s(%d)" % (k, len(v)) for k, v in langs.items()))

if __name__ == "__main__":
    main()
