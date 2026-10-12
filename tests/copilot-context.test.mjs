import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CC = require('../ui/copilot-context.js');

test('changedFields returns only edited top-level fields', () => {
  assert.deepEqual(CC.changedFields({ a: 1, b: [1, 2], c: 'x' }, { a: 1, b: [1, 2], c: 'y', d: 'new' }), { c: 'y', d: 'new' });
  assert.deepEqual(CC.changedFields(null, { a: 1 }), { a: 1 });
});

test('recipeSnapshot reports only differences and never dumps invalid text', () => {
  const recipe = { title: 'Plate', parts: [{ size: [1, 2, 3] }] };
  const text = JSON.stringify(recipe, null, 2);
  const base = { loadedId: 'b1', loadedRecipe: recipe, loadedText: text };
  assert.deepEqual(CC.recipeSnapshot({ ...base, text }), { kind: 'cad_recipe', object_id: 'b1', dirty: false, fields: {} });
  const edited = CC.recipeSnapshot({ ...base, text: JSON.stringify({ ...recipe, title: 'Other' }) });
  assert.equal(edited.dirty, true);
  assert.deepEqual(edited.fields, { title: 'Other' });
  const broken = CC.recipeSnapshot({ ...base, text: '{' + 'x'.repeat(9000) });
  assert.equal(broken.fields.invalid_json, true);
  assert.equal(broken.fields.recipe_text.length, 4000);
  assert.equal(CC.recipeSnapshot({ loadedRecipe: null, loadedText: '', text: '[]' }).object_id, null);
});

test('editorContext picks the first dirty form, lists several, undefined without forms', () => {
  const target = new EventTarget();
  assert.deepEqual(CC.editorContext(target), { editor: undefined, editors: undefined });
  target.addEventListener('heron:context-request', e => e.detail.provide({ kind: 'a', object_id: null, dirty: false, fields: {} }));
  target.addEventListener('heron:context-request', e => e.detail.provide({ kind: 'b', object_id: 'x', dirty: true, fields: { t: 1 } }));
  target.addEventListener('heron:context-request', e => e.detail.provide('junk'));
  const got = CC.editorContext(target);
  assert.equal(got.editor.kind, 'b');
  assert.equal(got.editors.length, 2);
});

test('debounced coalesces a burst into one trailing run', () => {
  let pending = null, runs = 0;
  const timers = { set: fn => { pending = fn; return 1; }, clear: () => { pending = null; } };
  const schedule = CC.debounced(() => { runs += 1; }, 250, timers);
  schedule(); schedule();
  pending();
  assert.equal(runs, 1);
});

test('buildContext lists the real build; new, history and failures give no object', () => {
  const row = { id: 'b1', state: 'finished', recipe: { title: 'Plate', parts: [{}, {}] }, result: { solids: 1, bounds_mm: [80, 50, 5], volume_mm3: 1.5, valid: true, mesh: { watertight: true }, files: { 'model.step': {}, 'model.stl': {} } } };
  const ctx = CC.buildContext({ row, page: 'build' });
  assert.deepEqual(ctx.active_objects[0], { kind: 'cad_build', object_id: 'b1', title: 'Plate', state: 'finished', parts: 2, solids: 1, bounds_mm: [80, 50, 5], volume_mm3: 1.5, valid: true, watertight: true, files: ['model.step', 'model.stl'] });
  assert.deepEqual(ctx.view, { page: 'build', object_id: 'b1' });
  assert.equal(ctx.project, undefined);
  const failed = CC.buildContext({ row: { id: 'b2', state: 'failed', recipe: { title: 'T', parts: [] }, result: { ok: false, error: 'boom' } }, page: 'build' });
  assert.equal(failed.active_objects[0].error, 'boom');
  assert.deepEqual(CC.buildContext({ page: 'history' }), { active_objects: [], view: { page: 'history' } });
  assert.deepEqual(CC.buildContext({ row: null, page: 'build' }).active_objects, []);
  assert.deepEqual(CC.buildContext({}).view, { page: 'new' });
});

// ---- the shipping app.js against stubbed DOM and API ----
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.attributes = {}; this.value = ''; this.textContent = ''; this.disabled = false; }
  append(...v) { this.children.push(...v); }
  replaceChildren(...v) { this.children = v; }
  setAttribute(k, v) { this.attributes[k] = v; }
  querySelector(sel) { return this.children.find(c => c.tag === sel) || null; }
}
const plain = x => JSON.parse(JSON.stringify(x));
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const template = { title: 'Plate', parts: [{ size: [80, 50, 5] }] };
const finished = id => ({ id, state: 'finished', recipe: template, downloads: { 'isometric.svg': '/i', 'front.svg': '/f', 'top.svg': '/t', 'model.step': '/s', 'model.stl': '/l' }, result: { solids: 1, bounds_mm: [80, 50, 5], volume_mm3: 10, valid: true, mesh: { watertight: true }, files: { 'model.step': {}, 'model.stl': {} } } });

