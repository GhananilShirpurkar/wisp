/**
 * Clean-Room Re-Implementation of Paperclip Ghost (`Bennykillua/paperclip-ghost`)
 *
 * Implements the four core architectural pillars discovered during reverse engineering:
 * 1. Adaptive Window-Polling & Vision Sampling Loop (5s window poll, 45s vision throttle,
 *    30-minute rolling observation window, and 60-minute state rollover).
 * 2. Local Multimodal Inference & Decision Engine via Ollama (`gemma4:e2b`) with strict
 *    structured JSON Schema enforcement (`{app, activity, detail, notable, notable_kind}`).
 * 3. Zero-Leak Telemetry Scrubbing (strips prompts, completions, breadcrumbs, user/host
 *    metadata while preserving span latency and token accounting).
 * 4. Local Loopback TCP Overlay Bridge (`127.0.0.1:47831`) with a 3-minute cooldown gate.
 */

import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { createConnection, createServer, Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ============================================================================
// 1. Shared Schemas, Constants & State Contracts
// ============================================================================

export const CONFIG = {
  taskQueue: 'paperclip-glance',
  workflowId: 'paperclip-glance',
  askSignalName: 'askGhost',
  uiHost: '127.0.0.1',
  uiPort: 47831,
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
  visionModel: process.env.VISION_MODEL ?? 'gemma4:e2b',
  visionTimeoutMs: 30_000,
  maxImageSide: 1280,
  tickMs: 5_000,
  visionEveryMs: 45_000,
  memoryWindowMs: 30 * 60_000,
  continueAfterMs: Number(process.env.CONTINUE_AFTER_MINUTES ?? 60) * 60_000,
  interruptionCooldownMs: 3 * 60_000,
  stuckThresholdMs: Number(process.env.STUCK_MINUTES ?? 20) * 60_000,
  hauntUntilHour: Number(process.env.HAUNT_UNTIL_HOUR ?? 5),
} as const;

export type NotableKind = 'error' | 'warning' | 'notification' | 'message';

export interface WindowInfo {
  app: string;
  title: string;
}

export interface Vision {
  app: string;
  activity: string;
  detail: string;
  notable: string | null;
  notable_kind: NotableKind | null;
}

export interface Observation {
  at: number;
  key: string;
  app: string;
  title: string;
  vision: Vision | null;
}

export interface Decision {
  kind: 'quiet' | 'help' | 'haunt';
  message?: string;
}

export interface StatusReport {
  generation: number;
  observationCount: number;
  oldestAt: number | null;
  newestAt: number | null;
  lastDecision: Decision | null;
  latestNotableKind: NotableKind | null;
}

export const VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    app: { type: 'string' },
    activity: { type: 'string' },
    detail: { type: 'string' },
    notable: { type: ['string', 'null'] },
    notable_kind: {
      type: ['string', 'null'],
      enum: ['error', 'warning', 'notification', 'message', null],
    },
  },
  required: ['app', 'activity', 'detail', 'notable', 'notable_kind'],
  additionalProperties: false,
} as const;

// ============================================================================
// 2. Zero-Leak Telemetry & Event Scrubber
// ============================================================================

export interface TelemetryEvent {
  traceId: string;
  spanName: string;
  op: 'invoke_agent' | 'gen_ai.chat' | 'os.window' | 'os.screenshot' | 'ui.ipc';
  durationMs: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: 0;
  // Sensitive fields that must be stripped before persistence/transmission
  request?: unknown;
  user?: unknown;
  extra?: unknown;
  tags?: unknown;
  breadcrumbs?: unknown;
  server_name?: unknown;
  prompt?: unknown;
  completion?: unknown;
}

export function scrubTelemetryEvent(event: TelemetryEvent): Omit<
  TelemetryEvent,
  'request' | 'user' | 'extra' | 'tags' | 'breadcrumbs' | 'server_name' | 'prompt' | 'completion'
> {
  const clone = { ...event };
  delete clone.request;
  delete clone.user;
  delete clone.extra;
  delete clone.tags;
  delete clone.breadcrumbs;
  delete clone.server_name;
  delete clone.prompt;
  delete clone.completion;
  return clone;
}

