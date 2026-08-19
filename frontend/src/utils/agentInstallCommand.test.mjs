import assert from 'node:assert/strict';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tmp = await mkdtemp(join(tmpdir(), 'cf-monitor-agent-command-'));
const projectLinksSource = await readFile(new URL('./projectLinks.ts', import.meta.url), 'utf8');
const commandSource = await readFile(new URL('./agentInstallCommand.ts', import.meta.url), 'utf8');
await writeFile(join(tmp, 'projectLinks.ts'), projectLinksSource);
await writeFile(join(tmp, 'agentInstallCommand.ts'), commandSource.replace("from './projectLinks'", "from './projectLinks.ts'"));

const {
  buildAgentInstallCommand,
  buildAgentUninstallAllCommand,
  defaultAgentInstallOptions,
  SERV00_FIRST_USE_COMMAND,
} = await import(pathToFileURL(join(tmp, 'agentInstallCommand.ts')).href);
const { CF_MONITOR_REPOSITORY } = await import(pathToFileURL(join(tmp, 'projectLinks.ts')).href);

const base = {
  serverUrl: 'https://panel.example',
  token: 'token123',
  options: { ...defaultAgentInstallOptions },
  instanceId: '33bc95df-513d-41be-8d98-30979fb17029',
  nodeName: 'node-123',
};
const bundledUnixInstaller = "(curl -fsSL --connect-timeout 20 --max-time 90 --retry 3 'https://panel.example/agent/install.sh' || wget -qO- -T 20 -t 3 'https://panel.example/agent/install.sh')";

assert.equal(SERV00_FIRST_USE_COMMAND, 'devil binexec on\nexit');

assert.equal(
  buildAgentInstallCommand({ platform: 'unix', ...base }),
  `${bundledUnixInstaller} | sh -s -- '-s' 'https://panel.example' '-t' 'token123' '-n' 'node-123' '-i' '33bc95df-513d-41be-8d98-30979fb17029'`,
);

assert.equal(
  buildAgentInstallCommand({
    platform: 'unix',
    ...base,
    options: { ...defaultAgentInstallOptions, trafficResetDay: '15', downloadProxy: '127.0.0.1:10808' },
  }),
  `${bundledUnixInstaller} | sh -s -- '-s' 'https://panel.example' '-t' 'token123' '-r' '15' '-n' 'node-123' '-i' '33bc95df-513d-41be-8d98-30979fb17029' '--proxy' 'http://127.0.0.1:10808'`,
);

assert.equal(
  buildAgentInstallCommand({
    platform: 'unix',
    ...base,
    options: { ...defaultAgentInstallOptions, installMode: 'user' },
  }),
  `${bundledUnixInstaller} | sh -s -- '-s' 'https://panel.example' '-t' 'token123' '-n' 'node-123' '-i' '33bc95df-513d-41be-8d98-30979fb17029' '--install-mode' 'user'`,
);

assert.equal(
  buildAgentUninstallAllCommand({ platform: 'unix' }),
  `wget -qO- 'https://raw.githubusercontent.com/${CF_MONITOR_REPOSITORY}/refs/heads/main/agent/install.sh' | sh -s -- '--uninstall-all' '--yes'`,
);

await unlink(join(tmp, 'projectLinks.ts'));
await unlink(join(tmp, 'agentInstallCommand.ts'));
await rmdir(tmp);
