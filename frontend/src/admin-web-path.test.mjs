import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, login, layout, adminLayout, adminMenu] = await Promise.all([
  readFile(new URL('./App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./pages/Login.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./pages/Layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./pages/admin/AdminLayout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./pages/admin/adminMenu.tsx', import.meta.url), 'utf8'),
]);

assert.match(app, /<Route path="\/87051809" element=\{<AdminLayout \/>\}>/);
assert.match(app, /<Route path="\/87051809\/login" element=\{<Login \/>\}/);
assert.doesNotMatch(app, /<Route path="\/(?:admin|admin\/login|login)"/);
assert.match(login, /startsWith\('\/87051809'\).*'\/87051809'/s);
assert.match(layout, /navigate\("\/87051809"\)/);
assert.match(adminLayout, /navigate\("\/87051809\/login"/);
assert.match(adminMenu, /path: '\/87051809'/);
assert.doesNotMatch(adminMenu, /['"]\/admin(?:\/|['"])/);
