import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/opsplitsing/bridge.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

// bridge.js with a fake worker: `sent` lists what reached the worker, in order; `answer` plays a worker reply.
function bridge() {
  const sent = [];
  let worker;
  class Worker {
    constructor() { worker = this; }
    postMessage(message) { sent.push(message); }
  }
  const window = {fetch: async () => { throw new Error('Not an opsplitsing request'); }};
  vm.runInContext(source, vm.createContext({window, Worker, Response, DOMException, document: {addEventListener() {}}, localStorage: {}}));
  const call = (path, body = {}, voortgang) => {
    const outcome = {settled: false};
    outcome.promise = window.fetch(path, {method: 'POST', body: JSON.stringify(body), voortgang}).then(
      response => { outcome.settled = true; return response; },
      error => { outcome.settled = true; outcome.error = error; return null; });
    return outcome;
  };
  const reply = (message, payload) => worker.onmessage({data: {id: message.id, ...payload}});
  const answer = (message, result = {ok: message.path}) => reply(message, {result});
  return {sent, call, answer, reply, fail: () => worker.onerror(), paths: () => sent.map(message => message.path.replace('/api/opsplitsing', '') || '/run')};
}

test('the worker receives one request at a time', async () => {
  const {sent, call, answer} = bridge();
  const first = call('/api/opsplitsing', {n: 1}), second = call('/api/opsplitsing/dag');
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].path, '/api/opsplitsing');
  assert.equal(sent[0].body.n, 1);
  answer(sent[0]);
  await tick();
  assert.equal(sent.length, 2);
  assert.equal((await first.promise).status, 200);
  assert.deepEqual(await (await first.promise).json(), {ok: '/api/opsplitsing'});
  answer(sent[1]);
  assert.equal((await second.promise).status, 200);
});

test('/dag overtakes /gevoeligheid and /omslagkaart that are still waiting', async () => {
  const {call, answer, sent, paths} = bridge();
  call('/api/opsplitsing');
  call('/api/opsplitsing/gevoeligheid', {n: 4});
  call('/api/opsplitsing/omslagkaart');
  call('/api/opsplitsing/dag', {datum: '2024-01-02'});
  for (let i = 0; i < 4; i++) { await tick(); answer(sent[i]); }
  await tick();
  assert.deepEqual(paths(), ['/run', '/dag', '/gevoeligheid', '/omslagkaart']);
});

test('a waiting request is dropped with an AbortError when a newer one of the same kind arrives', async () => {
  const {call, answer, sent, paths} = bridge();
  const running = call('/api/opsplitsing/gevoeligheid', {n: 2});
  const old = call('/api/opsplitsing/gevoeligheid', {n: 3});
  const newer = call('/api/opsplitsing/gevoeligheid', {n: 4});
  await tick();
  assert.equal(old.settled, true);
  assert.equal(old.error.name, 'AbortError');
  assert.equal(running.settled, false, 'A running calculation cannot be interrupted and is left alone');
  assert.equal(newer.settled, false);
  answer(sent[0]);
  await tick();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.n, 4, 'Only the newest request is computed');
  answer(sent[1]);
  assert.equal((await running.promise).status, 200);
  assert.equal((await newer.promise).status, 200);
  assert.deepEqual(paths(), ['/gevoeligheid', '/gevoeligheid']);
});

test('a request that is already running is never cancelled by a newer one', async () => {
  const {call, answer, sent} = bridge();
  const day = call('/api/opsplitsing/dag', {datum: '2024-01-02'});
  await tick();
  const newer = call('/api/opsplitsing/dag', {datum: '2024-01-03'});
  await tick();
  assert.equal(day.settled, false);
  assert.equal(sent.length, 1);
  answer(sent[0]);
  assert.equal((await day.promise).status, 200);
  await tick();
  answer(sent[1]);
  assert.equal((await newer.promise).status, 200);
  assert.equal(day.error, undefined);
});