export async function traceSpan<T>(
  traceId: string,
  spanName: string,
  op: TelemetryEvent['op'],
  fn: () => Promise<{ result: T; inputTokens?: number; outputTokens?: number; model?: string }>
): Promise<T> {
  const startedAt = performance.now();
  const { result, inputTokens, outputTokens, model } = await fn();
  const durationMs = Math.round(performance.now() - startedAt);

  const safeEvent = scrubTelemetryEvent({
    traceId,
    spanName,
    op,
    durationMs,
    model,
    inputTokens,
    outputTokens,
    costUsd: 0,
  });

  const previewPath = join(tmpdir(), 'paperclip-sentry-preview.jsonl');
  await appendFile(previewPath, `${JSON.stringify(safeEvent)}\n`, 'utf8').catch(() => {});
  return result;
}

// ============================================================================
// 3. OS Introspection, Screen Capture & Local Ollama Vision Activities
// ============================================================================

export async function readActiveWindow(traceId: string): Promise<WindowInfo> {
  return traceSpan(traceId, 'readActiveWindow', 'os.window', async () => {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set winTitle to ""
        try
          set winTitle to name of front window of frontApp
        end try
        return appName & "\\n" & winTitle
      end tell
    `;
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    const [app = 'Unknown', title = ''] = stdout.trim().split('\n');
    return { result: { app: app.trim(), title: title.trim() } };
  });
}

export async function captureAndResizeScreen(traceId: string): Promise<string> {
  return traceSpan(traceId, 'captureScreen', 'os.screenshot', async () => {
    const dir = join(tmpdir(), 'paperclip-glance');
    await mkdir(dir, { recursive: true });
    const outPath = join(dir, `glance-${Date.now()}.jpg`);

    // Capture silent screenshot (-x) and resize max dimension to 1280px via sips
    await execFileAsync('screencapture', ['-x', '-t', 'jpg', outPath]);
    await execFileAsync('sips', ['-Z', String(CONFIG.maxImageSide), outPath]);
    return { result: outPath };
  });
}

export async function describeScreen(
  imageBase64: string,
  windowInfo: WindowInfo,
  traceId: string
): Promise<Vision> {
  return traceSpan(traceId, 'describeScreen', 'gen_ai.chat', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.visionTimeoutMs);

    try {
      const prompt = [
        `Active app: "${windowInfo.app}", window title: "${windowInfo.title}".`,
        'Inspect the screenshot and return a compact JSON object describing what the user is doing,',
        'including any visible error, warning, notification, or message.',
      ].join(' ');

      const response = await fetch(`${CONFIG.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: CONFIG.visionModel,
          prompt,
          images: [imageBase64],
          format: VISION_JSON_SCHEMA,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama vision call failed with HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        response: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const parsed = JSON.parse(payload.response) as Vision;
      return {
        result: parsed,
        model: CONFIG.visionModel,
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}

// ============================================================================
// 4. Stuck-Error & Possessed-Mode Decision State Machine
// ============================================================================

export function isPossessedHour(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 0 && hour < CONFIG.hauntUntilHour;
}

export function evaluateStuckState(observations: Observation[], nowMs: number): boolean {
  const errorObservations = observations.filter(
    (obs) => obs.vision?.notable_kind === 'error' && obs.vision.notable
  );
  if (errorObservations.length < 2) return false;

  const latestError = errorObservations[errorObservations.length - 1]!;
  const matchingFirst = errorObservations.find(
    (obs) => obs.vision?.notable === latestError.vision?.notable
  );
  if (!matchingFirst) return false;

  return nowMs - matchingFirst.at >= CONFIG.stuckThresholdMs;
}

export function makeLocalDecision(
  observations: Observation[],
  now = new Date()
): Decision {
  const nowMs = now.getTime();
  const latest = observations[observations.length - 1];
  if (!latest?.vision) {
    return { kind: 'quiet' };
  }

  if (evaluateStuckState(observations, nowMs)) {
    return {
      kind: 'help',
      message: `You've been staring at "${latest.vision.notable}" in ${latest.app} for 20 minutes. Want a second pair of eyes?`,
    };
  }

  if (isPossessedHour(now)) {
    return {
      kind: 'haunt',
      message: `Still inside ${latest.app} after midnight... where are you going to?`,
    };
  }

  return { kind: 'quiet' };
}

// ============================================================================
// 5. Loopback TCP Bridge to Electron Overlay (`127.0.0.1:47831`)
// ============================================================================

export interface OverlayCommand {
  type: 'message' | 'mode' | 'demo';
  text?: string;
  kind?: Decision['kind'];
  possessed?: boolean;
  effect?: 'splatter' | 'lightning' | 'shiver' | 'candle' | 'ink';
  force?: boolean;
}

export async function sendToGhostOverlay(cmd: OverlayCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: CONFIG.uiHost, port: CONFIG.uiPort }, () => {
      socket.write(`${JSON.stringify(cmd)}\n`, 'utf8', () => {
        socket.end();
        resolve();
      });
    });
    socket.on('error', (err) => reject(err));
  });
}

