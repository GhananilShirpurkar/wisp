import {
  defaults,
  type State,
  type Observation,
  type Settings,
  type StatusReport,
  type Decision,
} from './shared.js';
export function initialState(): State {
  return {
    generation: 1,
    observations: [],
    lastVisionAt: 0,
    lastInterruptedAt: 0,
    lastDecision: null,
    lastError: null,
    pending: [],
  };
}
export function shouldRunVision(
  state: State,
  key: string,
  now: number,
  settings = defaults,
): boolean {
  return (
    state.lastVisionAt === 0 ||
    state.observations.at(-1)?.key !== key ||
    now - state.lastVisionAt >= settings.visionEveryMs
  );
}
export function pruneSlidingWindow(
  observations: Observation[],
  now: number,
  settings = defaults,
): Observation[] {
  return observations.filter((o) => o.at >= now - settings.memoryMs);
}
export function evaluateStuckState(
  observations: Observation[],
  now: number,
  settings = defaults,
): boolean {
  const samples = observations.filter((o) => o.vision !== null);
  const latest = samples.at(-1);
  if (
    !latest ||
    latest.vision?.notable_kind !== 'error' ||
    !latest.vision.notable ||
    now - latest.at > settings.visionEveryMs * 2
  )
    return false;
  let first = latest;
  for (let i = samples.length - 2; i >= 0; i--) {
    const o = samples[i];
    if (
      o.key !== latest.key ||
      o.vision?.notable_kind !== 'error' ||
      o.vision.notable !== latest.vision.notable ||
      first.at - o.at > settings.visionEveryMs * 2
    )
      break;
    first = o;
  }
  return latest.at - first.at >= settings.stuckMs;
}
export function makeLocalDecision(
  observations: Observation[],
  now: number,
  hour: number,
  settings: Settings,
  prompt?: string,
): Decision {
  const latest = observations.at(-1);
  const vision = [...observations].reverse().find((o) => o.key === latest?.key && o.vision)?.vision;
  if (prompt !== undefined)
    return {
      kind: 'help',
      message: vision
        ? `I see ${vision.activity} in ${vision.app}. ${vision.notable ? `Check the first failing step: ${vision.notable}.` : vision.detail} ${prompt ? 'Your question is queued for local advice.' : ''}`
        : 'I am here. Enable screen capture and a local vision model for contextual help.',
    };
  if (evaluateStuckState(observations, now, settings))
    return {
      kind: 'help',
      message: `This error has persisted for ${Math.round(settings.stuckMs / 60000)} minutes: ${vision?.notable}. Try isolating the first failing step and checking its inputs.`,
    };
  if (hour < settings.hauntUntilHour)
    return {
      kind: 'haunt',
      message: `Still in ${latest?.app ?? 'the shadows'} after midnight… I can wait.`,
    };
  return { kind: 'quiet' };
}
export function status(state: State): StatusReport {
  return {
    generation: state.generation,
    observationCount: state.observations.length,
    oldestAt: state.observations[0]?.at ?? null,
    newestAt: state.observations.at(-1)?.at ?? null,
    lastDecision: state.lastDecision,
    lastError: state.lastError,
    pendingAsks: state.pending.length,
  };
}
