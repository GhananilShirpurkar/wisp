import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import {
  initialState,
  shouldRunVision,
  pruneSlidingWindow,
  evaluateStuckState,
  makeLocalDecision,
} from '../dist/engine.js';
import { defaults, validateVision, normalizeSettings } from '../dist/shared.js';
import { scrubTelemetryEvent, scrubSentryEvent } from '../dist/telemetry.js';
import bridge from '../ui/bridge.cjs';
const vision = {
  app: 'Editor',
  activity: 'coding',
  detail: 'test',
  notable: 'error A',
  notable_kind: 'error',
};
const obs = (at, v = vision) => ({ at, key: 'editor', app: 'Editor', title: 'test', vision: v });
test('adaptive sampling triggers first sample, window switches and deadline only', () => {
  const s = initialState();
  assert.equal(shouldRunVision(s, 'editor', 100), true);
  s.observations = [obs(100)];
  s.lastVisionAt = 100;
  assert.equal(shouldRunVision(s, 'editor', 5000), false);
  assert.equal(shouldRunVision(s, 'other', 5000), true);
  assert.equal(shouldRunVision(s, 'editor', 45100), true);
});
test('memory retains boundary and removes expired entries', () =>
  assert.deepEqual(
    pruneSlidingWindow([obs(1), obs(100), obs(200)], 1800100).map((x) => x.at),
    [100, 200],
  ));
test('stuck means repeated recent same-window errors across threshold, not a stale historical error', () => {
  const observations = Array.from({ length: 28 }, (_, i) => obs(i * 45000));
  assert.equal(evaluateStuckState(observations, 1215000), true);
  assert.equal(evaluateStuckState(observations, 1400000), false);
  assert.equal(
    evaluateStuckState(
      [...observations, obs(1260000, { ...vision, notable: null, notable_kind: null })],
      1260000,
    ),
    false,
  );
  observations[15] = obs(15 * 45000, { ...vision, notable: 'different' });
  assert.equal(evaluateStuckState(observations, 1215000), false);
});
test('haunt boundary and forced ask', () => {
  assert.equal(makeLocalDecision([obs(1)], 1, 0, defaults).kind, 'haunt');
  assert.equal(makeLocalDecision([obs(1)], 1, 5, defaults).kind, 'quiet');
  assert.equal(makeLocalDecision([], 1, 12, defaults, 'help').kind, 'help');
});
test('vision validates actual JSON types and rejects extra fields', () => {
  assert.deepEqual(validateVision(vision), vision);
  for (const v of [
    null,
    {},
    { ...vision, notable_kind: 'execute' },
    { ...vision, detail: 2 },
    { ...vision, extra: 'secret' },
  ])
    assert.throws(() => validateVision(v));
});
test('settings reject NaN and unsafe zero cadence', () => {
  assert.throws(() => normalizeSettings({ tickMs: 0 }));
  assert.throws(() => normalizeSettings({ hauntUntilHour: 25 }));
  assert.throws(() => normalizeSettings({ stuckMs: NaN }));
});
test('telemetry reconstructs allowlisted fields, including nested span content', () => {
  const secret = 'PRIVATE_SCREEN_CONTENT';
  const cleaned = scrubTelemetryEvent({
    op: 'gen_ai.chat',
    durationMs: 12,
    ok: true,
    prompt: secret,
    unknown: { value: secret },
    spanName: secret,
    model: secret,
  });
  assert.equal(JSON.stringify(cleaned).includes(secret), false);
  assert.equal(cleaned.durationMs, 12);
  const event = scrubSentryEvent({
    type: 'transaction',
    transaction: secret,
    request: secret,
    extra: secret,
    spans: [{ op: 'gen_ai.chat', description: secret, data: { prompt: secret, durationMs: 2 } }],
  });
  assert.equal(JSON.stringify(event).includes(secret), false);
  assert.equal(scrubSentryEvent({ exception: secret }), null);
});
test('TCP gate supports chunked frames, rejects malformed input, applies cooldown and allows explicit force', async () => {
  let now = 100;
  const received = [];
  const server = bridge.createOverlayTcpGate((c) => received.push(c), {
    now: () => now,
    cooldownMs: 1000,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function send(parts) {
    const socket = createConnection({ host: '127.0.0.1', port: server.address().port });
    await once(socket, 'connect');
    for (const p of parts) socket.write(p);
    socket.end();
    socket.resume();
    await once(socket, 'close');
  }
  try {
    await send(['{"type":"mess', 'age","text":"first"}\n']);
    await send(['not json\n{"type":"message","text":5}\n']);
    await send([JSON.stringify({ type: 'message', text: 'blocked' }) + '\n']);
    await send([JSON.stringify({ type: 'message', text: 'forced', force: true }) + '\n']);
    await send([JSON.stringify({ type: 'mode', possessed: true }) + '\n']);
    now += 1001;
    await send([JSON.stringify({ type: 'message', text: 'later' }) + '\n']);
    assert.deepEqual(
      received.map((x) => x.text ?? x.type),
      ['first', 'forced', 'mode', 'later'],
    );
    await send(['x'.repeat(17000)]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