export function createOverlayTcpGate(
  onAcceptedCommand: (cmd: OverlayCommand) => void
): Server {
  let lastInterventionAt = 0;

  return createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const cmd = JSON.parse(line) as OverlayCommand;
          const now = Date.now();
          if (
            cmd.type === 'message' &&
            !cmd.force &&
            now - lastInterventionAt < CONFIG.interruptionCooldownMs
          ) {
            continue; // Enforce 3-minute cooldown gate
          }
          if (cmd.type === 'message') {
            lastInterventionAt = now;
          }
          onAcceptedCommand(cmd);
        } catch {
          // Ignore malformed JSON frames
        }
      }
    });
  });
}

// ============================================================================
// 6. Durable Glance Loop Orchestrator (Sliding Memory + Rollover State)
// ============================================================================

export interface GlanceWorkflowState {
  generation: number;
  observations: Observation[];
  lastVisionAt: number;
  lastInterruptedAt: number;
  lastDecision: Decision | null;
}

export class DurableGlanceEngine {
  private state: GlanceWorkflowState;
  private cycleStartedAt: number;

  constructor(initialState?: Partial<GlanceWorkflowState>) {
    this.state = {
      generation: initialState?.generation ?? 1,
      observations: initialState?.observations ?? [],
      lastVisionAt: initialState?.lastVisionAt ?? 0,
      lastInterruptedAt: initialState?.lastInterruptedAt ?? 0,
      lastDecision: initialState?.lastDecision ?? null,
    };
    this.cycleStartedAt = Date.now();
  }

  public getStatus(): StatusReport {
    const obs = this.state.observations;
    const latestWithNotable = [...obs].reverse().find((o) => o.vision?.notable_kind);
    return {
      generation: this.state.generation,
      observationCount: obs.length,
      oldestAt: obs[0]?.at ?? null,
      newestAt: obs[obs.length - 1]?.at ?? null,
      lastDecision: this.state.lastDecision,
      latestNotableKind: latestWithNotable?.vision?.notable_kind ?? null,
    };
  }

  public shouldRollover(nowMs = Date.now()): boolean {
    return nowMs - this.cycleStartedAt >= CONFIG.continueAfterMs;
  }

  public exportRolloverState(): GlanceWorkflowState {
    return {
      ...this.state,
      generation: this.state.generation + 1,
    };
  }

  public pruneSlidingWindow(nowMs = Date.now()): void {
    const cutoff = nowMs - CONFIG.memoryWindowMs;
    this.state.observations = this.state.observations.filter((o) => o.at >= cutoff);
  }

  public shouldRunVision(currentKey: string, nowMs = Date.now()): boolean {
    const prev = this.state.observations[this.state.observations.length - 1];
    const windowChanged = !prev || prev.key !== currentKey;
    const visionStale = nowMs - this.state.lastVisionAt >= CONFIG.visionEveryMs;
    return windowChanged || visionStale;
  }
}