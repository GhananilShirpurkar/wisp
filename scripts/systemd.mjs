import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
export function unitQuote(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid service value');
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"';
}
export function serviceUnit({ description, root, args, graphical = false, path }) {
  return `[Unit]\nDescription=${description}\n${graphical ? 'After=graphical-session.target\nPartOf=graphical-session.target\n' : 'After=network.target\n'}\n[Service]\nType=simple\nWorkingDirectory=${unitQuote(root)}\nEnvironment=${unitQuote('PATH=' + path)}\nExecStart=${args.map(unitQuote).join(' ')}\nRestart=always\nRestartSec=5\nTimeoutStopSec=20\n\n[Install]\nWantedBy=${graphical ? 'graphical-session.target' : 'default.target'}\n`;
}
async function main() {
  if (process.platform !== 'linux') throw new Error('systemd services require Linux');
  const action = process.argv[2];
  if (!['install', 'start', 'stop', 'status', 'uninstall'].includes(action))
    throw new Error('Usage: npm run services -- install|start|stop|status|uninstall');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const directory = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd/user');
  const names = ['paperclip-temporal.service', 'paperclip-worker.service', 'paperclip-ui.service'];
  function ctl(args, optional = false) {
    const r = spawnSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
    if (r.status !== 0 && !optional) throw new Error('systemctl failed');
  }
  if (action === 'install') {
    const result = spawnSync('which', ['temporal'], { encoding: 'utf8' });
    if (result.status !== 0)
      throw new Error('Install the Temporal CLI first, then rerun services -- install');
    await access(join(root, 'dist/worker.js'));
    await mkdir(directory, { recursive: true });
    const commands = [
      [
        result.stdout.trim(),
        'server',
        'start-dev',
        '--ip',
        '127.0.0.1',
        '--db-filename',
        join(root, 'temporal.db'),
      ],
      [process.execPath, '--env-file-if-exists=.env', join(root, 'dist/worker.js')],
      [process.execPath, join(root, 'scripts/ui.mjs')],
    ];
    for (let i = 0; i < names.length; i++)
      await writeFile(
        join(directory, names[i]),
        serviceUnit({
          description: names[i],
          root,
          args: commands[i],
          graphical: i === 2,
          path: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
        }),
        { mode: 0o600 },
      );
    ctl(['daemon-reload']);
    console.log('User service files installed. Run services -- start to activate.');
  }
  if (action === 'start') {
    const vars = [
      'DISPLAY',
      'WAYLAND_DISPLAY',
      'XDG_SESSION_TYPE',
      'XDG_CURRENT_DESKTOP',
      'XAUTHORITY',
      'DBUS_SESSION_BUS_ADDRESS',
    ].filter((k) => process.env[k]);
    if (vars.length) ctl(['import-environment', ...vars]);
    ctl(['enable', '--now', ...names]);
  }
  if (action === 'stop' || action === 'uninstall') ctl(['disable', '--now', ...names], true);
  if (action === 'status') ctl(['status', '--no-pager', ...names], true);
  if (action === 'uninstall') {
    for (const name of names) await rm(join(directory, name), { force: true });
    ctl(['daemon-reload']);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
