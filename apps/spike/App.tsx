import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { AnchorScene } from './src/ar/AnchorScene';
import { Hud } from './src/ar/Hud';
import { BoardScreen } from './src/board/BoardScreen';

type Tab = 'ar' | 'board';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ar', label: 'AR · Día 2' },
  { id: 'board', label: 'Tablero · Día 3' },
];

export default function App() {
  // Benchmarks must not be cut short by auto-lock.
  useKeepAwake();
  const [tab, setTab] = useState<Tab>('board');

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Only one screen mounted at a time: AR releases the camera and GPU while the board is measured. */}
      {tab === 'ar' ? (
        <View style={styles.container}>
          <ViroARSceneNavigator autofocus initialScene={{ scene: AnchorScene }} style={styles.container} />
          <Hud />
        </View>
      ) : (
        <BoardScreen />
      )}

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  tabs: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 4,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  tabActive: { backgroundColor: '#4F7CFF' },
  tabText: { color: '#C9D1E8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
});
