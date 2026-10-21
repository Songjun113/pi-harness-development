import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../../addons/pi-web-luna/package.json', import.meta.url));
const { createJiti } = require('jiti');
const main = await createJiti(import.meta.url).import('./index.ts', { default: true });
const temp=mkdtempSync(join(tmpdir(),'pi-habits-luna-')); const old=process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR=temp;
try {
 const hooks={}, commands={}, notes=[]; let calls=0, payload, answer, unavailable=false;
 main({on:(n,f)=>hooks[n]=f,registerCommand:(n,f)=>commands[n]=f,appendEntry:()=>{}});
 const ctx={cwd:'D:/test-project',ui:{notify:t=>notes.push(t)},sessionManager:{getBranch:()=>[]},modelRegistry:{find:(p,m)=>{assert.equal(p+'/'+m,'openai/gpt-6-luna');return unavailable?undefined:{}},streamSimple:(m,p,o)=>{calls++;payload=p;return {result:async()=>({stopReason:'stop',content:[{type:'text',text:JSON.stringify(answer)}],usage:{input:20,output:10}})}}}};
 const run=prompt=>hooks.before_agent_start({messageType:'user',prompt},ctx);
 assert.equal(await run('你好'),undefined); assert.equal(calls,0);
 answer={matchedIds:[],candidate:{trigger:'汇报',instruction:'先说结果',exceptions:'无',evidence:'以后汇报先说结果'}};
 assert.equal(await run('以后汇报先说结果'),undefined);
 const id=readdirSync(join(temp,'habits/rules'))[0].replace('.json','');
 assert.equal(calls,1);
 answer={matchedIds:[id],candidate:null};
 assert.equal(await run('汇报'),undefined); assert.equal(calls,1); // candidate never used
 await commands.habits.handler('approve '+id,ctx);
 const message=(await run('汇报')).message;
 assert(message.content.includes('先说结果'));
 assert(!message.content.includes('暂无已批准'));
 assert.equal(payload.messages.length,1);
 answer={matchedIds:['invented-id'],candidate:null};
 assert.equal(await run('另一个问题'),undefined);
 assert.equal((await hooks.context({messages:[message]})).messages.length,0); // stale cleared
 await commands.habits.handler('off',ctx); const before=calls;
 await run('以后需要'); assert.equal(calls,before);
 await commands.habits.handler('on',ctx);
 unavailable=true; await run('汇报'); assert.equal(calls,before);
 unavailable=false;
 ctx.modelRegistry.streamSimple=()=>({result:async()=>{throw Error('secret-provider-error')}});
 assert.equal(await run('汇报'),undefined); assert(!notes.join('').includes('secret-provider-error'));
 await commands.habits.handler('disable '+id,ctx);
 assert.equal(await run('你好'),undefined);
 console.log('PASS: Luna routing, cheap skip, candidate approval gate, selected-only injection, invented IDs rejected, stale removal, off, unavailable, errors, disable');
} finally {if(old===undefined) delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;rmSync(temp,{recursive:true,force:true});}
