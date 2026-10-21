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
test('entrypoint explicitly routes the Spec research loop and its continuation branches',()=>{
  const skill=read('SKILL.md');
  for(const name of ['brainstorming-research-ideas','grilling','idea-evaluator','academic-paper-reader','deep-research','nature-academic-search','spec-start','nature-data','pytorch-lightning','research-code-review','mlflow','research-failure-diagnosis','next-experiment','creative-thinking-for-research','academic-plotting','ml-paper-writing']) assert(skill.includes('`'+name+'`'),name);
  assert.match(skill,/问题与证据 → Spec 计划 → 数据与实现 → 独立代码复核 → 最小实验 → 结果验收/);
  assert.match(skill,/本轮通过但 Spec 尚有未完成目标/);
  assert.match(skill,/实验未通过或结果不佳/);
  assert.match(skill,/子 Agent 或外部作业仍在运行/);
  assert.match(skill,/权限、真实人审或必要监督阻塞/);
  assert.match(skill,/Spec 总目标完成或达到用户指定停止点/);
  assert.match(skill,/活动 Goal 内直接接续/);
  assert.match(skill,/尚未安装的技能说明缺口/);
});
test('local research review and diagnosis skills are included',()=>{
  for(const name of ['research-code-review','research-failure-diagnosis']){
    const path=resolve(base,'..',name,'SKILL.md');assert(existsSync(path));
    assert.match(readFileSync(path,'utf8'),new RegExp(`name: ${name}`));
  }
});
