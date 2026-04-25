export const CRASH_PHASES = Object.freeze({ waiting: "waiting", running: "running", crashed: "crashed", settling: "settling" });

export function createCrashState(seed = {}) {
  return { phase: CRASH_PHASES.waiting, multiplier: 1, history: [], activeBet: null, players: [], connected: false, ...seed };
}

export function normalizeCrashPhase(value) {
  return Object.values(CRASH_PHASES).includes(value) ? value : CRASH_PHASES.waiting;
}
