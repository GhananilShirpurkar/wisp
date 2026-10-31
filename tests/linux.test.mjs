import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseActiveWindow, parseWindowProperties } from '../dist/linux.js';
import { serviceUnit, unitQuote } from '../scripts/systemd.mjs';
import capture from '../ui/capture-server.cjs';
test('X11 window parser handles empty desktop, UTF8 titles and application class', () => {
  assert.equal(parseActiveWindow('_NET_ACTIVE_WINDOW(WINDOW): window id # 0x220002'), '0x220002');
  assert.equal(parseActiveWindow('_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0'), null);
  assert.equal(parseActiveWindow('not available'), null);
  assert.deepEqual(
    parseWindowProperties(
      '_NET_WM_NAME(UTF8_STRING) = "main.ts — Editor"\nWM_CLASS(STRING) = "code", "Code"',
    ),
    { app: 'Code', title: 'main.ts — Editor' },
  );
});
test('systemd units quote paths, escape specifiers and use graphical lifecycle only for UI', () => {
  const unit = serviceUnit({
    description: 'Ghost',
    root: '/tmp/Project Space/%test',
    args: ['/usr/bin/node', '/tmp/Project Space/main.js'],
    graphical: true,
    path: '/usr/bin',
  });
  assert.match(unit, /WorkingDirectory="\/tmp\/Project Space\/%%test"/);
  assert.match(unit, /ExecStart="\/usr\/bin\/node" "\/tmp\/Project Space\/main.js"/);
  assert.match(unit, /PartOf=graphical-session.target/);
  assert.match(unit, /Restart=always/);
  assert.throws(() => unitQuote('bad\nExecStart=evil'));
});
test('capture bridge rejects unauthenticated access and unavailable shares; returns only authenticated frames', async () => {
  let sharing = false;
  const token = 'a'.repeat(64);
  const server = capture.createCaptureServer(token, async () => {
    if (!sharing) throw new Error('off');
    return '/9j/AA==';
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/capture`;
  const options = { method: 'POST', headers: { Authorization: `Bearer ${token}` } };
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, options)).status, 409);
    sharing = true;
    const response = await fetch(url, options);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { image: '/9j/AA==' });
    assert.equal((await fetch(url, { headers: options.headers })).status, 404);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});
