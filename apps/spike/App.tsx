import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { StyleSheet, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { AnchorScene } from './src/ar/AnchorScene';
import { Hud } from './src/ar/Hud';

export default function App() {
  // The 5-minute thermal run must not be cut short by auto-lock.
  useKeepAwake();

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator autofocus initialScene={{ scene: AnchorScene }} style={styles.container} />
      <Hud />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
