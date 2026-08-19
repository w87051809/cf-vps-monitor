import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('./Dashboard.tsx', import.meta.url), 'utf8');

assert.match(
  dashboardSource,
  /\{platform === 'windows' && \(\s*<Text[^>]*>PowerShell 安装失败时，请打开 CMD（命令提示符）运行下方命令。<\/Text>/s,
);
