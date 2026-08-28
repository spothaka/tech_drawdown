/* Reusable stubbed-DOM harness for the client-side dashboard modules (src/dash/*.js).
 *
 * The deployed artifact is one <script> scope with no build step, so the only way to unit-test
 * its modules in Node is to eval the module source with a stubbed DOM + Chart + the shared globals
 * the module expects (DATA, RET_CFG, fmtUsd, ov/mTitle/mBody, ...). node --check catches syntax;
 * the golden-master catches assembly drift; THIS catches runtime behaviour — the class of bug that
 * blanks panels or drops KPI tiles (a truncated module, a null deref, a wrong DATA shape).
 *
 * Usage in a test file:
 *   const {installDom, loadModule, PROJ} = require('./_dom');
 *   const dom = installDom();
 *   global.DATA = {...}; global.fmtUsd = v=>'$'+Math.round(v);
 *   loadModule('49_montecarlo.js');        // its functions are now on globalThis
 *   assert.ok(mcRun().pct.p50);
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ = path.join(__dirname, '..', '..');
const SRC  = path.join(PROJ, 'src', 'dash');

// A proxy that answers ANY chained get/call with another proxy — enough for Chart.defaults.plugins
// .legend.labels = {...} and new Chart(...).update() without modelling Chart.js.
function deepProxy() {
  const f = function () {};
  return new Proxy(f, {
    get(_t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; return deepProxy(); },
    set() { return true; },
    apply() { return deepProxy(); },
    construct() { return deepProxy(); },
  });
}

function makeEl(id) {
  const cls = new Set();
  const attrs = {};
  const qcache = {};
  const el = {
    id: id || '', tagName: 'DIV', _html: '', _text: '', _val: '', style: {}, dataset: {},
    children: [], _q: qcache,
    classList: {
      _s: cls,
      add(...a) { a.forEach(x => cls.add(x)); },
      remove(...a) { a.forEach(x => cls.delete(x)); },
      toggle(x, f) { const has = cls.has(x); const on = (f === undefined) ? !has : f; on ? cls.add(x) : cls.delete(x); return on; },
      contains(x) { return cls.has(x); },
    },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get textContent() { return this._text || this._html; }, set textContent(v) { this._text = String(v); },
    get value() { return this._val; }, set value(v) { this._val = String(v); },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return (k in attrs) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, prepend() {},
    insertAdjacentHTML() {}, insertBefore(c) { this.children.push(c); return c; },
    querySelector(sel) { return qcache[sel] || (qcache[sel] = makeEl('q:' + sel)); },
    querySelectorAll() { return []; },
    closest() { return null; }, matches() { return false; }, contains() { return false; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getContext() { return deepProxy(); },
    getBoundingClientRect() { return { top: 0, left: 0, width: 900, height: 420, bottom: 420, right: 900 }; },
    onclick: null, oninput: null, onchange: null, onkeydown: null,
  };
  return el;
}

function installDom() {
  const g = global;
  const store = {};
  g.self = g;                              // UMD root: `typeof self!=='undefined'?self:this`
  const doc = {
    getElementById: (id) => store[id] || (store[id] = makeEl(id)),
    createElement: (t) => makeEl(t),
    createElementNS: () => makeEl('ns'),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    activeElement: makeEl('active'),
    get cookie() { return ''; }, set cookie(_v) {},
  };
  g.document = doc;
  g.window = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    location: { search: '', href: '', hash: '' },
    devicePixelRatio: 1,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (cb) => { try { cb && cb(0); } catch (e) {} return 0; },
    cancelAnimationFrame() {},
    scrollTo() {}, setTimeout: () => 0, clearTimeout() {},
    innerWidth: 1280, innerHeight: 800,
  };
  g.navigator = { userAgent: 'node-test', language: 'en-US' };
  g.Chart = function () { return deepProxy(); };
  g.Chart.defaults = deepProxy();
  g.Chart.register = () => {};
  g.Chart.registerables = [];
  g.localStorage = { _m: {}, getItem(k) { return (k in this._m) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; } };
  g.sessionStorage = g.localStorage;
  g.fetch = () => Promise.reject(new Error('no-net-in-tests'));
  g.requestAnimationFrame = g.window.requestAnimationFrame;
  return { store, doc, makeEl };
}

// Eval a module's source in a context where its top-level declarations become globals we can call.
// vm.runInThisContext with a non-strict wrapper leaks `function`/`var` decls to globalThis.
function loadModule(name) {
  const code = fs.readFileSync(path.join(SRC, name), 'utf8');
  vm.runInThisContext(code, { filename: name });
}

function readModule(name) { return fs.readFileSync(path.join(SRC, name), 'utf8'); }

// A self-contained sandbox object for vm.createContext — used by the integration test to run the
// WHOLE assembled inline script in an ISOLATED context (so repeated runs don't collide on the
// top-level `const DATA`/`const C` bindings, and so `self`/UMD resolve to the sandbox global).
function makeSandbox() {
  const store = {};
  const doc = {
    getElementById: (id) => store[id] || (store[id] = makeEl(id)),
    createElement: (t) => makeEl(t),
    createElementNS: () => makeEl('ns'),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    activeElement: makeEl('active'),
    get cookie() { return ''; }, set cookie(_v) {},
  };
  const win = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    location: { search: '', href: '', hash: '' },
    devicePixelRatio: 1,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (cb) => { try { cb && cb(0); } catch (e) {} return 0; },
    cancelAnimationFrame() {},
    scrollTo() {}, innerWidth: 1280, innerHeight: 800,
  };
  const ChartFn = function () { return deepProxy(); };
  ChartFn.defaults = deepProxy(); ChartFn.register = () => {}; ChartFn.registerables = [];
  const sandbox = {
    document: doc, window: win, navigator: { userAgent: 'node-test', language: 'en-US' },
    Chart: ChartFn,
    localStorage: { _m: {}, getItem(k) { return (k in this._m) ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; } },
    console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame() {},
    fetch: () => Promise.reject(new Error('no-net-in-tests')),
    Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp, Error, Symbol, Promise, parseFloat, parseInt, isNaN, isFinite,
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._store = store;
  return sandbox;
}

// Extract a single top-level `function NAME(...) { ... }` from a module source by brace-matching,
// so a unit test can eval one helper without triggering the module's load-time panel builds.
function extractFn(moduleName, fnName) {
  const src = fs.readFileSync(path.join(SRC, moduleName), 'utf8');
  const sig = 'function ' + fnName;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('function ' + fnName + ' not found in ' + moduleName);
  // Naive brace count (no string/regex awareness): fine for small self-contained helpers whose only
  // braces are structural. Do NOT use on functions that embed { or } inside a string or regex.
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

module.exports = { installDom, loadModule, readModule, extractFn, deepProxy, makeEl, makeSandbox, PROJ, SRC };
