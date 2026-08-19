import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./install-windows.ps1', import.meta.url), 'utf8');
const englishOutput = 'Write-Host "Uninstalled all CF VPS Monitor agent tasks/services and files."';
const chineseOutput = 'Write-Host $uninstallMessageZh';

const messageMatch = script.match(
  /\$uninstallMessageZh = \(-join @\(([^)]*)\)\) \+ " CF VPS Monitor " \+ \(-join @\(([^)]*)\)\)/,
);
assert.ok(messageMatch, 'Windows uninstaller should define the Chinese success message');

const decodeChars = (source) => [...source.matchAll(/\[char\]0x([0-9a-f]+)/gi)]
  .map((match) => String.fromCodePoint(Number.parseInt(match[1], 16)))
  .join('');

assert.equal(
  `${decodeChars(messageMatch[1])} CF VPS Monitor ${decodeChars(messageMatch[2])}`,
  '已卸载所有 CF VPS Monitor 探针任务、服务和文件。',
);
assert.ok(script.indexOf(chineseOutput) > script.indexOf(englishOutput), 'Chinese output should follow English output');
