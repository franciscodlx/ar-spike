// Frame metrics fed by ViroGameLoop (native render loop) and read by the HUD at 1 Hz.
// Kept outside React state so per-frame updates never trigger re-renders.

export const SLOW_FRAME_MS = 1000 / 60 + 4; // >~20.7 ms = a dropped frame at 60 Hz

type Second = { fps: number; slowFrames: number; worstMs: number };

const frame = { count: 0, slow: 0, worstMs: 0 };
const run = {
  active: false,
  startedAt: 0,
  seconds: [] as Second[],
  frames: 0,
  slowFrames: 0,
  dts: [] as number[],
};

export function recordFrame(dtSeconds: number) {
  const ms = dtSeconds * 1000;
  frame.count += 1;
  if (ms > SLOW_FRAME_MS) frame.slow += 1;
  if (ms > frame.worstMs) frame.worstMs = ms;
  if (run.active) {
    run.frames += 1;
    if (ms > SLOW_FRAME_MS) run.slowFrames += 1;
    run.dts.push(ms);
  }
}

/** Called once per second by the HUD: closes the current 1 s window. */
export function takeSecond(): Second {
  const s = { fps: frame.count, slowFrames: frame.slow, worstMs: frame.worstMs };
  frame.count = 0;
  frame.slow = 0;
  frame.worstMs = 0;
  if (run.active) run.seconds.push(s);
  return s;
}

export function startRun() {
  run.active = true;
  run.startedAt = Date.now();
  run.seconds = [];
  run.frames = 0;
  run.slowFrames = 0;
  run.dts = [];
}

export function runElapsedSeconds() {
  return run.active ? (Date.now() - run.startedAt) / 1000 : 0;
}

export function isRunning() {
  return run.active;
}

export type RunSummary = {
  durationS: number;
  avgFps: number;
  minFps: number;
  p5Fps: number;
  slowFramePct: number;
  p95FrameMs: number;
  p99FrameMs: number;
};

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

export function stopRun(): RunSummary {
  run.active = false;
  // Drop the first second: it includes the warm-up after tapping start.
  const secs = run.seconds.slice(1).map((s) => s.fps);
  const fpsSorted = [...secs].sort((a, b) => a - b);
  const dtSorted = [...run.dts].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    durationS: round((Date.now() - run.startedAt) / 1000),
    avgFps: round(secs.reduce((a, b) => a + b, 0) / Math.max(1, secs.length)),
    minFps: fpsSorted[0] ?? 0,
    p5Fps: percentile(fpsSorted, 5),
    slowFramePct: round((100 * run.slowFrames) / Math.max(1, run.frames)),
    p95FrameMs: round(percentile(dtSorted, 95)),
    p99FrameMs: round(percentile(dtSorted, 99)),
  };
}
