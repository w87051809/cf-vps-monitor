import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tableSource = readFileSync(new URL('./components/NodeTable.tsx', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('./components/NodeDisplay.tsx', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('./pages/Index.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(tableSource, /react-router-dom|\/instance\//);
assert.doesNotMatch(displaySource, /viewMode|gridRenderer|网格视图|表格视图/);
assert.match(displaySource, /<NodeTable nodes=\{filteredNodes\} liveData=\{liveData\} \/>/);
assert.doesNotMatch(indexSource, /components\/NodeCard|renderGrid|node-card-grid/);
assert.match(
  appSource,
  /<Route path="instance\/:uuid" element=\{<Navigate to="\/" replace \/>\} \/>/,
);
assert.doesNotMatch(appSource, /loadInstance|<Instance\s*\/>/);
