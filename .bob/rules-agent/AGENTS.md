# Project Coding Rules (Non-Obvious Only)

- **Never edit `scripts/dashboard_tpl.html` directly** — it is assembled from `src/dash/*.js` by `python scripts/assemble_dashboard.py --write`. Edits will be overwritten on next build.
- **`src/dash/76_ranking_engine.js` and `src/dash/12_glossary_data.js` are generated files** — edit `src/ranking/` or `data/glossary/*.json` then regenerate with `node scripts/sync_engine.js` / `python scripts/build_glossary.py`.
- **Hoist `function` declarations** for anything reached during panel build (load-time IIFEs run before `const`/`let` in later modules are initialized). `function` decls are hoisted; arrow functions assigned to `const` are not.
- **No ES modules** — the dashboard is a single inline `<script>` with no `import`/`export`. All globals go on `globalThis` via `var` or `function`.
- **MANIFEST order matters** — `12_glossary_data.js` must precede `10_helpers.js`; `49_montecarlo.js` and `52_lookthrough.js` must precede `60_portfolio.js`. Order in `scripts/assemble_dashboard.py`'s `MANIFEST` list is the JS load order.
- **DATA has exactly 19 keys** — `sp`, `nasdaq`, `dow`, `etfs`, `thematic`, `mutualfunds`, `ira`, `brokerage`, `coreRank`, `splits`, `indexHistory`, `macroHistory`, `history`, `alerts`, `dividends`, `dcf`, `lookthrough`, `earnings`, `dcfMonitor`. Missing a key fails the integration test.
- **Both HTML copies must be byte-identical** — always write `scripts/dashboard.html` AND `dashboard/tech_drawdown_dashboard.html` together; `test_integration.js` reads the latter.
- **`tests/dash/_dom.js` is the test harness** — use `loadModule('XX_name.js')` to eval a module into `globalThis`, `extractFn(module, fn)` to pull a single function without triggering load-time panel builds.
- **`tests/dash/test_integration.js` requires injected DATA** — it reads `dashboard/tech_drawdown_dashboard.html`. Running it against a template-only file (with `__DATA__` placeholder) will fail.
- **Ranking engine tests use plain `node file.js`**, not `node --test` — `tests/ranking/*.js` use manual `console.error` + `process.exit(1)` patterns, not the Node test runner.
- **`src/ranking/engine.js` UMD wrapper** — wraps in `(function(root, factory){...})(typeof self!=='undefined'?self:this, function(){...})` so it attaches to `root.RankingEngine` in browser and `module.exports` in Node.
- **Preserve-on-failure everywhere** — pipeline steps must never blank a prior good DATA value on error; carry forward the last known value instead.
