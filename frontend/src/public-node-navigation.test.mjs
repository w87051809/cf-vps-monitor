import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tableSource = readFileSync(new URL('./components/NodeTable.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(tableSource, /react-router-dom|\/instance\//);
assert.match(
  appSource,
  /<Route path="instance\/:uuid" element=\{<Navigate to="\/" replace \/>\} \/>/,
);
assert.doesNotMatch(appSource, /loadInstance|<Instance\s*\/>/);
