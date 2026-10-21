import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execNpmSync } from '../scripts/npm-command.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = resolve(process.env.PI_CODING_AGENT_DIR || join(root, 'agent-data'));
const manifest = JSON.parse(readFileSync(join(root, 'harness/manifest.json'), 'utf8'));
if (process.argv.includes('--deps')) execNpmSync(['ci', '--prefix', join(root, 'addons/pi-web-luna'), '--workspaces=false', '--ignore-scripts'], { cwd: root, stdio: 'inherit' });
const extension = join(data, 'extensions/pi-habits/index.ts');
mkdirSync(dirname(extension), { recursive: true });
if (existsSync(extension)) {
  const backup = join(data, 'backups', `pi-habits-${Date.now()}.ts`);
  mkdirSync(dirname(backup), { recursive: true }); copyFileSync(extension, backup);
}
copyFileSync(join(root, 'harness/extensions/pi-habits/index.ts'), extension);
const webExtension = join(data, 'extensions/pi-web-search');
if (existsSync(webExtension)) {
  const backup = join(data, 'backups', `pi-web-search-${Date.now()}`);
  mkdirSync(dirname(backup), { recursive: true });
  cpSync(webExtension, backup, { recursive: true });
}
mkdirSync(webExtension, { recursive: true });
for (const name of ['index.ts', 'client.ts']) copyFileSync(join(root, 'harness/extensions/pi-web-search', name), join(webExtension, name));
const webAgent = join(data, 'agents/luna-web-researcher.md');
mkdirSync(dirname(webAgent), { recursive: true });
if (existsSync(webAgent)) {
  const backup = join(data, 'backups', `luna-web-researcher-${Date.now()}.md`);
  mkdirSync(dirname(backup), { recursive: true });
  copyFileSync(webAgent, backup);
}
copyFileSync(join(root, 'harness/agents/luna-web-researcher.md'), webAgent);
for (const name of ['AGENTS.md', 'next-prompt.json']) {
  const target = join(data, name);
  if (!existsSync(target)) copyFileSync(join(root, 'harness/templates', name), target);
  else console.log(`Preserved existing ${target}`);
}
for (const name of ['company-project', 'research-code-review', 'research-failure-diagnosis']) {
  const target = join(data, 'skills', name);
  if (existsSync(target)) {
    const backup = join(data, 'backups', `${name}-${Date.now()}`);
    mkdirSync(dirname(backup), { recursive: true });
    cpSync(target, backup, { recursive: true });
  }
  cpSync(join(root, 'harness/skills', name), target, { recursive: true });
}
if (process.argv.includes('--packages')) {
  for (const source of manifest.packages) execFileSync(process.execPath, [
    '--import', pathToFileURL(join(root, 'packages/coding-agent/src/experimental/source-resolver.ts')).href,
    join(root, 'packages/coding-agent/src/cli.ts'), 'install', source,
  ], { cwd: root, stdio: 'inherit', env: { ...process.env, PI_CODING_AGENT_DIR: data, npm_config_ignore_scripts: 'true' } });
}
console.log(`Installed local extensions, Luna web agent and company workflow skills into ${data}. Reload Pi when idle. No service restarted; no auth copied.`);
