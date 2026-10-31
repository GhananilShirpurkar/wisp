import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require('electron'),
  [fileURLToPath(new URL('../ui/main.cjs', import.meta.url)), ...process.argv.slice(2)],
  { stdio: 'inherit', env: environment },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
