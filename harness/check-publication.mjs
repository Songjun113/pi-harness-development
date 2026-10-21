import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Exact, unchanged public upstream v0.12.2 demo/security-test fixtures only.
// Any edit invalidates the exception; never exempt an entire tests directory.
const publicFixtures = new Map([
  ['addons/pi-web-luna/demo/mock/captured/models.json', '9691133b362ce3c50012fa84ac078e449e855176bce4342f230516292d0c02ec'],
  ['addons/pi-web-luna/lib/mcp-config-read.test.mjs', 'c96e991201af76121cbb1b9a9b7daacc8303d8ce16f1d8573cf33b104df34b16'],
  ['addons/pi-web-luna/lib/mcp-import.test.mjs', '679d963f9dc95bab0a3ec6e72d2c6cf13137c556a66266ab51f9b583e0959829'],
  ['addons/pi-web-luna/lib/mcp-secrets.test.mjs', '80101169415610955c6b8d111d931be036d8242fe4db6c6f559a959aff38436f'],
]);
// Inspect only the staged delta, never dump secrets into logs.
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const denied = /^(?:agent-data(?:-migration-backup)?|cache|logs|apps\/pi-web|tests\/agy-smoke|packages\/coding-agent\/binaries)\/|(?:^|\/)(?:node_modules|\.next|\.git|habits\/rules)\/|(?:^|\/)(?:harness-local\.json|model-catalog\.json|\.pi\/settings\.json|auth\.json|models\.json|mcp\.json|\.env(?:\..+)?|.*\.(?:pem|pfx|p12|key|log|jsonl))$/i;
const problems = [];
for (const path of paths) {
  // Read index bytes, not working files, so later edits cannot fool this gate.
  const bytes = execFileSync('git', ['show', `:${path}`], { maxBuffer: 32 * 1024 * 1024 });
  if (publicFixtures.get(path) === createHash('sha256').update(bytes).digest('hex')) continue;
  if (denied.test(path)) { problems.push(`${path}: private/runtime path`); continue; }
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{70,}|sk-proj-[A-Za-z0-9_-]{40,})\b/.test(text)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{80,}/.test(text)) problems.push(`${path}: possible credential`);
}
const manifest = JSON.parse(readFileSync('harness/manifest.json', 'utf8'));
if (manifest.repository !== 'https://github.com/Songjun113/pi-harness-development') problems.push('Unexpected publication repository');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`Publication gate: ${paths.length} staged files; no forbidden paths/high-confidence credentials detected. This does not replace manual diff review.`);
