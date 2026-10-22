import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const release=resolve(process.argv[2]||'');
await readFile(join(release,'.next/BUILD_ID'),'utf8');
const agent=await mkdtemp(join(tmpdir(),'pi-production-smoke-'));
const port=30142, host='smoke.ts.net', base=`http://127.0.0.1:${port}`;
try { await fetch(`${base}/api/web-auth`,{signal:AbortSignal.timeout(500)}); throw Error('Smoke port occupied'); }
catch(e){if(e.message==='Smoke port occupied')throw e;}
const password=randomBytes(24).toString('base64url');
const env={...process.env,PI_WEB_PASSWORD:password,PI_WEB_ALLOWED_HOSTS:host,PI_CODING_AGENT_DIR:agent,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(env))if(/^(TURBOPACK|__NEXT|NEXT_PRIVATE)/.test(key))delete env[key];
const child=spawn(process.execPath,[join(release,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:release,env,stdio:['ignore','ignore','ignore']});
const timings={};
async function request(path,options={}){
 const start=performance.now();const r=await fetch(base+path,{redirect:'manual',...options,headers:{host,...options.headers},signal:AbortSignal.timeout(10000)});
 timings[path]=Math.round(performance.now()-start);return r;
}
try {
 let online=false;
 for(let i=0;i<60;i++){try{const r=await request('/api/web-auth');if(r.ok){online=true;break}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(online,'candidate did not start');
 const auth=await(await request('/api/web-auth')).json();assert.equal(auth.enabled,true);assert.equal(auth.authenticated,false);
 assert.equal((await request('/api/sessions')).status,401);
 assert.equal((await request('/')).status,307);
 assert.equal((await request('/api/sessions',{headers:{origin:'https://evil.invalid','sec-fetch-site':'cross-site'}})).status,403);
 const loginPage=await request('/login');assert.equal(loginPage.status,200);
 const html=await loginPage.text();const script=html.match(/src="([^" ]+\/_next\/[^" ]+\.js|\/_next\/[^" ]+\.js)"/);
 assert.ok(script,'login JS missing');assert.equal((await request(script[1])).status,200);
 const basic='Basic '+Buffer.from('pi:'+password).toString('base64');
 const sessions=await request('/api/sessions',{headers:{authorization:basic}});assert.equal(sessions.status,200);await sessions.json();
 // No user data, provider credentials or agent prompts are used in this smoke.
 console.log(JSON.stringify({passed:true,mode:'production',isolatedAgentDir:true,checks:['password-enabled','anonymous-401','login-redirect','cross-site-403','login-html','static-js','authenticated-session-list'],localTimingsMs:timings}));
} finally {
 child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);
 if(child.exitCode===null)child.kill('SIGKILL');
 await rm(agent,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
