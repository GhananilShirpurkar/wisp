export const taskQueue = 'paperclip-glance';
export const workflowId = 'paperclip-glance';
export const uiPort = 47831;
export const effects = ['splatter', 'lightning', 'shiver', 'candle', 'ink'] as const;
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
export interface Observation extends WindowInfo {
  at: number;
  key: string;
  vision: Vision | null;
}
export interface Decision {
  kind: 'quiet' | 'help' | 'haunt';
  message?: string;
}
export interface Settings {
  tickMs: number;
  visionEveryMs: number;
  memoryMs: number;
  continueAfterMs: number;
  interruptionGapMs: number;
  stuckMs: number;
  hauntUntilHour: number;
}
export const defaults: Settings = {
  tickMs: 5000,
  visionEveryMs: 45000,
  memoryMs: 1800000,
  continueAfterMs: 3600000,
  interruptionGapMs: 180000,
  stuckMs: 1200000,
  hauntUntilHour: 5,
};
export interface State {
  generation: number;
  observations: Observation[];
  lastVisionAt: number;
  lastInterruptedAt: number;
  lastDecision: Decision | null;
  lastError: string | null;
  pending: string[];
}
export interface GlanceInput {
  settings?: Partial<Settings>;
  state?: State;
}
export interface StatusReport {
  generation: number;
  observationCount: number;
  oldestAt: number | null;
  newestAt: number | null;
  lastDecision: Decision | null;
  lastError: string | null;
  pendingAsks: number;
}
export interface OverlayCommand {
  type: 'message' | 'mode' | 'demo';
  text?: string;
  kind?: Decision['kind'];
  possessed?: boolean;
  effect?: (typeof effects)[number];
  force?: boolean;
}
export const visionSchema = {
  type: 'object',
  properties: {
    app: { type: 'string' },
    activity: { type: 'string' },
    detail: { type: 'string' },
    notable: { type: ['string', 'null'] },
    notable_kind: { enum: ['error', 'warning', 'notification', 'message', null] },
  },
  required: ['app', 'activity', 'detail', 'notable', 'notable_kind'],
  additionalProperties: false,
};
export function validateVision(value: unknown): Vision {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid vision response');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    !['app', 'activity', 'detail'].every(
      (k) => typeof v[k] === 'string' && (v[k] as string).length <= 4000,
    ) ||
    !(v.notable === null || (typeof v.notable === 'string' && v.notable.length <= 4000)) ||
    ![null, 'error', 'warning', 'notification', 'message'].includes(v.notable_kind as string | null)
  )
    throw new Error('Invalid vision response');
  return v as unknown as Vision;
}
export function normalizeSettings(input: Partial<Settings> = {}): Settings {
  const s = { ...defaults, ...input };
  for (const [key, value] of Object.entries(s))
    if (!Number.isFinite(value) || value < (key === 'hauntUntilHour' ? 0 : 1))
      throw new Error(`Invalid setting: ${key}`);
  if (s.hauntUntilHour > 24) throw new Error('Invalid haunt hour');
  return s;
}
