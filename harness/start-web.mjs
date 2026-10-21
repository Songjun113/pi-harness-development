import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cwd = join(root, 'addons/pi-web-luna');
const child = spawn(process.execPath, [join(cwd, 'node_modules/next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', process.env.PORT || '30141'], {
  cwd, stdio: 'inherit', env: { ...process.env, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR || join(root, 'agent-data'), NEXT_TELEMETRY_DISABLED: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
