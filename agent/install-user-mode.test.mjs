import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./install.sh', import.meta.url), 'utf8');

for (const expected of [
  'check_user_execution_allowed',
  'devil binexec on',
  '@reboot /bin/sh %s # %s',
  String.raw`nohup /bin/sh "\$RUNNER"`,
  'run /bin/sh "${INSTALL_DIR}/start.sh"',
]) {
  assert.match(script, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.doesNotMatch(script, /run "\$\{INSTALL_DIR\}\/start\.sh"/);
