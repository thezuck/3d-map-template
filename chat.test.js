#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Amir Zucker
/* chat.test.js — tests for the CHAT CORE region of template.html (retrieval, parsing, navigation rules).
   Run:  node --test chat.test.js        Node 18+, no dependencies. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

function region(beginRe, endRe, label) {
  const a = html.search(beginRe), b = html.search(endRe);
  if (a < 0 || b < 0 || b <= a) throw new Error(`could not find the ${label} region`);
  return html.slice(html.indexOf('*/', a) + 2, b);
}
const src = region(/\/\* =+ BEGIN DATA DSL/, /\/\* =+ END DATA DSL/, 'DATA DSL')
  + region(/\/\* =+ BEGIN ARCHITECTURE DATA/, /\/\* =+ END ARCHITECTURE DATA/, 'ARCHITECTURE DATA')
  + region(/\/\* =+ BEGIN CHAT CORE/, /\/\* =+ END CHAT CORE/, 'CHAT CORE');
const M = vm.runInNewContext(src + '\n;({ META, PROVIDERS, CATS, KINDS, ZONES, NODES, EDGES, FLOWS, INSIDE, ChatCore })', {}, { filename: 'template.html' });
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
