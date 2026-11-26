import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, RoundedRect } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import {
  SIZE,
  areAdjacent,
  collapse,
  createBoard,
  findMatches,
  findValidSwaps,
  swap,
  type Board,
  type Cell,
} from '@spike/game-core';

const PALETTE = ['#FF5A5F', '#FFB400', '#3DDC97', '#4F7CFF', '#B15CFF', '#FF7AC6'];
const PAD = 3;
const T = { swap: 140, clear: 160, fallBase: 140, fallPerRow: 40 };
const AUTO_SECONDS = 60;
// At 120 Hz a frame is 8.3 ms; >12.5 ms means at least one dropped frame.
// >20.7 ms is a dropped frame even at 60 Hz.
const SLOW_120_MS = 12.5;
const SLOW_60_MS = 20.7;

type PieceAnim = { x: SharedValue<number>; y: SharedValue<number>; s: SharedValue<number> };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Piece(props: {
  id: number;
  color: string;
  cell: number;
  row: number;
  col: number;
  register: (id: number, a: PieceAnim) => void;
}) {
  const { id, color, cell, row, col, register } = props;
  const x = useSharedValue(col * cell);
  const y = useSharedValue(row * cell);
  const s = useSharedValue(1);
  useEffect(() => register(id, { x, y, s }), [id, register, x, y, s]);

  const size = cell - PAD * 2;
  const rx = useDerivedValue(() => x.value + PAD + ((1 - s.value) * size) / 2);
  const ry = useDerivedValue(() => y.value + PAD + ((1 - s.value) * size) / 2);
  const w = useDerivedValue(() => size * s.value);
  return <RoundedRect x={rx} y={ry} width={w} height={w} r={size * 0.22} color={color} />;
}

