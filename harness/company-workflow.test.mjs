// Contract/packaging checks only: these do not simulate model behavior or a live research loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const base=fileURLToPath(new URL('./skills/company-project/',import.meta.url));
const read=path=>readFileSync(resolve(base,path),'utf8');
test('company skill bundles all locally linked workflow references',()=>{
  const skill=read('SKILL.md');
  const refs=[...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map(match=>match[1]);
  assert.equal(refs.length,3);
  for(const path of refs){assert(existsSync(resolve(base,path)),path);assert(read(path).length>500);}
});
test('role and continuation contracts preserve the confirmed safety boundaries',()=>{
  const skill=read('SKILL.md'),coordination=read('references/coordination.md'),continuation=read('references/continuation.md');
  assert.match(skill,/name: company-project/);
  assert.match(skill,/GPT/);assert.match(skill,/Luna/);
  assert.match(coordination,/model="flash-high"/);
  assert.doesNotMatch(skill+coordination+continuation,/pro-high/);assert.match(coordination,/mode="plan"/);
  assert.match(skill,/不设置其他模型为替代/);
  assert.match(continuation,/用户仅说“公司，启动！”/);
  assert.match(continuation,/不据此调用 create_goal/);
  assert.match(continuation,/没有供模型调用的 pause/);
  assert.match(continuation,/不得宣称“已自动停止”/);
  assert.match(skill,/禁止调用旧/);
});
test('local research review and diagnosis skills are included',()=>{
  for(const name of ['research-code-review','research-failure-diagnosis']){
    const path=resolve(base,'..',name,'SKILL.md');assert(existsSync(path));
    assert.match(readFileSync(path,'utf8'),new RegExp(`name: ${name}`));
  }
});
