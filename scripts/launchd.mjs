import { mkdir, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('launchd services require macOS');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  dir = join(homedir(), 'Library/LaunchAgents'),
  logs = join(root, 'logs');
const action = process.argv[2];
if (!['install', 'uninstall', 'start', 'stop'].includes(action))
  throw new Error('Usage: npm run services -- install|uninstall|start|stop');
function binary(name) {
  const r = spawnSync('/usr/bin/which', [name], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${name} is missing from PATH`);
  return r.stdout.trim();
}
const labels = ['com.paperclip.temporal', 'com.paperclip.ghost-worker', 'com.paperclip.ghost-ui'];
const esc = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const domain = `gui/${process.getuid()}`;
function launch(args, optional = false) {
  const r = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (r.status !== 0 && !optional) throw new Error(r.stderr || 'launchctl failed');
}
if (action === 'install') {
  await mkdir(dir, { recursive: true });
  await mkdir(logs, { recursive: true });
  const commands = [
    [
      binary('temporal'),
      'server',
      'start-dev',
      '--ip',
      '127.0.0.1',
      '--db-filename',
      join(root, 'temporal.db'),
    ],
    [process.execPath, '--env-file-if-exists=.env', join(root, 'dist/worker.js')],
    [join(root, 'node_modules/.bin/electron'), join(root, 'ui/main.cjs')],
  ];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    await writeFile(
      join(dir, label + '.plist'),
      `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${commands[i].map((s) => `<string>${esc(s)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${esc(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(process.env.PATH ?? '/usr/bin:/bin')}</string></dict><key>KeepAlive</key><true/><key>RunAtLoad</key><true/><key>ThrottleInterval</key><integer>5</integer><key>StandardOutPath</key><string>${esc(join(logs, label + '.log'))}</string><key>StandardErrorPath</key><string>${esc(join(logs, label + '.log'))}</string></dict></plist>`,
      { mode: 0o600 },
    );
  }
  console.log('Installed service definitions. Run services -- start to activate.');
}
for (const label of labels) {
  const path = join(dir, label + '.plist');
  if (action === 'start') launch(['bootstrap', domain, path]);
  if (action === 'stop' || action === 'uninstall') launch(['bootout', `${domain}/${label}`], true);
  if (action === 'uninstall') await rm(path, { force: true });
}
