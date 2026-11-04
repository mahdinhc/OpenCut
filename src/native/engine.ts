import {NativeEventEmitter, NativeModules, requireNativeComponent, StyleProp, ViewStyle} from 'react-native';

const M = NativeModules.OpenCutEngine;
export const engineEvents = new NativeEventEmitter(M);

export interface GalleryItem { id: string; uri: string; kind: 'video' | 'image'; name: string; width: number; height: number; durationMs: number }
export interface Probe { uri: string; kind: 'video' | 'image' | 'audio'; name: string; width: number; height: number; durationMs: number; hasAudio: boolean }

export interface FontInfo { id: string; label: string; custom: boolean }

const waveCache = new Map<string, Promise<number[]>>();

export const Engine = {
  getGallery: (kind: 'all' | 'video' | 'image', offset: number, limit: number): Promise<GalleryItem[]> => M.getGallery(kind, offset, limit),
  probe: (uri: string): Promise<Probe> => M.probe(uri),
  getFrames: (uri: string, kind: string, times: number[], w: number, h: number): Promise<string[]> => M.getFrames(uri, kind, times, w, h),
  getWaveform: (uri: string, buckets = 240): Promise<number[]> => {
    const k = uri + buckets;
    if (!waveCache.has(k)) waveCache.set(k, M.getWaveform(uri, buckets).catch(() => new Array(buckets).fill(0.3)));
    return waveCache.get(k)!;
  },
  getFonts: (): Promise<FontInfo[]> => M.getFonts(),
  importFont: (): Promise<FontInfo | null> => M.importFont(),
  pickFile: (mime: string): Promise<Probe | null> => M.pickFile(mime),
  startExport: (spec: object): Promise<string> => M.startExport(JSON.stringify(spec)),
  cancelExport: () => M.cancelExport(),
  openVideo: (uri: string) => M.openVideo(uri),
  shareVideo: (uri: string) => M.shareVideo(uri),
};

export interface PreviewProps {
  style?: StyleProp<ViewStyle>;
  timeline: string; audio: string; ratio: number; playing: boolean;
  seek: {ms: number; exact: boolean; n: number};
  onProgress?: (e: {nativeEvent: {ms: number}}) => void;
  onEnded?: () => void;
  onError?: (e: {nativeEvent: {message: string}}) => void;
}
export const PreviewView = requireNativeComponent<PreviewProps>('OpenCutPreview');
