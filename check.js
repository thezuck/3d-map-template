#!/usr/bin/env node
/* check.js — validates the ARCHITECTURE DATA region of a 3D architecture map HTML file.
   Usage:  node check.js path/to/map.html
   Exit code 0 = no errors (warnings may still be printed), 1 = errors found or file could not be parsed.
   No dependencies; needs Node 18+. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');

const file = process.argv[2];
if (!file) { console.error('usage: node check.js <map.html>'); process.exit(1); }
const html = fs.readFileSync(path.resolve(file), 'utf8');

function region(beginRe, endRe, label) {
  const a = html.search(beginRe), b = html.search(endRe);
  if (a < 0 || b < 0 || b <= a) { console.error(`could not find the ${label} region (markers missing or out of order)`); process.exit(1); }
  const start = html.indexOf('*/', a) + 2; // skip the (possibly multi-line) marker comment
  return html.slice(start, b);
}
const dsl = region(/\/\* =+ BEGIN DATA DSL/, /\/\* =+ END DATA DSL/, 'DATA DSL');
const data = region(/\/\* =+ BEGIN ARCHITECTURE DATA/, /\/\* =+ END ARCHITECTURE DATA/, 'ARCHITECTURE DATA');

let model;
try {
  model = vm.runInNewContext(dsl + '\n' + data + '\n;({ META, PROVIDERS, CATS, KINDS, ZONES, NODES, EDGES, FLOWS, INSIDE, validateArchitecture })', {}, { filename: file, timeout: 5000 });
} catch (err) {
  console.error('the data region does not evaluate:\n  ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n  ') : err));
  console.error('Hint: every const used must be declared (META, PROVIDERS, CATS, KINDS) and every nd()/e()/flow()/view() call must be syntactically complete.');
  process.exit(1);
}
const { errors, warnings } = model.validateArchitecture(model);
const inner = Object.values(model.INSIDE).reduce((s, v) => s + v.nodes.length, 0);
console.log(`${path.basename(file)}: ${model.ZONES.length} districts, ${model.NODES.length} systems, ${model.EDGES.length} connections, ${model.FLOWS.length} flows, ${Object.keys(model.INSIDE).length} inside views (${inner} parts)`);
const byProv = {}; model.NODES.forEach(n => (byProv[n.prov] = (byProv[n.prov] || 0) + 1));
console.log('  providers: ' + Object.entries(byProv).map(([k, v]) => `${k}=${v}`).join(', '));
for (const w of warnings) console.log('  warning: ' + w);
for (const e of errors) console.log('  ERROR:   ' + e);
console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s) — fix the errors, then re-run.` : `\nOK — no errors, ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
