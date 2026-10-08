#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Amir Zucker
/* chat.test.js — tests for the CHAT CORE region of template.html (retrieval, parsing, navigation rules).
   Run:  node --test chat.test.js        Node 18+, no dependencies. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const FILE = process.env.MAP_HTML || 'template.html'; // another map built from the template can be tested with MAP_HTML=path
const html = fs.readFileSync(path.resolve(__dirname, FILE), 'utf8');

function region(beginRe, endRe, label) {
  const a = html.search(beginRe), b = html.search(endRe);
  if (a < 0 || b < 0 || b <= a) throw new Error(`could not find the ${label} region`);
  return html.slice(html.indexOf('*/', a) + 2, b);
}
const src = region(/\/\* =+ BEGIN DATA DSL/, /\/\* =+ END DATA DSL/, 'DATA DSL')
  + region(/\/\* =+ BEGIN ARCHITECTURE DATA/, /\/\* =+ END ARCHITECTURE DATA/, 'ARCHITECTURE DATA')
  + region(/\/\* =+ BEGIN CHAT CORE/, /\/\* =+ END CHAT CORE/, 'CHAT CORE');
const M = vm.runInNewContext(src + '\n;({ META, PROVIDERS, CATS, KINDS, ZONES, NODES, EDGES, FLOWS, INSIDE, ChatCore })', {}, { filename: FILE });
const { ChatCore } = M;
const { docs, byId } = ChatCore.buildDocs(M);

test('buildDocs: one document per node, district, flow, inside part and connection, plus about', () => {
  const kinds = {}; docs.forEach(d => (kinds[d.kind] = (kinds[d.kind] || 0) + 1));
  const insideNodes = Object.values(M.INSIDE).reduce((s, v) => s + v.nodes.length, 0);
  const insideZones = Object.values(M.INSIDE).reduce((s, v) => s + v.zones.length, 0);
  const insideEdges = Object.values(M.INSIDE).reduce((s, v) => s + v.edges.length, 0);
  assert.equal(kinds.about, 1);
  assert.equal(kinds.node, M.NODES.length + insideNodes);
  assert.equal(kinds.zone, M.ZONES.length + insideZones);
  assert.equal(kinds.flow, M.FLOWS.length);
  assert.equal(kinds.edge, M.EDGES.length + insideEdges);
  assert.equal(byId.get('api').view, 'root');
  assert.equal(byId.get('api.orders').view, 'api');
  assert.equal(byId.get('api.routes').kind, 'zone');
});

test('buildDocs: node card carries id, name, district, category, summary and connections', () => {
  const api = byId.get('api');
  assert.match(api.card, /^api \| Orders API \| Core services \| Core services/);
  assert.match(api.card, /System of record/);
  assert.match(api.card, /Has an inside view/);
  assert.match(api.card, /Storefront → Orders API/);
  assert.ok(api.conns.length >= 5);
  assert.ok(api.neigh.has('postgres') && api.neigh.has('storefront'));
  assert.equal(api.height, 3.2);
});

