import assert from 'node:assert/strict';

const {
  canonicalGitHubRepositoryUrl,
  compareAppVersions,
  formatAppVersion,
  isUpdateAvailable,
  repositoryUrlFromRepositoryUrl,
  shortGitSha,
} = await import('./update-check.ts');

assert.equal(formatAppVersion('2.0.1'), 'v2.0.1');
assert.equal(formatAppVersion('v2.0.1'), 'v2.0.1');
assert.equal(formatAppVersion(''), 'dev');

assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor.git'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('github.com/example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(canonicalGitHubRepositoryUrl('https://github.com/example/cf-vps-monitor/tree/main'), null);
assert.equal(canonicalGitHubRepositoryUrl('https://gitlab.com/example/cf-vps-monitor'), null);
assert.equal(canonicalGitHubRepositoryUrl('not a url'), null);

assert.equal(repositoryUrlFromRepositoryUrl('example/cf-vps-monitor'), 'https://github.com/example/cf-vps-monitor');
assert.equal(shortGitSha('77D873F2552638E38BEBF1D18BC38DB7721042F5'), '77d873f');
assert.equal(shortGitSha(undefined), '');

assert.equal(compareAppVersions('2.0.1', '2.0.1'), 0);
assert.equal(compareAppVersions('v2.0.1', '2.0.2'), -1);
assert.equal(compareAppVersions('2.1.0', '2.0.9'), 1);
assert.equal(compareAppVersions('dev', '2.0.1'), null);

assert.equal(isUpdateAvailable('2.0.1', '2.0.1', 'custom', 'official'), false);
assert.equal(isUpdateAvailable('2.0.1', '2.0.2', 'custom', 'official'), true);
assert.equal(isUpdateAvailable('dev', 'dev', 'custom', 'official'), true);
