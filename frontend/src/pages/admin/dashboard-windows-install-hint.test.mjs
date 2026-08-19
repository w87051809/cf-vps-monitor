import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('./Dashboard.tsx', import.meta.url), 'utf8');
const platformSelectorEnd = dashboardSource.indexOf('</SegmentedControl.Root>');
const optionsStart = dashboardSource.indexOf('<Flex className="admin-command-options-scroll"');
const noticeStart = dashboardSource.indexOf('<div className="windows-install-notice" role="note">');

assert.ok(noticeStart > platformSelectorEnd, 'Windows notice should appear below the platform selector');
assert.ok(noticeStart < optionsStart, 'Windows notice should appear before the scrollable install options');
assert.match(dashboardSource, /<Badge color="red" variant="solid">重要提示<\/Badge>/);
assert.match(dashboardSource, /<TriangleAlert[^>]*className="windows-install-notice-icon"/);
assert.match(dashboardSource, /PowerShell 安装失败时，请改用\s*<strong>CMD（命令提示符）<\/strong>\s*执行安装命令。/s);