test('buildDocs: markdown is stripped from searchable text and cards', () => {
  const sf = byId.get('storefront');
  assert.doesNotMatch(sf.text, /\*\*|`/);
  assert.doesNotMatch(byId.get('about').card, /\*\*/);
  assert.match(byId.get('about').card, /Acme sells goods online/);
});

test('buildDocs: flow and district cards', () => {
  assert.match(byId.get('checkout').card, /^checkout \| A shopper checks out \(guided flow\)/);
  assert.match(byId.get('checkout').card, /1\. Shoppers → Storefront/);
  assert.match(byId.get('z_data').card, /^z_data \| Data & messaging \(district\)/);
  assert.match(byId.get('z_data').card, /PostgreSQL/);
});

const top = (q, state) => ChatCore.rank(docs, q, state || {}).map(r => r.doc.id);

test('rank: a named system comes first, by name or by id', () => {
  assert.equal(top('What does the Orders API do, and what talks to it?')[0], 'api');
  assert.equal(top('tell me about the worker')[0], 'worker');
  assert.equal(top('what is postgres used for')[0], 'postgres');
  assert.equal(top('explain api')[0], 'api');
});

test('rank: paraphrases reach the right entity through descriptions and labels', () => {
  assert.ok(top('where do card payments happen').slice(0, 3).includes('stripe'));
  assert.ok(top('how does a change get deployed to production').slice(0, 3).includes('deploy'));
  assert.ok(top('which district holds the databases and queues').slice(0, 3).includes('z_data'));
});

test('rank: connection labels match and point at their endpoints', () => {
  const ids = top('who handles webhooks');
  assert.ok(ids.some(id => id.startsWith('edge:stripe>api') || id === 'api.r_hooks' || id === 'stripe'));
});

test('rank: state boosts the previous target so follow-ups resolve', () => {
  assert.equal(top('and what about its database?', { prevTarget: 'api' }).length > 0, true);
  assert.equal(top('and its jobs?', { prevTarget: 'worker' })[0], 'worker');
  assert.equal(top('what is this?', { selected: 'redis' })[0], 'redis');
});

test('rank: nothing matches and no previous target gives an empty list', () => {
  assert.equal(top('zzzz qqqq').length, 0);
});

test('buildContext: about card first, top documents next, connection hits become their endpoints, budget respected', () => {
  const ranked = ChatCore.rank(docs, 'What does the Orders API do, and what talks to it?', {});
  const ctx = ChatCore.buildContext(ranked, byId, 450);
  const lines = ctx.context.split('\n');
  assert.match(lines[0], /^Acme Commerce:/);
  assert.match(lines[1], /^api \| Orders API/);
  assert.ok(ctx.tokens <= 450 + 120, 'one card may overshoot, never more');
  assert.equal(ctx.candidates[0].doc.id, 'api');
  assert.ok(ctx.candidates.every(c => c.doc.kind !== 'edge'));
  assert.ok(ctx.candidates.every(c => typeof c.score === 'number'));
});

test('buildContext: the top hit\'s neighbours are added as short cards while the budget allows', () => {
  const ranked = ChatCore.rank(docs, 'tell me about the worker', {});
  const ctx = ChatCore.buildContext(ranked, byId, 450);
  assert.match(ctx.context, /\nworker \| Worker/);
  assert.match(ctx.context, /\nredis \| Redis/);
  assert.match(ctx.context, /\nemail \| Email provider/);
});

test('buildContext: a connection hit contributes its endpoints as candidates', () => {
  const ranked = ChatCore.rank(docs, 'who handles webhooks', {});
  const ctx = ChatCore.buildContext(ranked, byId, 450);
  const ids = ctx.candidates.map(c => c.doc.id);
  assert.ok(ids.includes('stripe') || ids.includes('api') || ids.includes('api.r_hooks'));
});

test('buildContext: empty ranking still returns the about card and no candidates', () => {
  const ctx = ChatCore.buildContext([], byId, 450);
  assert.match(ctx.context, /^Acme Commerce:/);
  assert.equal(ctx.candidates.length, 0);
});

test('parseAnswer: strips think blocks and the trailing GOTO line', () => {
  assert.deepEqual({ ...ChatCore.parseAnswer('<think>\n\n</think>\n\nThe worker runs jobs. GOTO: worker') }, { text: 'The worker runs jobs.', goto: 'worker' });
  assert.deepEqual({ ...ChatCore.parseAnswer('The API is the hub.\nGOTO: api.') }, { text: 'The API is the hub.', goto: 'api' });
  assert.deepEqual({ ...ChatCore.parseAnswer('Nothing on the map covers that.\nGOTO: none') }, { text: 'Nothing on the map covers that.', goto: null });
  assert.deepEqual({ ...ChatCore.parseAnswer('Plain answer without a target') }, { text: 'Plain answer without a target', goto: null });
  assert.equal(ChatCore.parseAnswer('<think>reasoning</think>Answer').text, 'Answer');
});

test('resolveTarget: accepts only candidate ids, by id, first token or name', () => {
  const ranked = ChatCore.rank(docs, 'tell me about the worker', {});
  const { candidates } = ChatCore.buildContext(ranked, byId, 450);
  assert.equal(ChatCore.resolveTarget('worker', candidates).doc.id, 'worker');
  assert.equal(ChatCore.resolveTarget('worker', candidates).how, 'model');
  const invented = ChatCore.resolveTarget('api · 2 replicas', candidates); // api is not a candidate here: fall back to the clear retrieval winner
  assert.equal(invented.doc.id, 'worker'); assert.equal(invented.how, 'retrieval');
  assert.equal(ChatCore.resolveTarget('Worker', candidates).doc.id, 'worker');
});

test('resolveTarget: clear retrieval winner becomes the offer when the model gives none', () => {
  const ranked = ChatCore.rank(docs, 'What does the Orders API do, and what talks to it?', {});
  const { candidates } = ChatCore.buildContext(ranked, byId, 450);
  const r = ChatCore.resolveTarget(null, candidates);
  assert.equal(r.doc.id, 'api'); assert.equal(r.how, 'retrieval');
});

test('resolveTarget: no clear winner means no offer', () => {
  const api = byId.get('api'), worker = byId.get('worker');
  assert.equal(ChatCore.resolveTarget(null, [{ doc: api, score: 9 }, { doc: worker, score: 8 }]), null, 'two close scores');
  assert.equal(ChatCore.resolveTarget(null, [{ doc: api, score: 4 }]), null, 'a weak single hit');
  assert.equal(ChatCore.resolveTarget(null, [{ doc: api, score: 9 }, { doc: worker, score: 4 }]).doc.id, 'api', 'twice the runner-up');
  assert.equal(ChatCore.resolveTarget('worker', [{ doc: api, score: 9 }, { doc: worker, score: 8 }]).doc.id, 'worker', 'the model picks among close candidates');
  assert.equal(ChatCore.resolveTarget(null, []), null);
});

test('resolveTarget: a flow question falls back to the flow when the model gives no target', () => {
  for (const q of ['Walk me through a checkout.', 'What happens during checkout?', 'how does a deploy work']) {
    const { candidates } = ChatCore.buildContext(ChatCore.rank(docs, q, {}), byId, 450);
    const r = ChatCore.resolveTarget(null, candidates);
    assert.ok(r && r.doc.kind === 'flow', q + ' -> ' + (r && r.doc.id));
  }
});

test('isAffirmative: short yes-words only', () => {
  for (const s of ['yes', 'Yes!', 'y', 'sure', 'ok', 'okay', 'please', 'go', 'do it', 'take me there', 'yes please', 'go ahead', 'yep.']) assert.equal(ChatCore.isAffirmative(s), true, s);
  for (const s of ['yes but what about redis', 'no', 'what is redis', 'okay what else', '']) assert.equal(ChatCore.isAffirmative(s), false, s);
});

test('factsAnswer: deterministic answers for node, district, flow and nothing', () => {
  assert.match(ChatCore.factsAnswer(byId.get('worker')), /^\*\*Worker\*\* \(Core services, Core services\): Runs payment capture/);
  assert.match(ChatCore.factsAnswer(byId.get('worker')), /Connections: /);
  assert.match(ChatCore.factsAnswer(byId.get('z_data')), /^\*\*Data & messaging\*\* is a district/);
  assert.match(ChatCore.factsAnswer(byId.get('checkout')), /^\*\*A shopper checks out\*\* is a guided flow/);
  assert.match(ChatCore.factsAnswer(null), /could not find/);
});

test('suggestQuestions: hub node, first flow, first district', () => {
  const s = ChatCore.suggestQuestions(docs);
  assert.equal(s.length, 3);
  assert.match(s[0], /Orders API/);
  assert.match(s[1], /A shopper checks out/);
  assert.match(s[2], /People & customers/);
});

test('buildMessages: system prompt with context, trimmed history, question with the no-think switch', () => {
  const history = [];
  for (let i = 0; i < 5; i++) history.push({ role: 'user', text: 'q' + i }, { role: 'assistant', text: 'a' + i });
  const msgs = ChatCore.buildMessages('CTX', history, 'What is Redis?', 3);
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[0].content, /GOTO: <id>/);
  assert.match(msgs[0].content, /\n## Map context\nCTX$/);
  assert.equal(msgs.length, 1 + 6 + 1);
  assert.equal(msgs[1].content, 'q2');
  assert.equal(msgs[msgs.length - 1].content, 'What is Redis? /no_think');
});

test('linkEntities: every mentioned system becomes one link segment, first mention only, case-insensitive', () => {
  const segs = ChatCore.linkEntities('The Orders API talks to PostgreSQL and redis. Redis also backs the queue.', docs, {});
  const ents = segs.filter(s => s.doc).map(s => s.doc.id);
  assert.deepEqual([...ents], ['api', 'postgres', 'redis']);
  assert.equal(segs.map(s => s.text != null ? s.text : '[' + s.doc.id + ']').join(''), 'The [api] talks to [postgres] and [redis]. Redis also backs the queue.');
  assert.equal(segs.find(s => s.doc && s.doc.id === 'redis').label, 'redis', 'the label keeps the text as written');
});

test('linkEntities: inside parts, districts and flows link too; ids with a dot are recognised', () => {
  const segs = ChatCore.linkEntities('Webhooks live in api.r_hooks, under Data & messaging; see A shopper checks out.', docs, {});
  const ids = segs.filter(s => s.doc).map(s => s.doc.id);
  assert.ok(ids.includes('api.r_hooks'));
  assert.ok(ids.includes('z_data'));
  assert.ok(ids.includes('checkout'));
  assert.equal(ids.filter(i => i === 'api.r_hooks').length, 1, 'name and id of the same part link once');
});

test('linkEntities: a distinctive word of a multi-word name links, generic words do not', () => {
  const ids = s => ChatCore.linkEntities(s, docs, {}).filter(x => x.doc).map(x => x.doc.id);
  assert.deepEqual([...ids('Payments go through Stripe; the Kubernetes cluster runs the pods.')], ['api.payments', 'stripe', 'k8s']);
  assert.deepEqual([...ids('The api service and the backend talk over http.')], []);
});

test('linkEntities: a name shared by two docs prefers the current view, then the overview', () => {
  const a = { id: 'x.p', kind: 'node', view: 'x', name: 'Projects' }, b = { id: 'y.p', kind: 'node', view: 'y', name: 'Projects' }, c = { id: 'root_p', kind: 'node', view: 'root', name: 'Projects' };
  assert.equal(ChatCore.linkEntities('Open Projects.', [a, b], { view: 'y' }).find(s => s.doc).doc.id, 'y.p');
  assert.equal(ChatCore.linkEntities('Open Projects.', [a, b, c], { view: 'q' }).find(s => s.doc).doc.id, 'root_p');
});

test('linkEntities: text without entities is one plain segment', () => {
  const segs = ChatCore.linkEntities('Nothing on the map covers that.', docs, {});
  assert.equal(segs.length, 1); assert.equal(segs[0].text, 'Nothing on the map covers that.');
});

test('linkEntities: a one-word inside part only links when written as named, unless its view is open', () => {
  const ids = (s, st) => ChatCore.linkEntities(s, docs, st).filter(x => x.doc).map(x => x.doc.id);
  assert.deepEqual([...ids('Kubernetes probes health every few seconds.', { view: 'root' })], ['k8s']);
  assert.deepEqual([...ids('Kubernetes probes the Health route.', { view: 'root' })], ['k8s', 'api.r_health']);
  assert.deepEqual([...ids('the health route answers probes', { view: 'api' })], ['api.r_health']);
});
