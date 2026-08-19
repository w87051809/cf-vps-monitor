import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./install.sh', import.meta.url), 'utf8');

for (const expected of [
  'check_user_execution_allowed',
  'devil binexec on',
  '--interval must be a number from 3 to 86400.',
  '--ping-interval must be a number from 1 to 86400.',
  'reject_newline "install-dir" "$INSTALL_DIR"',
  '--install-dir must not contain % in user mode because crontab treats it specially.',
  'quoted_start_script="$(shell_quote "${INSTALL_DIR}/start.sh")"',
  '@reboot /bin/sh %s # %s',
  String.raw`nohup /bin/sh "\$RUNNER"`,
  'run /bin/sh "${INSTALL_DIR}/start.sh"',
]) {
  assert.match(script, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.doesNotMatch(script, /run "\$\{INSTALL_DIR\}\/start\.sh"/);
assert.doesNotMatch(script, /printf '@reboot \/bin\/sh %s # %s\\n' "\$INSTALL_DIR\/start\.sh"/);
