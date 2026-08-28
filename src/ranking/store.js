/* Ruleset store — v0.1 (V2 Phase 3)
 * Pure, storage-injectable manager for user-customized rulesets: active override vs baseline,
 * named presets, export/import. Dual-mode (Node tests / browser localStorage).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RankingStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var KEY = "tdd_rulesets_v1";
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage;
    var baselines = opts.baselines || {};
    var validate = opts.validate || function () { return { ok: true, errors: [] }; };
    var metricNames = opts.metricNames || null;

    function _load() { try { return JSON.parse(storage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
    function _ensure(s) { if (!s.overrides) s.overrides = {}; if (!s.presets) s.presets = {}; return s; }
    function _save(s) { storage.setItem(KEY, JSON.stringify(s)); }

    function getRuleset(id) {
      var s = _ensure(_load());
      if (s.overrides[id]) return clone(s.overrides[id]);
      return baselines[id] ? clone(baselines[id]) : null;
    }
    function isModified(id) { return !!_ensure(_load()).overrides[id]; }
    function setActive(id, rs) {
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      var s = _ensure(_load()); s.overrides[id] = clone(rs); _save(s); return { ok: true, errors: [] };
    }
    function resetActive(id) { var s = _ensure(_load()); delete s.overrides[id]; _save(s); return getRuleset(id); }
    function listPresets(id) { return Object.keys(_ensure(_load()).presets[id] || {}); }
    function savePreset(id, name, rs) {
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      var s = _ensure(_load()); (s.presets[id] = s.presets[id] || {})[name] = clone(rs); _save(s); return { ok: true, errors: [] };
    }
    function loadPreset(id, name) { var p = (_ensure(_load()).presets[id] || {})[name]; return p ? clone(p) : null; }
    function deletePreset(id, name) { var s = _ensure(_load()); if (s.presets[id]) delete s.presets[id][name]; _save(s); }
    function exportRuleset(id) { var rs = getRuleset(id); return rs ? JSON.stringify(rs, null, 2) : null; }
    function importRuleset(id, json) {
      var rs; try { rs = typeof json === "string" ? JSON.parse(json) : json; }
      catch (e) { return { ok: false, errors: ["invalid JSON: " + e.message] }; }
      var v = validate(rs, metricNames); if (!v.ok) return { ok: false, errors: v.errors };
      return setActive(id, rs);
    }
    return { getRuleset: getRuleset, isModified: isModified, setActive: setActive, resetActive: resetActive,
      listPresets: listPresets, savePreset: savePreset, loadPreset: loadPreset, deletePreset: deletePreset,
      exportRuleset: exportRuleset, importRuleset: importRuleset, KEY: KEY };
  }
  return { create: create, KEY: KEY };
});