function boot(handler) {
  const els = new Map();
  const document = { getElementById: id => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); }, createElement: t => new Element(t) };
  const window = new EventTarget();
  const calls = [];
  const fetch = async (path, options) => {
    calls.push((options && options.method || 'GET') + ' ' + path);
    return handler(path, options);
  };
  const ctx = vm.createContext({ document, window, fetch, CustomEvent, EventTarget, setTimeout, clearTimeout, console, crypto: { randomUUID: () => 'new-uuid' }, location: { search: '', pathname: '/' }, history: { replaceState() {} } });
  document.getElementById('template').value = 'plate';
  vm.runInContext(fs.readFileSync('ui/copilot-context.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('ui/app.js', 'utf8'), ctx);
  return { els, window, calls, q: id => document.getElementById(id) };
}
const json = (data, ok = true) => ({ ok, json: async () => data });
const base = extra => (path, options) => {
  if (path === '/api/templates') return json({ templates: { plate: template }, recipe_schema: {} });
  return extra(path, options);
};

test('context() reads the open build through the app API and answers the recipe form', async () => {
  const app = boot(base((path, o) => {
    if (path === '/api/builds' && o && o.method === 'POST') return json(finished('b1'));
    if (path === '/api/builds/b1') return json(finished('b1'));
    return json({}, false);
  }));
  await tick();
  let ctx = plain(await app.window.hoardCopilot.context());
  assert.deepEqual(ctx.active_objects, []);
  assert.equal(ctx.view.page, 'new');
  assert.equal(ctx.view.editor.object_id, null);
  assert.equal(ctx.view.editor.dirty, false);
  await app.q('build').onclick(); await tick();
  app.q('recipe').value = JSON.stringify({ ...template, title: 'Draft' });
  ctx = plain(await app.window.hoardCopilot.context());
  assert.deepEqual(ctx.active_objects.map(o => [o.kind, o.object_id]), [['cad_build', 'b1']]);
  assert.deepEqual(ctx.view.page, 'build');
  assert.equal(ctx.view.object_id, 'b1');
  assert.equal(ctx.view.editor.object_id, 'b1');
  assert.equal(ctx.view.editor.dirty, true);
  assert.deepEqual(ctx.view.editor.fields, { title: 'Draft' });
});

test('context() never throws: fetch errors and unknown ids yield no object', async () => {
  let fail = false;
  const app = boot(base(path => {
    if (fail) throw new Error('offline');
    if (path === '/api/builds') return json(finished('gone'));
    return json({ detail: 'Build not found' }, false);
  }));
  await tick();
  await app.q('build').onclick(); await tick();
  let ctx = plain(await app.window.hoardCopilot.context());
  assert.deepEqual(ctx.active_objects, []);
  fail = true;
  ctx = plain(await app.window.hoardCopilot.context());
  assert.deepEqual(ctx.active_objects, []);
});

test('turn end refreshes once for both triggers and keeps the half-typed recipe', async () => {
  const app = boot(base((path, o) => {
    if (path === '/api/builds' && o && o.method === 'POST') return json(finished('b1'));
    return json(finished('b1'));
  }));
  await tick();
  await app.q('build').onclick(); await tick();
  const before = app.calls.length;
  app.q('recipe').value = '{"title": "typed by han';
  app.window.dispatchEvent(new Event('hoard:copilot-turn-end'));
  app.window.hoardCopilot.onTurnEnd();
  await tick(400);
  assert.equal(app.calls.length - before, 1);
  assert.equal(app.calls.at(-1), 'GET /api/builds/b1');
  assert.equal(app.q('recipe').value, '{"title": "typed by han');
});

test('an existing hoardCopilot is not replaced', async () => {
  const els = new Map();
  const document = { getElementById: id => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); }, createElement: t => new Element(t) };
  const window = new EventTarget(); const mine = {}; window.hoardCopilot = mine;
  const ctx = vm.createContext({ document, window, fetch: async () => json({ templates: {}, recipe_schema: {} }), CustomEvent, EventTarget, setTimeout, clearTimeout, console, crypto: {}, location: { search: '' }, history: {} });
  vm.runInContext(fs.readFileSync('ui/copilot-context.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('ui/app.js', 'utf8'), ctx);
  assert.equal(window.hoardCopilot, mine);
});

test('context() describes the view it started in even if the user opens the history while its fetch is pending', async () => {
  let hold = false, release = null;
  const app = boot(base((path, o) => {
    if (path === '/api/builds' && o && o.method === 'POST') return json(finished('b1'));
    if (path === '/api/builds') return json({ builds: [] });
    if (path === '/api/builds/b1') return hold ? new Promise(r => { release = r; }) : json(finished('b1'));
    return json({}, false);
  }));
  await tick();
  await app.q('build').onclick(); await tick();
  hold = true;
  const pending = app.window.hoardCopilot.context();
  await tick();
  await app.q('history').onclick(); await tick();
  release(json({ detail: 'Build not found' }, false));
  const ctx = plain(await pending);
  // Started on a build, the fetch failed: the context must not claim the history page that only opened later.
  assert.equal(ctx.view.page, 'new');
  assert.deepEqual(ctx.active_objects, []);

  // A later call describes what is open now: the history.
  hold = false;
  const again = plain(await app.window.hoardCopilot.context());
  assert.equal(again.view.page, 'history');
});
