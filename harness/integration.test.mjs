import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const gate = fileURLToPath(new URL('./check-publication.mjs', import.meta.url));
const setup = fileURLToPath(new URL('./setup.mjs', import.meta.url));
test('publication gate rejects runtime and credentials without printing values', t => {
  const cwd=mkdtempSync(join(tmpdir(),'harness-publication-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  execFileSync('git',['init'],{cwd,stdio:'ignore'});
  mkdirSync(join(cwd,'harness'));writeFileSync(join(cwd,'harness/manifest.json'),JSON.stringify({repository:'https://github.com/Songjun113/pi-harness-development'}));
  writeFileSync(join(cwd,'README.md'),'safe source');execFileSync('git',['add','README.md'],{cwd});
  assert.equal(spawnSync(process.execPath,[gate],{cwd,encoding:'utf8'}).status,0);
  mkdirSync(join(cwd,'agent-data'));writeFileSync(join(cwd,'agent-data/auth.json'),'{}');execFileSync('git',['add','agent-data/auth.json'],{cwd});
  const result=spawnSync(process.execPath,[gate],{cwd,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/private\/runtime path/);
  const token='ghp_'+ 'z'.repeat(36);writeFileSync(join(cwd,'README.md'),token);execFileSync('git',['add','README.md'],{cwd});
  const leaked=spawnSync(process.execPath,[gate],{cwd,encoding:'utf8'});
  assert.equal(leaked.status,1);assert.match(leaked.stderr,/possible credential/);assert(!leaked.stderr.includes(token));
});
test('setup preserves personal configuration and backs up the deployed extension', t => {
  const data=mkdtempSync(join(tmpdir(),'harness-setup-'));t.after(()=>rmSync(data,{recursive:true,force:true}));
  writeFileSync(join(data,'AGENTS.md'),'private user rules');
  const env={...process.env,PI_CODING_AGENT_DIR:data};
  execFileSync(process.execPath,[setup],{env,stdio:'pipe'});
  assert.equal(readFileSync(join(data,'AGENTS.md'),'utf8'),'private user rules');
  assert.equal(JSON.parse(readFileSync(join(data,'next-prompt.json'),'utf8')).model.model,'gpt-6-luna');
  execFileSync(process.execPath,[setup],{env,stdio:'pipe'});
  assert.equal(readdirSync(join(data,'backups')).filter(name => name.startsWith('pi-habits-')).length,1);
  assert.match(readFileSync(join(data,'extensions/pi-web-search/index.ts'),'utf8'),/web_search/);
  const profile=readFileSync(join(data,'agents/luna-web-researcher.md'),'utf8');
  assert.match(profile,/model: openai\/gpt-6-luna/);
  assert.match(profile,/web_search/);assert.match(profile,/web_read/);
  assert.match(profile,/\.\.\/extensions\/pi-web-search\/index\.ts/);
  assert.equal(readdirSync(join(data,'backups')).filter(name => name.startsWith('pi-web-search-')).length,1);
  assert.equal(readdirSync(join(data,'backups')).filter(name => name.startsWith('luna-web-researcher-')).length,1);
  for (const name of ['company-project','research-code-review','research-failure-diagnosis']) {
    assert.match(readFileSync(join(data,'skills',name,'SKILL.md'),'utf8'),new RegExp(`name: ${name}`));
    const backups=readdirSync(join(data,'backups')).filter(file => file.startsWith(name+'-'));
    assert.equal(backups.length,1);
    assert.equal(readFileSync(join(data,'backups',backups[0],'SKILL.md'),'utf8'),readFileSync(join(data,'skills',name,'SKILL.md'),'utf8'));
  }
});
