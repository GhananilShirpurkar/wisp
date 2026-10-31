import { spawnSync } from 'node:child_process';
console.log(
  `Node ${process.version} · ${process.platform} · ${process.env.XDG_SESSION_TYPE ?? 'unknown session'} · ${process.env.XDG_CURRENT_DESKTOP ?? ''}`,
);
for (const command of ['temporal', 'ollama', 'systemctl', 'xprop']) {
  const r = spawnSync('which', [command], { encoding: 'utf8' });
  console.log(`${command}: ${r.status === 0 ? r.stdout.trim() : 'not installed'}`);
}
if (process.platform === 'linux') {
  for (const service of ['pipewire.service', 'xdg-desktop-portal.service']) {
    const r = spawnSync('systemctl', ['--user', 'is-active', service], { encoding: 'utf8' });
    console.log(`${service}: ${r.stdout.trim() || 'unavailable'}`);
  }
  console.log(
    process.env.DISPLAY
      ? 'Overlay: X11/XWayland available'
      : 'Overlay: no DISPLAY; global positioning/click-through require XWayland',
  );
  console.log(
    process.env.XDG_SESSION_TYPE === 'wayland'
      ? 'Active-window titles: unavailable for native Wayland apps; using timed vision samples'
      : 'Active-window titles: xprop on X11 (falls back to timed sampling if unavailable)',
  );
  console.log('Capture: open Screen sharing in the ghost controls, then Start sharing.');
}
try {
  const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) });
  console.log('Ollama:', r.status);
  if (r.ok) console.log((await r.json()).models?.map((m) => m.name).join(', '));
} catch {
  console.log('Ollama: offline');
}
