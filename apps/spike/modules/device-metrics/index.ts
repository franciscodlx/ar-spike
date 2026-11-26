import { requireNativeModule } from 'expo';

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';

type DeviceMetricsNative = {
  getThermalState(): ThermalState;
  isLowPowerMode(): boolean;
  unlockArFrameRate(fps: number): Promise<number>;
};

const native = requireNativeModule<DeviceMetricsNative>('DeviceMetrics');

export const getThermalState = (): ThermalState => native.getThermalState();
export const isLowPowerMode = (): boolean => native.isLowPowerMode();

/** Lifts ViroKit's 30 fps render cap on non-A12 devices. Resolves to views patched (0 = not mounted yet, -1 = Viro not found). */
export const unlockArFrameRate = (fps = 60): Promise<number> => native.unlockArFrameRate(fps);
