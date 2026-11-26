import { requireNativeModule, type EventSubscription } from 'expo';
import { Linking } from 'react-native';

export type WearablesState = {
  registration: string; // unavailable | available | registering | registered
  devices: number;
  activeDevice: boolean; // AutoDeviceSelector picked a connected pair of glasses
  session: string; // idle | starting | started | paused | stopping | stopped
  stream: string; // stopped | waitingForDevice | starting | streaming | paused | stopping
  mock: boolean;
};

export type GlassesPhoto = {
  uri: string; // file:// JPEG, downscaled to maxSide
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  bytes: number;
  latencyMs: number; // capturePhoto() call -> photo data received, measured natively
};

type NativeModule = {
  getState(): Promise<WearablesState>;
  observeState(): Promise<void>;
  register(): Promise<void>;
  handleUrl(url: string): Promise<boolean>;
  enableMock(): Promise<void>;
  connect(): Promise<void>;
  startStream(): Promise<void>;
  capturePhoto(maxSide?: number): Promise<GlassesPhoto>;
  stop(): Promise<void>;
  addListener(event: 'onStateChange', cb: (s: WearablesState) => void): EventSubscription;
};

const native = requireNativeModule<NativeModule>('MetaWearables');

export const getState = () => native.getState();
export const register = () => native.register();
export const enableMock = () => native.enableMock();
export const connect = () => native.connect();
export const startStream = () => native.startStream();
export const capturePhoto = (maxSide = 1024) => native.capturePhoto(maxSide);
export const stop = () => native.stop();

/**
 * Subscribes to state changes and forwards Meta AI callback URLs
 * (registration / permission round-trips) to the SDK. Call once at startup.
 */
export function startWearables(onState: (s: WearablesState) => void): () => void {
  const required = ['observeState', 'getState', 'addListener', 'handleUrl'] as const;
  const missing = required.filter((k) => typeof (native as any)[k] !== 'function');
  if (missing.length) {
    const keys: string[] = [];
    for (let o: any = native; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      keys.push(...Object.getOwnPropertyNames(o));
    }
    throw new Error(`[MetaWearables] missing native fns: ${missing.join(', ')} | available: ${keys.join(', ')}`);
  }
  const step = <T,>(name: string, fn: () => T): T => {
    try {
      return fn();
    } catch (e: any) {
      throw new Error(`[MetaWearables] ${name} failed: ${e?.message ?? e}`);
    }
  };
  const sub = step('addListener', () => native.addListener('onStateChange', onState));
  const forward = (url?: string | null) => {
    if (url) native.handleUrl(url).catch((e) => console.warn('[MetaWearables] handleUrl', e));
  };
  const linkSub = step('Linking.addEventListener', () => Linking.addEventListener('url', ({ url }) => forward(url)));
  step('Linking.getInitialURL', () => Linking.getInitialURL().then(forward));
  step('observeState', () => native.observeState());
  return () => {
    sub.remove();
    linkSub.remove();
  };
}
