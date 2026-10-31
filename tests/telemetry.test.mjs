import test from 'node:test';
import assert from 'node:assert/strict';
import * as Sentry from '@sentry/node';
import { createTelemetryOptions } from '../dist/telemetry.js';

test('Sentry 11 exports scrubbed transactions without content, errors, logs, or raw metrics', async () => {
  const envelopes = [];
  const secret = 'PRIVATE_SCREEN_AND_USER_CONTENT';
  const options = createTelemetryOptions('https://public@example.invalid/1');
  assert.equal(options.traceLifecycle, 'static');
  assert.deepEqual(options.dataCollection, {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  });
  assert.equal(options.beforeSendMetric({ name: secret, value: 1 }), null);
  // Real SDK processing with an in-memory transport: no network requests.
  Sentry.init({
    ...options,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    Sentry.setUser({ id: secret, email: secret });
    Sentry.setTag('private', secret);
    Sentry.setExtra('screen', secret);
    Sentry.addBreadcrumb({ message: secret });
    Sentry.startSpan({ name: secret, op: 'invoke_agent' }, () => {
      Sentry.startSpan({ name: secret, op: 'gen_ai.chat' }, (span) => {
        span.setAttribute('prompt', secret);
        span.setAttribute('durationMs', 12);
        span.setAttribute('outputTokens', 7);
      });
    });
    Sentry.captureException(new Error(secret));
    Sentry.logger.info(secret);
    assert.equal(await Sentry.flush(3000), true);
    const items = envelopes.flatMap((envelope) => envelope[1]);
    const transactions = items.filter(([header]) => header.type === 'transaction');
    assert.equal(transactions.length, 1, 'the static transaction scrubber must remain active');
    assert.equal(
      items.some(([header]) => ['event', 'log', 'span', 'trace_metric'].includes(header.type)),
      false,
    );
    assert.equal(JSON.stringify(envelopes).includes(secret), false);
    const payload = transactions[0][1];
    assert.equal(payload.transaction, 'paperclip.glance');
    assert.equal(payload.user, undefined);
    assert.equal(payload.extra, undefined);
    assert.equal(payload.tags, undefined);
    assert.equal(payload.spans[0].description, 'gen_ai.chat');
    assert.equal(payload.spans[0].data.durationMs, 12);
    assert.equal(payload.spans[0].data.outputTokens, 7);
  } finally {
    await Sentry.close(3000);
  }
});
