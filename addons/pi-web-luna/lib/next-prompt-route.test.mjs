import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
import { createJiti } from 'jiti';
const core=await createJiti(import.meta.url).import('./next-prompt-core.ts');
const code=ts.transpileModule(readFileSync(new URL('../app/api/sessions/[id]/next-prompt/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 let calls=0,leaf='leaf-a',busy=false,modelAvailable=true;let resolve;
 const response=new Promise(r=>resolve=r);
 const inner={isIdle:true,pendingMessageCount:0,messages:[{role:'assistant',stopReason:'stop',content:[{type:'text',text:'done'}]}],sessionManager:{getLeafId:()=>leaf},subscribe:()=>()=>{},modelRuntime:{getModel:(p,id)=>{assert.equal(p+'/'+id,'openai/gpt-6-luna');return modelAvailable?{}:undefined},streamSimple:()=>{calls++;return{result:()=>response}}}};
 const wrapper={inner,isAlive:()=>true,isRunning:()=>busy};
 const loaded={exports:{}};
 const modules={
 'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},
 'node:fs/promises':{readFile:async()=>JSON.stringify({autoTrigger:true,model:{provider:'openai',model:'gpt-6-luna'}})},
 'node:path':{join:(...parts)=>parts.join('/')},
 '@earendil-works/pi-coding-agent':{getAgentDir:()=>'/test'},
 '@/lib/rpc-manager':{getRpcSession:()=>wrapper},
 '@/lib/request-security':{isApiRequestAllowed:r=>!r.forbidden},
 '@/lib/next-prompt-core':core,
 };
 new Script(code).runInNewContext({exports:loaded.exports,require:n=>{if(!(n in modules))throw Error(n);return modules[n]},setTimeout,clearTimeout,AbortController,Date,Map});
 return{post:(req={})=>loaded.exports.POST(req,{params:Promise.resolve({id:'session-a'})}),finish:()=>resolve({stopReason:'stop',content:[{type:'text',text:'检查结果'}]}),calls:()=>calls,setLeaf:v=>leaf=v,setBusy:v=>busy=v,noModel:()=>modelAvailable=false};
}
test('route rejects forbidden/busy and missing model without fallback',async()=>{
 const f=fixture();assert.equal((await f.post({forbidden:true})).status,403);
 f.setBusy(true);assert.equal((await f.post()).body.status,'inactive-or-busy');
 f.setBusy(false);f.noModel();assert.equal((await f.post()).body.status,'model-unavailable');assert.equal(f.calls(),0);
});
test('route coalesces concurrent requests and caches only UI output',async()=>{
 const f=fixture();const a=f.post(),b=f.post();await new Promise(r=>setImmediate(r));assert.equal(f.calls(),1);f.finish();
 assert.equal((await a).body.suggestion,'检查结果');assert.equal((await b).body.suggestion,'检查结果');
 await f.post();assert.equal(f.calls(),1);
});
test('route refuses a result when branch leaf changes during prediction',async()=>{
 const f=fixture();const task=f.post();await new Promise(r=>setImmediate(r));f.setLeaf('leaf-b');f.finish();
 assert.equal((await task).body.status,'stale');
});