test('requests of different kinds do not replace each other; Bereken replaces only an older Bereken', async () => {
  const {call, answer, sent, paths} = bridge();
  call('/api/opsplitsing/aannames');
  const sensitivity = call('/api/opsplitsing/gevoeligheid');
  const map = call('/api/opsplitsing/omslagkaart');
  const day = call('/api/opsplitsing/dag');
  const oldRun = call('/api/opsplitsing', {id: 'old'});
  const newRun = call('/api/opsplitsing', {id: 'new'});
  await tick();
  assert.equal(oldRun.error.name, 'AbortError');
  for (const outcome of [sensitivity, map, day, newRun]) assert.equal(outcome.settled, false);
  for (let i = 0; i < 5; i++) { await tick(); answer(sent[i]); }
  await tick();
  assert.deepEqual(paths(), ['/aannames', '/run', '/dag', '/gevoeligheid', '/omslagkaart']);
  assert.equal(sent[1].body.id, 'new');
});

test('the aannames request is never replaced', async () => {
  const {call, answer, sent} = bridge();
  call('/api/opsplitsing');
  const first = call('/api/opsplitsing/aannames'), second = call('/api/opsplitsing/aannames');
  await tick();
  answer(sent[0]);
  await tick();
  answer(sent[1]);
  await tick();
  answer(sent[2]);
  assert.equal(first.error, undefined);
  assert.equal((await first.promise).status, 200);
  assert.equal((await second.promise).status, 200);
});

test('model errors come back as a 400 response and a worker crash fails every waiting request', async () => {
  const {call, sent, reply, fail} = bridge();
  const failing = call('/api/opsplitsing');
  await tick();
  reply(sent[0], {error: 'De berekening is mislukt: x'});
  const response = await failing.promise;
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {error: 'De berekening is mislukt: x'});

  const running = call('/api/opsplitsing/dag');
  const waiting = call('/api/opsplitsing/gevoeligheid');
  await tick();
  fail();
  for (const outcome of [running, waiting]) {
    const crashed = await outcome.promise;
    assert.equal(crashed.status, 400);
    assert.match((await crashed.json()).error, /Het rekenmodel kon niet starten/);
  }
});

test('bridge.js and opsplitsing.js load in one global scope without clashing names', async () => {
  // Both are classic scripts on the same page: a top-level let/const with the same name in each is a SyntaxError that
  // stops the whole UI from loading.
  const ui = await readFile(new URL('../src/opsplitsing/opsplitsing.js', import.meta.url), 'utf8');
  const window = {fetch: async () => { throw new Error('Not an opsplitsing request'); }};
  const context = vm.createContext({window, Worker: class { postMessage() {} }, Response, DOMException, document: {addEventListener() {}, getElementById: () => ({})}, localStorage: {}, Intl});
  vm.runInContext(source, context);
  assert.doesNotThrow(() => vm.runInContext(ui.replace(/^\s*start\(\);\s*$/m, ''), context));
});

// ---------------------------------------------------------------- voortgang

// A progress callback that records what it hears (as plain objects: the bridge runs in another realm).
const listener = () => { const heard = []; const update = state => heard.push(JSON.parse(JSON.stringify(state))); update.heard = heard; return update; };

test('progress for the running request reaches its callback and does not settle it', async () => {
  const {call, sent, reply, answer} = bridge();
  const update = listener();
  const run = call('/api/opsplitsing', {}, update);
  await tick();
  assert.deepEqual(update.heard, [], 'A request that starts at once does not wait');
  reply(sent[0], {voortgang: {fase: 'rekenen'}});
  reply(sent[0], {voortgang: {fase: 'simulaties', klaar: 1, totaal: 40}});
  await tick();
  assert.deepEqual(update.heard, [{fase: 'rekenen'}, {fase: 'simulaties', klaar: 1, totaal: 40}]);
  assert.equal(run.settled, false, 'Progress is not an answer');
  answer(sent[0]);
  assert.equal((await run.promise).status, 200);
  reply(sent[0], {voortgang: {fase: 'simulaties', klaar: 2, totaal: 40}});
  assert.equal(update.heard.length, 2, 'Nothing arrives after the answer');
});

