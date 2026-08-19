import assert from 'node:assert/strict';

const { shouldCheckAdminSessionOnLoad } = await import('./auth-state.ts');

assert.equal(shouldCheckAdminSessionOnLoad('/'), true);
assert.equal(shouldCheckAdminSessionOnLoad('/instance/server-1'), true);
assert.equal(shouldCheckAdminSessionOnLoad('/87051809'), true);
assert.equal(shouldCheckAdminSessionOnLoad('/87051809/login'), true);

