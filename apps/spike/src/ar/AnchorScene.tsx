import { useRef, useState } from 'react';
import {
  ViroARPlaneSelector,
  ViroARScene,
  ViroAmbientLight,
  ViroBox,
  ViroDirectionalLight,
  ViroGameLoop,
  ViroMaterials,
  ViroNode,
  ViroPinchStateTypes,
  ViroRotateStateTypes,
  ViroText,
} from '@reactvision/react-viro';
import { recordFrame } from '../metrics';
import { sceneBus } from './sceneBus';

ViroMaterials.createMaterials({
  cube: { diffuseColor: '#4F7CFF', lightingModel: 'Blinn' },
});

const BASE_SIZE = 0.1; // 10 cm cube

/**
 * Día 2: detect horizontal planes, tap one to anchor the cube,
 * then drag (move), pinch (scale) and two-finger rotate it.
 */
export function AnchorScene() {
  const selectorRef = useRef<ViroARPlaneSelector>(null);
  const [placed, setPlaced] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotationY, setRotationY] = useState(0);
  const pinchBase = useRef(1);
  const rotateBase = useRef(0);

  sceneBus.resetPlane = () => {
    selectorRef.current?.reset();
    setPlaced(false);
    setScale(1);
    setRotationY(0);
    sceneBus.onPlacedChange?.(false);
  };

  const onPinch = (state: number, factor: number) => {
    if (state === ViroPinchStateTypes.PINCH_START) pinchBase.current = scale;
    const next = Math.min(5, Math.max(0.3, pinchBase.current * factor));
    setScale(next);
  };

  const onRotate = (state: number, factor: number) => {
    if (state === ViroRotateStateTypes.ROTATE_START) rotateBase.current = rotationY;
    setRotationY(rotateBase.current - factor);
  };

  const s = BASE_SIZE * scale;

  return (
    // The selector does not subscribe to anchors itself: the scene must forward them.
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal']}
      onAnchorFound={(a) => selectorRef.current?.handleAnchorFound(a)}
      onAnchorUpdated={(a) => selectorRef.current?.handleAnchorUpdated(a)}
      onAnchorRemoved={(a) => a && selectorRef.current?.handleAnchorRemoved(a)}
    >
      <ViroGameLoop onUpdate={({ dt }) => recordFrame(dt)} />
      <ViroAmbientLight color="#ffffff" intensity={300} />
      <ViroDirectionalLight color="#ffffff" direction={[0, -1, -0.3]} />

      {!placed && (
        <ViroText
          text="Apunta a la mesa y toca el plano"
          position={[0, 0, -1]}
          scale={[0.25, 0.25, 0.25]}
          width={4}
          height={1}
          textClipMode="None"
          style={{ fontFamily: 'Arial', fontSize: 28, color: '#ffffff', textAlign: 'center' }}
        />
      )}

      <ViroARPlaneSelector
        ref={selectorRef}
        alignment="Horizontal"
        onPlaneSelected={() => {
          setPlaced(true);
          sceneBus.onPlacedChange?.(true);
        }}
      >
        <ViroNode
          dragType="FixedToWorld"
          onDrag={() => {}}
          onPinch={onPinch}
          onRotate={onRotate}
          rotation={[0, rotationY, 0]}
        >
          <ViroBox position={[0, s / 2, 0]} scale={[s, s, s]} materials={['cube']} />
        </ViroNode>
      </ViroARPlaneSelector>
    </ViroARScene>
  );
}
