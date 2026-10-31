import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { WindowInfo } from './shared.js';
const exec = promisify(execFile);
export function parseActiveWindow(root: string): string | null {
  const id = root.match(/window id #\s*(0x[0-9a-f]+)/i)?.[1];
  return id && !/^0x0+$/i.test(id) ? id : null;
}
export function parseWindowProperties(text: string): WindowInfo {
  const title =
    text.match(/_NET_WM_NAME\([^)]*\) = "(.*)"/)?.[1] ??
    text.match(/^WM_NAME\([^)]*\) = "(.*)"/m)?.[1] ??
    '';
  const app = text.match(/WM_CLASS\([^)]*\) = "[^"]*", "([^"]*)"/)?.[1] ?? 'X11 desktop';
  return { app, title };
}
export async function readLinuxWindow(): Promise<WindowInfo> {
  // XWayland cannot enumerate native Wayland applications; do not present partial titles as reliable.
  if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)
    return { app: 'Shared Wayland screen', title: '' };
  try {
    const root = await exec('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { timeout: 3000 });
    const id = parseActiveWindow(root.stdout);
    if (!id) return { app: 'X11 desktop', title: '' };
    return parseWindowProperties(
      (await exec('xprop', ['-id', id, '_NET_WM_NAME', 'WM_NAME', 'WM_CLASS'], { timeout: 3000 }))
        .stdout,
    );
  } catch {
    return { app: 'Shared Linux screen', title: '' };
  }
}
export async function captureLinuxScreen(): Promise<string> {
  const token = (
    await readFile(fileURLToPath(new URL('../.runtime/capture-token', import.meta.url)), 'utf8')
  ).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid capture session token');
  const response = await fetch('http://127.0.0.1:47832/capture', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Linux capture unavailable (${response.status}); open Screen sharing in the ghost controls`,
    );
  const payload = (await response.json()) as { image?: unknown };
  if (
    typeof payload.image !== 'string' ||
    payload.image.length > 4000000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.image)
  )
    throw new Error('Invalid capture frame');
  return payload.image;
}
