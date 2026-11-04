export type Id = string;
export type Ratio = '9:16' | '16:9' | '1:1' | '4:5' | '3:4' | '4:3' | '21:9';
export const RATIO_VALUE: Record<Ratio, number> = {
  '9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4, '4:3': 4 / 3, '21:9': 21 / 9,
};
export interface Asset {
  id: Id; uri: string; kind: 'video' | 'image' | 'audio'; name: string;
  durationMs: number; width: number; height: number; hasAudio: boolean;
}
/** All values -100..100 */
export interface Adjust { brightness: number; contrast: number; saturation: number; exposure: number; warmth: number; tint: number }
export interface Transform { x: number; y: number; scale: number; rotation: number; opacity: number }
export interface MainClip {
  id: Id; kind: 'video' | 'image'; uri: string; name: string; srcDurationMs: number;
  width: number; height: number; hasAudio: boolean;
  inMs: number; outMs: number; speed: number; volume: number;
  adjust: Adjust; filterId: string | null; filterIntensity: number;
  flipH: boolean; flipV: boolean; rotation: number; zoom: number;
}
export interface TextStyle {
  font: string; // font id: bundled (poppins, serif, mono, condensed) or custom_*; size: number; color: string;
  bg: string | null; strokeColor: string | null; strokeWidth: number;
  bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; shadow: boolean;
}
interface ItemBase { id: Id; startMs: number; durationMs: number; row: number }
export interface TextItem extends ItemBase { kind: 'text'; text: string; transform: Transform; style: TextStyle }
export interface StickerItem extends ItemBase { kind: 'sticker'; emoji?: string; uri?: string; aspect: number; size: number; transform: Transform }
export interface AudioItem extends ItemBase { kind: 'audio'; uri: string; name: string; srcDurationMs: number; inMs: number; volume: number }
export interface Project {
  id: Id; name: string; createdAt: number; updatedAt: number; ratio: Ratio; cover?: string;
  main: MainClip[]; texts: TextItem[]; stickers: StickerItem[]; audio: AudioItem[];
}
export type OverlayKind = 'text' | 'sticker' | 'audio';
export type Selection = { kind: 'main' | OverlayKind; id: Id } | null;
