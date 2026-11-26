import { requireNativeModule } from 'expo';

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';

type DeviceMetricsNative = {
  getThermalState(): ThermalState;
  isLowPowerMode(): boolean;
};

const native = requireNativeModule<DeviceMetricsNative>('DeviceMetrics');

export const getThermalState = (): ThermalState => native.getThermalState();
export const isLowPowerMode = (): boolean => native.isLowPowerMode();
