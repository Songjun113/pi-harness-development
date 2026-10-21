import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execNpmSync } from '../scripts/npm-command.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const message = process.argv.slice(2).join(' ').trim();
if (!message || message.startsWith('-')) throw new Error('Usage: npm run harness:sync -- "feat(harness): describe the verified change"');
const origin = git('remote', 'get-url', '--push', 'origin');
if (!['https://github.com/Songjun113/pi-harness-development.git', 'https://github.com/Songjun113/pi-harness-development', 'git@github.com:Songjun113/pi-harness-development.git'].includes(origin)) throw new Error('Unexpected push remote; refusing publication');
if (git('branch', '--show-current') !== 'main') throw new Error('Sync expects main; publish other branches explicitly');
if (git('diff', '--name-only')) throw new Error('Unstaged tracked changes exist. Review and stage explicit files first. Nothing is staged automatically.');
if (!git('diff', '--cached', '--name-only')) throw new Error('No staged changes. Nothing is committed or pushed.');
git('fetch', 'origin', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) throw new Error('HEAD differs from origin/main; review/integrate or push existing commits manually. No reset/rebase/force push performed.');
execNpmSync(['run', 'harness:check'], { cwd: root, stdio: 'inherit' });
// Private-fork publication gates the customized Harness, not every upstream provider.
// Opt into the upstream-wide gate when changing Pi core or preparing an upstream PR.
if (process.env.HARNESS_CHECK_UPSTREAM === '1') execNpmSync(['run', 'check'], { cwd: root, stdio: 'inherit' });
if (git('diff', '--name-only')) throw new Error('Checks modified tracked files. Review and stage explicitly before retrying.');
execFileSync(process.execPath, ['harness/check-publication.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('git', ['commit', '-m', message], { cwd: root, stdio: 'inherit' });
execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: root, stdio: 'inherit' });
console.log('Published to origin/main. No background file watcher or automatic credential upload is installed.');
