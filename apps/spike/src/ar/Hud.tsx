import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Battery from 'expo-battery';
import { getThermalState, isLowPowerMode, type ThermalState } from '../../modules/device-metrics';
import { isRunning, runElapsedSeconds, startRun, stopRun, summarizeRun, takeSecond, type RunSummary } from '../metrics';
import { sceneBus } from './sceneBus';

const RUN_SECONDS = 5 * 60;

type Snapshot = { fps: number; slow: number; worstMs: number; thermal: ThermalState; battery: number };

export function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [placed, setPlaced] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const runStart = useRef<{ thermal: ThermalState; battery: number; lowPower: boolean } | null>(null);
  const thermalLog = useRef<{ t: number; state: ThermalState }[]>([]);

  useEffect(() => {
    sceneBus.onPlacedChange = setPlaced;
    const id = setInterval(async () => {
      const s = takeSecond();
      const thermal = getThermalState();
      const battery = await Battery.getBatteryLevelAsync();
      setSnap({ fps: s.fps, slow: s.slowFrames, worstMs: Math.round(s.worstMs), thermal, battery });

      if (!isRunning()) return;
      const t = Math.round(runElapsedSeconds());
      setElapsed(t);
      const last = thermalLog.current[thermalLog.current.length - 1];
      if (!last || last.state !== thermal) thermalLog.current.push({ t, state: thermal });
      if (t > 0 && t % 30 === 0 && t < RUN_SECONDS) {
        // Checkpoint: if the app dies mid-run, Metro already has the data up to here.
        console.log('SPIKE_PROGRESS ' + JSON.stringify({ t, thermal, batteryPct: Math.round(battery * 100), ...summarizeRun() }));
      }
      if (t >= RUN_SECONDS) finish(thermal, battery);
    }, 1000);
    return () => {
      clearInterval(id);
      sceneBus.onPlacedChange = undefined;
    };
  }, []);

  async function begin() {
    const battery = await Battery.getBatteryLevelAsync();
    runStart.current = { thermal: getThermalState(), battery, lowPower: isLowPowerMode() };
    thermalLog.current = [{ t: 0, state: runStart.current.thermal }];
    setSummary(null);
    setElapsed(0);
    startRun();
  }

  function finish(thermal: ThermalState, battery: number) {
    const r: RunSummary = stopRun();
    const start = runStart.current!;
    const report = {
      test: 'dia2-ar-anchor',
      device: 'iPhone 17 Pro',
      ...r,
      thermalStart: start.thermal,
      thermalEnd: thermal,
      thermalTimeline: thermalLog.current,
      batteryStartPct: Math.round(start.battery * 100),
      batteryEndPct: Math.round(battery * 100),
      lowPowerMode: start.lowPower,
    };
    // Metro prints this; it is the raw data for the go/no-go report.
    console.log('SPIKE_RESULT ' + JSON.stringify(report));
    setSummary(
      `${r.durationS}s · prom ${r.avgFps} fps · mín ${r.minFps} · p5 ${r.p5Fps}\n` +
        `frames lentos ${r.slowFramePct}% · p95 ${r.p95FrameMs} ms\n` +
        `térmico ${start.thermal} → ${thermal} · batería ${report.batteryStartPct}% → ${report.batteryEndPct}%`,
    );
  }

  const running = isRunning();
  const remaining = Math.max(0, RUN_SECONDS - elapsed);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.panel} pointerEvents="none">
        <Text style={styles.big}>{snap ? `${snap.fps} fps` : '— fps'}</Text>
        <Text style={styles.line}>
          lentos {snap?.slow ?? 0}/s · peor {snap?.worstMs ?? 0} ms
        </Text>
        <Text style={[styles.line, thermalColor(snap?.thermal)]}>térmico: {snap?.thermal ?? '—'}</Text>
        <Text style={styles.line}>batería: {snap ? Math.round(snap.battery * 100) : '—'}%</Text>
        {running && (
          <Text style={styles.line}>
            prueba: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} restantes
          </Text>
        )}
      </View>

      {summary && (
        <View style={styles.summary} pointerEvents="none">
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={() => sceneBus.resetPlane?.()}>
          <Text style={styles.btnText}>Reiniciar plano</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, (!placed || running) && styles.btnDisabled]}
          disabled={!placed || running}
          onPress={begin}
        >
          <Text style={styles.btnText}>{running ? 'Midiendo…' : 'Prueba 5 min'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function thermalColor(t?: ThermalState) {
  if (t === 'serious') return { color: '#FFB020' };
  if (t === 'critical') return { color: '#FF4D4F' };
  return null;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', paddingTop: 116, paddingBottom: 40 },
  panel: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 12,
    minWidth: 170,
  },
  big: { color: '#fff', fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  line: { color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] },
  summary: { marginHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.75)', padding: 12, borderRadius: 12 },
  summaryText: { color: '#fff', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  btn: { backgroundColor: '#4F7CFF', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600' },
});
