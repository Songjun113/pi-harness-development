import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(join(tmpdir(),'pi-harness-types-'));
try {
  const config=join(temp,'tsconfig.json');
  writeFileSync(config,JSON.stringify({extends:join(root,'tsconfig.json'),compilerOptions:{typeRoots:[join(root,'node_modules/@types')]},files:[join(root,'packages/coding-agent/src/utils/highlight-js.d.ts')],include:[join(root,'harness/extensions/pi-web-search/*.ts'),join(root,'harness/web-search-smoke.ts'),join(root,'packages/coding-agent/src/**/*.d.ts')],exclude:[]}));
  execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project',config,'--noEmit'],{cwd:root,stdio:'inherit'});
} finally { rmSync(temp,{recursive:true,force:true}); }
