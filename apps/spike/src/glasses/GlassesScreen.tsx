import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  capturePhoto,
  connect,
  enableMock,
  register,
  startStream,
  startWearables,
  stop,
  type GlassesPhoto,
  type WearablesState,
} from '@spike/meta-wearables';

const STABILITY_SECONDS = 10 * 60;
const STABILITY_PHOTO_EVERY_S = 30;

export function GlassesScreen() {
  const [state, setState] = useState<WearablesState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<GlassesPhoto | null>(null);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [stability, setStability] = useState<{ left: number; summary: string | null } | null>(null);
  const stabilityRun = useRef<{
    startedAt: number;
    photos: number[];
    failures: string[];
    disconnects: number;
  } | null>(null);
  const lastStream = useRef<string>('stopped');

  useEffect(
    () =>
      startWearables((s) => {
        setState(s);
        // Count stream drops during the stability run.
        if (stabilityRun.current && lastStream.current === 'streaming' && s.stream !== 'streaming') {
          stabilityRun.current.disconnects += 1;
        }
        lastStream.current = s.stream;
      }),
    [],
  );

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e: any) {
      setError(`${label}: ${e?.message ?? String(e)}`);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function takePhoto() {
    const p = await run('Foto', () => capturePhoto(1024));
    if (p) {
      setPhoto(p);
      setLatencies((l) => [...l, p.latencyMs]);
      console.log('SPIKE_PHOTO ' + JSON.stringify(p));
    }
    return p;
  }

  async function stabilityTest() {
    if (stabilityRun.current) return;
    const r = { startedAt: Date.now(), photos: [] as number[], failures: [] as string[], disconnects: 0 };
    stabilityRun.current = r;
    setStability({ left: STABILITY_SECONDS, summary: null });
    let nextPhotoAt = 0;
    while (Date.now() - r.startedAt < STABILITY_SECONDS * 1000) {
      const t = (Date.now() - r.startedAt) / 1000;
      if (t >= nextPhotoAt) {
        nextPhotoAt += STABILITY_PHOTO_EVERY_S;
        try {
          if (lastStream.current !== 'streaming') {
            await connect();
            await startStream();
          }
          const p = await capturePhoto(1024);
          r.photos.push(p.latencyMs);
          setPhoto(p);
          setLatencies((l) => [...l, p.latencyMs]);
        } catch (e: any) {
          r.failures.push(`${Math.round(t)}s: ${e?.message ?? String(e)}`);
        }
        console.log('SPIKE_PROGRESS ' + JSON.stringify({ test: 'dia5-glasses-stability', t: Math.round(t), ...stats(r.photos), failures: r.failures.length, disconnects: r.disconnects }));
      }
      setStability({ left: Math.max(0, Math.round(STABILITY_SECONDS - t)), summary: null });
      await new Promise((res) => setTimeout(res, 1000));
    }
    const s = stats(r.photos);
    const report = {
      test: 'dia5-glasses-stability',
      device: 'iPhone 17 Pro + Ray-Ban Meta',
      mock: state?.mock ?? false,
      durationS: STABILITY_SECONDS,
      ...s,
      failures: r.failures,
      disconnects: r.disconnects,
    };
    console.log('SPIKE_RESULT ' + JSON.stringify(report));
    stabilityRun.current = null;
    setStability({
      left: 0,
      summary:
        `${s.count} fotos · prom ${s.avgMs} ms · p95 ${s.p95Ms} ms · máx ${s.maxMs} ms\n` +
        `fallos ${r.failures.length} · cortes de stream ${r.disconnects}`,
    });
  }

  const s = stats(latencies);
  const streaming = state?.stream === 'streaming';
  const running = !!stabilityRun.current;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Ray-Ban Meta</Text>
      <View style={styles.card}>
        <Row k="Registro" v={state?.registration ?? '—'} />
        <Row k="Dispositivos" v={String(state?.devices ?? 0)} />
        <Row k="Gafas activas" v={state?.activeDevice ? 'sí' : 'no'} />
        <Row k="Sesión" v={state?.session ?? '—'} />
        <Row k="Stream" v={state?.stream ?? '—'} />
        <Row k="Mock" v={state?.mock ? 'sí' : 'no'} />
      </View>

      <View style={styles.grid}>
        <Btn label="1 · Registrar (Meta AI)" onPress={() => run('Registro', register)} disabled={!!busy || running} />
        <Btn label="Mock (sin gafas)" onPress={() => run('Mock', enableMock)} disabled={!!busy || running} secondary />
        <Btn label="2 · Conectar" onPress={() => run('Conectar', connect)} disabled={!!busy || running} />
        <Btn label="3 · Stream" onPress={() => run('Stream', startStream)} disabled={!!busy || running} />
        <Btn label="4 · Foto" onPress={takePhoto} disabled={!!busy || !streaming || running} />
        <Btn label="Detener" onPress={() => run('Detener', stop)} disabled={!!busy || running} secondary />
        <Btn
          label={running ? `Estabilidad: ${stability?.left ?? 0}s` : 'Prueba 10 min'}
          onPress={stabilityTest}
          disabled={!!busy || running || !streaming}
        />
      </View>

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.line}>{busy}…</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {latencies.length > 0 && (
        <Text style={styles.line}>
          Latencia ({s.count} fotos): última {latencies[latencies.length - 1]} ms · prom {s.avgMs} ms · p95 {s.p95Ms} ms
        </Text>
      )}
      {stability?.summary && <Text style={styles.summary}>{stability.summary}</Text>}

      {photo && (
        <View>
          <Image source={{ uri: photo.uri }} style={[styles.photo, { aspectRatio: photo.width / photo.height }]} />
          <Text style={styles.caption}>
            {photo.originalWidth}×{photo.originalHeight} ({Math.round(photo.originalBytes / 1024)} KB) → {photo.width}×
            {photo.height} ({Math.round(photo.bytes / 1024)} KB)
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function stats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    count: ms.length,
    avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
    p95Ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] : 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

function Btn(props: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.btn, props.secondary && styles.btnSecondary, props.disabled && styles.btnDisabled]}
    >
      <Text style={styles.btnText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1220' },
  content: { paddingTop: 116, paddingHorizontal: 16, paddingBottom: 60, gap: 14 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: '#1A2036', borderRadius: 12, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { color: '#9AA4C4', fontSize: 14 },
  v: { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { backgroundColor: '#4F7CFF', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20 },
  btnSecondary: { backgroundColor: '#2C3556' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  busy: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  line: { color: '#C9D1E8', fontSize: 13, fontVariant: ['tabular-nums'] },
  error: { color: '#FF6B6B', fontSize: 13 },
  summary: { color: '#fff', fontSize: 13, lineHeight: 19, backgroundColor: '#1A2036', padding: 12, borderRadius: 12 },
  photo: { width: '100%', borderRadius: 12, backgroundColor: '#1A2036' },
  caption: { color: '#9AA4C4', fontSize: 12, marginTop: 6 },
});
