import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { parseThemeZip } from './theme-package.ts';

function manifest(style = 'style.css') {
  return strToU8(JSON.stringify({
    name: 'Security Test Theme',
    short: 'security-test',
    style,
    configuration: { type: 'managed', data: [] },
  }));
}

test('parses a small valid theme package', () => {
  const archive = zipSync({
    'cf-monitor-theme.json': manifest(),
    'style.css': strToU8(':root { color-scheme: dark; }'),
  });
  const parsed = parseThemeZip(archive);
  assert.equal(parsed.theme.short, 'security-test');
  assert.equal(parsed.assets.length, 1);
});

test('rejects highly compressed oversized theme files before accepting the package', () => {
  const archive = zipSync({
    'cf-monitor-theme.json': manifest(),
    'style.css': strToU8('a'.repeat((256 * 1024) + 1)),
  }, { level: 9 });
  assert.throws(() => parseThemeZip(archive), /too large/);
});

test('rejects theme packages with too many files', () => {
  const files = {
    'cf-monitor-theme.json': manifest(),
    'style.css': strToU8('body{}'),
  };
  for (let index = 0; index < 32; index += 1) {
    files[`asset-${index}.svg`] = strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>');
  }
  assert.throws(() => parseThemeZip(zipSync(files)), /too many files/);
});

test('rejects duplicate normalized theme paths', () => {
  const archive = zipSync({
    'cf-monitor-theme.json': manifest(),
    './style.css': strToU8('body{}'),
    'style.css': strToU8('body{}'),
  });
  assert.throws(() => parseThemeZip(archive), /duplicate theme path/);
});