test('a waiting request hears what it waits for; progress only goes to the running request', async () => {
  const {call, sent, reply, answer} = bridge();
  const sensitivity = listener(), day = listener(), map = listener();
  call('/api/opsplitsing/gevoeligheid', {n: 4}, sensitivity);
  call('/api/opsplitsing/omslagkaart', {}, map);
  call('/api/opsplitsing/dag', {datum: '2024-01-02'}, day);
  await tick();
  assert.deepEqual(day.heard, [{fase: 'wachten', na: 'gevoeligheid'}]);
  assert.deepEqual(map.heard, [{fase: 'wachten', na: 'gevoeligheid'}]);
  reply(sent[0], {voortgang: {fase: 'simulaties', klaar: 3, totaal: 112}});
  reply({id: 99}, {voortgang: {fase: 'simulaties', klaar: 1, totaal: 2}});
  assert.equal(sensitivity.heard.length, 1);
  assert.equal(day.heard.length, 1, 'Progress of another request is not passed on');
  answer(sent[0]);
  await tick();
  assert.equal(sent[1].path, '/api/opsplitsing/dag');
  assert.deepEqual(map.heard.at(-1), {fase: 'wachten', na: 'dag'}, 'The map now waits for the day');
  reply(sent[1], {voortgang: {fase: 'windjaar', jaar: 2024}});
  assert.deepEqual(day.heard.at(-1), {fase: 'windjaar', jaar: 2024});
  assert.equal(sensitivity.heard.length, 1);
});

test('a replaced request hears nothing more; its replacement takes over', async () => {
  const {call, sent, answer, reply} = bridge();
  call('/api/opsplitsing/omslagkaart', {}, listener());
  const old = listener(), newer = listener();
  const replaced = call('/api/opsplitsing/gevoeligheid', {n: 3}, old);
  call('/api/opsplitsing/gevoeligheid', {n: 4}, newer);
  await tick();
  assert.equal(replaced.error.name, 'AbortError');
  assert.deepEqual(old.heard, [{fase: 'wachten', na: 'omslagkaart'}]);
  answer(sent[0]);
  await tick();
  reply(sent[1], {voortgang: {fase: 'simulaties', klaar: 0, totaal: 112}});
  assert.deepEqual(old.heard, [{fase: 'wachten', na: 'omslagkaart'}]);
  assert.deepEqual(newer.heard, [{fase: 'wachten', na: 'omslagkaart'}, {fase: 'simulaties', klaar: 0, totaal: 112}]);
});

test('requests without a progress callback still work', async () => {
  const {call, sent, reply, answer} = bridge();
  const first = call('/api/opsplitsing'), second = call('/api/opsplitsing/dag');
  await tick();
  reply(sent[0], {voortgang: {fase: 'rekenen'}});
  assert.equal(first.settled, false);
  answer(sent[0]);
  await tick();
  answer(sent[1]);
  assert.equal((await first.promise).status, 200);
  assert.equal((await second.promise).status, 200);
});

test('saved scenarios from before model version 17 (old wind method or BoP 0) are listed as outdated', async () => {
  const row = {modules: 1, lcoh_eur_kg: 8, waterstof_t: 3000};
  const item = (id, model_versie, windmethode = 'onafhankelijk') => ({id, naam: id, gemaakt: '2026-10-01T00:00:00Z',
    resultaat: {model_versie, windmethode, strategie: 'verdelen', jaren: [2025], rijen: [row]}});
  const saved = [item('oud', 12, 'productie_hoogste'), item('zonder-bop', 16), item('nu', 17)];
  const window = {fetch: async () => { throw new Error('Not an opsplitsing request'); }};
  vm.runInContext(source, vm.createContext({window, Worker: class { postMessage() {} }, Response, DOMException, document: {addEventListener() {}},
    localStorage: {getItem: () => JSON.stringify(saved)}}));
  const {scenarios} = await (await window.fetch('/api/opsplitsing/scenarios')).json();
  assert.deepEqual(scenarios.map(s => [s.id, s.verouderd, s.verouderd ? s.reden : null]),
    [['oud', true, 'productie_hoogste'], ['zonder-bop', true, 'zonder BoP'], ['nu', false, null]]);
});
