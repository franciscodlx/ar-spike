import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroAmbientLight,
  ViroBox,
  ViroMaterials,
  ViroText,
} from '@reactvision/react-viro';

ViroMaterials.createMaterials({
  cube: { diffuseColor: '#4F7CFF', lightingModel: 'Blinn' },
});

// Día 1: humo de ViroReact sobre la nueva arquitectura. El día 2 añade planos y anclas.
function SmokeScene() {
  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" />
      <ViroText
        text="Spike AR · Día 1"
        position={[0, 0.15, -1]}
        scale={[0.3, 0.3, 0.3]}
        style={styles.arText}
      />
      <ViroBox position={[0, -0.1, -1]} scale={[0.15, 0.15, 0.15]} materials={['cube']} />
    </ViroARScene>
  );
}

export default function App() {
  return (
    <View style={styles.container}>
      <ViroARSceneNavigator autofocus initialScene={{ scene: SmokeScene }} style={styles.container} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>ViroReact · new arch</Text>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  arText: { fontFamily: 'Arial', fontSize: 30, color: '#ffffff', textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontSize: 13 },
});
