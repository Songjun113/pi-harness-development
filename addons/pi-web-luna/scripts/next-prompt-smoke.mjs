import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
const root=new URL('../',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1');
const agent=mkdtempSync(join(tmpdir(),'pi-web-predict-smoke-'));
const port=30149;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,PI_CODING_AGENT_DIR:agent,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try {
 let ready=false;
 for(let n=0;n<90;n++){try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok){ready=true;break;}}catch{} await delay(1000);}
 assert(ready,'dev server ready');
 const response=await fetch(`http://127.0.0.1:${port}/api/sessions/missing/next-prompt`,{method:'POST'});
 assert.equal(response.status,200);assert.equal((await response.json()).status,'inactive-or-busy');
 const cross=await fetch(`http://127.0.0.1:${port}/api/sessions/missing/next-prompt`,{method:'POST',headers:{origin:'https://not-local.example','sec-fetch-site':'cross-site'}});
 assert.equal(cross.status,403);
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForTimeout(3000);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: isolated dev HTTP, no-session skip, cross-origin rejection, Edge page load without JS errors; no model calls');
} finally {
 await browser?.close();
 if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGTERM');
 writeFileSync(join(root,'next-prompt-smoke.log'),logs);
 rmSync(agent,{recursive:true,force:true});
}
