// The AR scene is mounted by ViroARSceneNavigator, outside the HUD's React tree.
// This tiny bus lets the HUD and the scene talk without prop drilling through Viro.
export const sceneBus: {
  resetPlane?: () => void;
  onPlacedChange?: (placed: boolean) => void;
} = {};