export function BoardScreen() {
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - 32, 480);
  const cell = boardPx / SIZE;

  const boardRef = useRef<Board>(createBoard());
  const [colors, setColors] = useState<number[]>(boardRef.current.colors);
  // Where each piece id starts; only used on first mount, afterwards anims drive position.
  const initialPos = useRef(
    boardRef.current.grid.flatMap((row, r) => row.map((id, c) => ({ id, r, c }))).sort((x, y) => x.id - y.id),
  ).current;
  const anims = useRef<PieceAnim[]>([]);
  const busy = useRef(false);
  const counters = useRef({ swaps: 0, cascades: 0 });

  const register = useCallback((id: number, a: PieceAnim) => {
    anims.current[id] = a;
  }, []);

  // ── Frame meter on the UI thread (where Skia + Reanimated actually draw) ──
  const frames = useSharedValue(0);
  const slow120 = useSharedValue(0);
  const slow60 = useSharedValue(0);
  const worst = useSharedValue(0);
  useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    frames.value += 1;
    if (dt > SLOW_120_MS) slow120.value += 1;
    if (dt > SLOW_60_MS) slow60.value += 1;
    if (dt > worst.value) worst.value = dt;
  });

  const [hud, setHud] = useState({ fps: 0, slow120: 0, slow60: 0, worst: 0 });
  const [auto, setAuto] = useState<{ running: boolean; left: number; summary: string | null }>({
    running: false,
    left: 0,
    summary: null,
  });
  const run = useRef<{ fps: number[]; frames: number; slow120: number; slow60: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const s = { fps: frames.value, slow120: slow120.value, slow60: slow60.value, worst: Math.round(worst.value) };
      frames.value = 0;
      slow120.value = 0;
      slow60.value = 0;
      worst.value = 0;
      setHud(s);
      if (run.current) {
        run.current.fps.push(s.fps);
        run.current.frames += s.fps;
        run.current.slow120 += s.slow120;
        run.current.slow60 += s.slow60;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [frames, slow120, slow60, worst]);

  // ── Animation helpers (JS thread decides, UI thread animates) ──
  const moveTo = (id: number, r: number, c: number, ms: number) => {
    const a = anims.current[id];
    a.x.value = withTiming(c * cell, { duration: ms, easing: Easing.out(Easing.quad) });
    a.y.value = withTiming(r * cell, { duration: ms, easing: Easing.out(Easing.quad) });
  };

  const resolveCascades = async (firstMatches: Cell[]) => {
    let matches = firstMatches;
    while (matches.length) {
      counters.current.cascades += 1;
      const b = boardRef.current;
      for (const { r, c } of matches) {
        anims.current[b.grid[r][c]].s.value = withTiming(0, { duration: T.clear });
      }
      await wait(T.clear);

      const { board, moves } = collapse(b, matches);
      boardRef.current = board;
      setColors(board.colors);
      let longest = 0;
      for (const m of moves) {
        const a = anims.current[m.id];
        if (m.spawned) {
          // Recycled piece: jump above the board (clipped by the canvas), restore size, then fall.
          a.y.value = m.fromRow * cell;
          a.x.value = m.col * cell;
          a.s.value = 1;
        }
        const ms = T.fallBase + T.fallPerRow * (m.toRow - m.fromRow);
        longest = Math.max(longest, ms);
        a.y.value = withTiming(m.toRow * cell, { duration: ms, easing: Easing.out(Easing.cubic) });
      }
      await wait(longest);
      matches = findMatches(boardRef.current);
    }
    if (findValidSwaps(boardRef.current).length === 0) await reshuffle();
  };

  const reshuffle = async () => {
    const ids = boardRef.current.grid.flat();
    ids.forEach((id) => (anims.current[id].s.value = withTiming(0, { duration: T.clear })));
    await wait(T.clear);
    const fresh = createBoard();
    // Keep the existing piece ids: map fresh colors onto the current grid.
    const colorsNext = [...boardRef.current.colors];
    boardRef.current.grid.forEach((row, r) =>
      row.forEach((id, c) => (colorsNext[id] = fresh.colors[fresh.grid[r][c]])),
    );
    boardRef.current = { grid: boardRef.current.grid, colors: colorsNext };
    setColors(colorsNext);
    ids.forEach((id) => (anims.current[id].s.value = withTiming(1, { duration: T.clear })));
    await wait(T.clear);
  };

  const trySwap = async (a: Cell, b: Cell) => {
    if (busy.current || !areAdjacent(a, b)) return;
    busy.current = true;
    try {
      const before = boardRef.current;
      const idA = before.grid[a.r][a.c];
      const idB = before.grid[b.r][b.c];
      moveTo(idA, b.r, b.c, T.swap);
      moveTo(idB, a.r, a.c, T.swap);
      await wait(T.swap);
      const next = swap(before, a, b);
      const matches = findMatches(next);
      if (!matches.length) {
        moveTo(idA, a.r, a.c, T.swap);
        moveTo(idB, b.r, b.c, T.swap);
        await wait(T.swap);
        return;
      }
      counters.current.swaps += 1;
      boardRef.current = next;
      await resolveCascades(matches);
    } finally {
      busy.current = false;
    }
  };

  /** Stress: clear all 64 pieces at once → 64 spawns falling + whatever chains follow. */
  const megaCascade = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const all: Cell[] = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) all.push({ r, c });
      await resolveCascades(all);
    } finally {
      busy.current = false;
    }
  };

  const startAuto = async () => {
    if (run.current) return;
    run.current = { fps: [], frames: 0, slow120: 0, slow60: 0 };
    counters.current = { swaps: 0, cascades: 0 };
    const startedAt = Date.now();
    setAuto({ running: true, left: AUTO_SECONDS, summary: null });
    while (Date.now() - startedAt < AUTO_SECONDS * 1000) {
      const options = findValidSwaps(boardRef.current);
      if (options.length) {
        const [a, b] = options[Math.floor(Math.random() * options.length)];
        await trySwap(a, b);
      } else {
        await wait(50);
      }
      setAuto((s) => ({ ...s, left: Math.max(0, AUTO_SECONDS - Math.round((Date.now() - startedAt) / 1000)) }));
    }
    const r = run.current;
    run.current = null;
    const secs = r.fps.slice(1); // drop the warm-up second
    const sorted = [...secs].sort((x, y) => x - y);
    const round = (n: number) => Math.round(n * 10) / 10;
    const report = {
      test: 'dia3-skia-board',
      device: 'iPhone 17 Pro',
      durationS: AUTO_SECONDS,
      avgFps: round(secs.reduce((x, y) => x + y, 0) / Math.max(1, secs.length)),
      minFps: sorted[0] ?? 0,
      p5Fps: sorted[Math.floor(0.05 * sorted.length)] ?? 0,
      slowOver12_5msPct: round((100 * r.slow120) / Math.max(1, r.frames)),
      slowOver20_7msPct: round((100 * r.slow60) / Math.max(1, r.frames)),
      swaps: counters.current.swaps,
      cascades: counters.current.cascades,
      pieces: SIZE * SIZE,
    };
    console.log('SPIKE_RESULT ' + JSON.stringify(report));
    setAuto({
      running: false,
      left: 0,
      summary:
        `prom ${report.avgFps} fps · mín ${report.minFps} · p5 ${report.p5Fps}\n` +
        `frames >12.5 ms ${report.slowOver12_5msPct}% · >20.7 ms ${report.slowOver20_7msPct}%\n` +
        `${report.swaps} swaps · ${report.cascades} cascadas`,
    });
  };

  // ── Gesture: swipe from a cell towards a neighbour ──
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 10,
    onDeactivate: (e) => {
      if (e.canceled || run.current) return;
      const sx = e.x - e.translationX;
      const sy = e.y - e.translationY;
      const from = { r: Math.floor(sy / cell), c: Math.floor(sx / cell) };
      if (from.r < 0 || from.r >= SIZE || from.c < 0 || from.c >= SIZE) return;
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      const to = horizontal
        ? { r: from.r, c: from.c + Math.sign(e.translationX) }
        : { r: from.r + Math.sign(e.translationY), c: from.c };
      if (to.r < 0 || to.r >= SIZE || to.c < 0 || to.c >= SIZE) return;
      trySwap(from, to);
    },
  });

  return (
    <View style={styles.root}>
      <View style={styles.hud}>
        <Text style={styles.big}>{hud.fps} fps</Text>
        <Text style={styles.line}>
          &gt;12.5 ms: {hud.slow120}/s · &gt;20.7 ms: {hud.slow60}/s · peor {hud.worst} ms
        </Text>
        {auto.running && <Text style={styles.line}>auto: {auto.left}s restantes</Text>}
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.boardWrap, { width: boardPx, height: boardPx }]}>
          <Canvas style={{ width: boardPx, height: boardPx }}>
            {colors.map((color, id) => (
              <Piece
                key={id}
                id={id}
                color={PALETTE[color]}
                cell={cell}
                row={initialPos[id].r}
                col={initialPos[id].c}
                register={register}
              />
            ))}
          </Canvas>
        </View>
      </GestureDetector>

      {auto.summary && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{auto.summary}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, auto.running && styles.btnDisabled]} disabled={auto.running} onPress={megaCascade}>
          <Text style={styles.btnText}>Cascada total</Text>
        </Pressable>
        <Pressable style={[styles.btn, auto.running && styles.btnDisabled]} disabled={auto.running} onPress={startAuto}>
          <Text style={styles.btnText}>{auto.running ? 'Midiendo…' : `Auto ${AUTO_SECONDS} s`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1220', alignItems: 'center', justifyContent: 'center', gap: 20 },
  hud: { alignSelf: 'stretch', marginHorizontal: 16 },
  big: { color: '#fff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  line: { color: '#C9D1E8', fontSize: 13, fontVariant: ['tabular-nums'] },
  boardWrap: { backgroundColor: '#1A2036', borderRadius: 14, overflow: 'hidden' },
  summary: { marginHorizontal: 16, backgroundColor: '#1A2036', padding: 12, borderRadius: 12 },
  summaryText: { color: '#fff', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { backgroundColor: '#4F7CFF', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600' },
});
