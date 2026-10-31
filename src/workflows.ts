import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
  condition,
  continueAsNew,
  workflowInfo,
  isCancellation,
} from '@temporalio/workflow';
import type * as activities from './activities.js';
import { normalizeSettings, type GlanceInput, type StatusReport } from './shared.js';
import { initialState, pruneSlidingWindow, shouldRunVision, status } from './engine.js';
const a = proxyActivities<typeof activities>({
  startToCloseTimeout: '90 seconds',
  retry: {
    maximumAttempts: 4,
    backoffCoefficient: 2,
    initialInterval: '1 second',
    maximumInterval: '15 seconds',
  },
});
export const statusQuery = defineQuery<StatusReport>('status');
export const askSignal = defineSignal<[string?]>('askGhost');
export async function glanceLoop(input: GlanceInput = {}): Promise<void> {
  const settings = normalizeSettings(input.settings);
  const state = input.state ?? initialState();
  const started = Date.now();
  setHandler(statusQuery, () => status(state));
  setHandler(askSignal, (prompt = '') => {
    if (state.pending.length < 20) state.pending.push(prompt.slice(0, 2000));
  });
  for (;;) {
    const now = Date.now();
    state.observations = pruneSlidingWindow(state.observations, now, settings);
    try {
      const window = await a.readActiveWindow();
      const key = JSON.stringify([window.app, window.title]);
      const vision =
        shouldRunVision(state, key, now, settings) || state.pending.length > 0
          ? await a.observe(window)
          : null;
      if (vision) state.lastVisionAt = now;
      state.observations.push({ ...window, at: now, key, vision });
      const hour = await a.localHour();
      await a.showInterruption({ type: 'mode', possessed: hour < settings.hauntUntilHour });
      const prompt = state.pending[0];
      const decision = await a.decide(state.observations, now, hour, settings, prompt);
      state.lastDecision = decision;
      if (
        decision.kind !== 'quiet' &&
        (prompt !== undefined ||
          state.lastInterruptedAt === 0 ||
          now - state.lastInterruptedAt >= settings.interruptionGapMs)
      ) {
        await a.showInterruption({
          type: 'message',
          text: decision.message,
          kind: decision.kind,
          force: prompt !== undefined,
        });
        state.lastInterruptedAt = Date.now();
        if (prompt !== undefined) state.pending.shift();
      }
      state.lastError = null;
    } catch (error) {
      if (isCancellation(error)) throw error;
      state.lastError =
        'Glance failed. Check capture permissions, Ollama, and the overlay; retrying.';
    }
    if (Date.now() - started >= settings.continueAfterMs || workflowInfo().continueAsNewSuggested)
      return continueAsNew<typeof glanceLoop>({
        settings,
        state: {
          ...state,
          observations: pruneSlidingWindow(state.observations, Date.now(), settings),
          generation: state.generation + 1,
        },
      });
    // Back off after failures even when a request is waiting.
    await condition(() => state.lastError === null && state.pending.length > 0, settings.tickMs);
  }
}
