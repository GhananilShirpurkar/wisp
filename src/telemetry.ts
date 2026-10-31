import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as Sentry from '@sentry/node';
const operations = new Set(['invoke_agent', 'gen_ai.chat', 'os.window', 'os.screenshot', 'ui.ipc']);
export function scrubTelemetryEvent(event: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = { costUsd: 0 };
  if (typeof event.op === 'string' && operations.has(event.op)) safe.op = event.op;
  if (typeof event.traceId === 'string' && /^[a-f0-9-]{16,36}$/.test(event.traceId))
    safe.traceId = event.traceId;
  for (const k of ['durationMs', 'inputTokens', 'outputTokens'])
    if (typeof event[k] === 'number' && Number.isFinite(event[k]) && event[k] >= 0)
      safe[k] = event[k];
  safe.ok = event.ok === true;
  return safe;
}
// Reconstruct transaction events: arbitrary exception text, names and attributes never pass through.
export function scrubSentryEvent(event: any): any {
  if (event.type !== 'transaction') return null;
  const cleanSpan = (s: any) => ({
    trace_id: s.trace_id,
    span_id: s.span_id,
    parent_span_id: s.parent_span_id,
    start_timestamp: s.start_timestamp,
    timestamp: s.timestamp,
    op: operations.has(s.op) ? s.op : 'invoke_agent',
    description: operations.has(s.op) ? s.op : 'invoke_agent',
    data: scrubTelemetryEvent(s.data ?? {}),
  });
  return {
    event_id: event.event_id,
    type: 'transaction',
    transaction: 'paperclip.glance',
    start_timestamp: event.start_timestamp,
    timestamp: event.timestamp,
    contexts: {
      trace: {
        trace_id: event.contexts?.trace?.trace_id,
        span_id: event.contexts?.trace?.span_id,
        op: 'invoke_agent',
      },
    },
    spans: (event.spans ?? []).map(cleanSpan),
  };
}
export function initTelemetry() {
  if (process.env.SENTRY_DSN)
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      defaultIntegrations: false,
      sendDefaultPii: false,
      tracesSampleRate: 1,
      maxBreadcrumbs: 0,
      beforeBreadcrumb: () => null,
      beforeSend: () => null,
      beforeSendTransaction: scrubSentryEvent,
    });
}
export async function traced<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  let ok = false;
  try {
    return await Sentry.startSpan(
      { name: operations.has(op) ? op : 'invoke_agent', op },
      async () => {
        const result = await fn();
        ok = true;
        return result;
      },
    );
  } finally {
    await appendFile(
      join(tmpdir(), 'paperclip-sentry-preview.jsonl'),
      JSON.stringify(scrubTelemetryEvent({ op, durationMs: performance.now() - start, ok })) + '\n',
      { mode: 0o600 },
    ).catch(() => {});
  }
}
export async function recordTokenUsage(inputTokens: unknown, outputTokens: unknown): Promise<void> {
  const metrics = scrubTelemetryEvent({ op: 'gen_ai.chat', inputTokens, outputTokens, ok: true });
  const span = Sentry.getActiveSpan();
  for (const key of ['inputTokens', 'outputTokens'])
    if (typeof metrics[key] === 'number') span?.setAttribute(key, metrics[key]);
  await appendFile(
    join(tmpdir(), 'paperclip-sentry-preview.jsonl'),
    JSON.stringify(metrics) + '\n',
    { mode: 0o600 },
  ).catch(() => {});
}
