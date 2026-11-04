import {create} from 'zustand';
import {Adjust, Asset, AudioItem, MainClip, OverlayKind, Project, Ratio, Selection, StickerItem, TextItem, TextStyle, Transform} from '../types';
import {assignRow, clipDuration, layoutMain} from '../engine/layout';
import {clamp, uid} from '../util';

export const DEFAULT_ADJUST: Adjust = {brightness: 0, contrast: 0, saturation: 0, exposure: 0, warmth: 0, tint: 0};
export const DEFAULT_TRANSFORM: Transform = {x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1};
export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: 'sans', size: 0.07, color: '#FFFFFF', bg: null, strokeColor: null, strokeWidth: 0,
  bold: true, italic: false, align: 'center', shadow: true,
};
export const IMAGE_DEFAULT_MS = 3000;
const MIN_MS = 200;

export function newMainClip(a: Asset): MainClip {
  const image = a.kind === 'image';
  return {
    id: uid(), kind: image ? 'image' : 'video', uri: a.uri, name: a.name,
    srcDurationMs: image ? 600000 : a.durationMs, width: a.width, height: a.height, hasAudio: a.hasAudio,
    inMs: 0, outMs: image ? IMAGE_DEFAULT_MS : a.durationMs, speed: 1, volume: 1,
    adjust: {...DEFAULT_ADJUST}, filterId: null, filterIntensity: 1, flipH: false, flipV: false, rotation: 0, zoom: 1,
  };
}

export function newProject(assets: Asset[]): Project {
  const now = Date.now();
  const d = new Date(now);
  const first = assets[0];
  const ratio: Ratio = first && first.width > first.height ? '16:9' : '9:16';
  return {
    id: uid(), name: `Project ${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${('0' + d.getMinutes()).slice(-2)}`,
    createdAt: now, updatedAt: now, ratio, main: assets.map(newMainClip), texts: [], stickers: [], audio: [],
  };
}

type Patch<T> = Partial<T>;
interface EditorState {
  project: Project | null;
  selection: Selection;
  past: Project[]; future: Project[];
  open: (p: Project) => void;
  close: () => void;
  select: (s: Selection) => void;
  checkpoint: () => void;
  undo: () => void; redo: () => void;
  addAssets: (assets: Asset[]) => void;
  updateMain: (id: string, patch: Patch<MainClip>, history?: boolean) => void;
  updateAllMain: (patch: Patch<MainClip>) => void;
  setRange: (id: string, inMs: number, outMs: number) => void;
  moveMain: (id: string, toIndex: number) => void;
  addText: (startMs: number, text?: string, style?: Partial<TextStyle>) => string;
  addSticker: (startMs: number, s: {emoji?: string; uri?: string; aspect?: number; size?: number}) => string;
  addAudio: (startMs: number, a: Asset) => void;
  updateItem: (kind: OverlayKind, id: string, patch: any, history?: boolean) => void;
  moveItem: (kind: OverlayKind, id: string, startMs: number, durationMs: number, inMs?: number) => void;
  splitAt: (ms: number) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  setRatio: (r: Ratio) => void;
  setCover: (uri: string) => void;
}

export const useEditor = create<EditorState>((set, get) => {
  const mutate = (fn: (p: Project) => Project, history = true) =>
    set(s => {
      if (!s.project) return s;
      const next = fn(s.project);
      if (next === s.project) return s;
      return {
        project: {...next, updatedAt: Date.now()},
        past: history ? [...s.past.slice(-99), s.project] : s.past,
        future: history ? [] : s.future,
      };
    });
  const total = () => layoutMain(get().project?.main ?? []).total;
  const listFor = (p: Project, k: OverlayKind): any[] => (k === 'text' ? p.texts : k === 'sticker' ? p.stickers : p.audio);
  const withList = (p: Project, k: OverlayKind, l: any[]): Project => (k === 'text' ? {...p, texts: l} : k === 'sticker' ? {...p, stickers: l} : {...p, audio: l});

  return {
    project: null, selection: null, past: [], future: [],
    open: p => set({project: p, selection: null, past: [], future: []}),
    close: () => set({project: null, selection: null, past: [], future: []}),
    select: selection => set({selection}),
    checkpoint: () => set(s => (s.project ? {past: [...s.past.slice(-99), s.project], future: []} : s)),
    undo: () => set(s => {
      if (!s.project || !s.past.length) return s;
      return {project: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.project, ...s.future], selection: null};
    }),
    redo: () => set(s => {
      if (!s.project || !s.future.length) return s;
      return {project: s.future[0], future: s.future.slice(1), past: [...s.past, s.project], selection: null};
    }),

    addAssets: assets => mutate(p => ({...p, main: [...p.main, ...assets.map(newMainClip)]})),
    updateMain: (id, patch, history = true) => mutate(p => ({...p, main: p.main.map(c => (c.id === id ? {...c, ...patch} : c))}), history),
    updateAllMain: patch => mutate(p => ({...p, main: p.main.map(c => ({...c, ...patch}))})),
    setRange: (id, inMs, outMs) => mutate(p => ({...p, main: p.main.map(c => (c.id === id ? {...c, inMs, outMs} : c))}), false),
    moveMain: (id, toIndex) => mutate(p => {
      const from = p.main.findIndex(c => c.id === id);
      if (from < 0 || from === toIndex) return p;
      const arr = p.main.slice();
      const [c] = arr.splice(from, 1);
      arr.splice(clamp(toIndex, 0, arr.length), 0, c);
      return {...p, main: arr};
    }),

    addText: (startMs, text = 'Tap to edit', style = {}) => {
      const id = uid();
      mutate(p => {
        const dur = Math.min(3000, Math.max(MIN_MS, total() - startMs)) || 3000;
        const item: TextItem = {
          id, kind: 'text', text, startMs, durationMs: dur, row: assignRow(p.texts, startMs, dur),
          transform: {...DEFAULT_TRANSFORM, y: 0.5}, style: {...DEFAULT_TEXT_STYLE, ...style},
        };
        return {...p, texts: [...p.texts, item]};
      });
      set({selection: {kind: 'text', id}});
      return id;
    },
    addSticker: (startMs, s) => {
      const id = uid();
      mutate(p => {
        const dur = Math.min(3000, Math.max(MIN_MS, total() - startMs)) || 3000;
        const item: StickerItem = {
          id, kind: 'sticker', emoji: s.emoji, uri: s.uri, aspect: s.aspect ?? 1, size: s.size ?? (s.emoji ? 0.2 : 0.4),
          startMs, durationMs: dur, row: assignRow(p.stickers, startMs, dur), transform: {...DEFAULT_TRANSFORM},
        };
        return {...p, stickers: [...p.stickers, item]};
      });
      set({selection: {kind: 'sticker', id}});
      return id;
    },
    addAudio: (startMs, a) => mutate(p => {
      const dur = Math.max(MIN_MS, Math.min(a.durationMs, total() - startMs));
      const item: AudioItem = {
        id: uid(), kind: 'audio', uri: a.uri, name: a.name, srcDurationMs: a.durationMs, startMs, inMs: 0,
        durationMs: dur, volume: 1, row: assignRow(p.audio, startMs, dur),
      };
      return {...p, audio: [...p.audio, item]};
    }),
    updateItem: (kind, id, patch, history = true) => mutate(p => withList(p, kind, listFor(p, kind).map(i => (i.id === id ? {...i, ...patch} : i))), history),
    moveItem: (kind, id, startMs, durationMs, inMs) => mutate(p => {
      const list = listFor(p, kind);
      const others = list.filter(i => i.id !== id);
      const row = assignRow(others, startMs, durationMs);
      return withList(p, kind, list.map(i => (i.id === id ? {...i, startMs, durationMs, row, ...(inMs !== undefined ? {inMs} : {})} : i)));
    }, false),

    splitAt: ms => {
      const s = get();
      const p = s.project; if (!p) return;
      const sel = s.selection;
      if (sel && sel.kind !== 'main') {
        const it = listFor(p, sel.kind).find(i => i.id === sel.id);
        if (!it || ms <= it.startMs + MIN_MS || ms >= it.startMs + it.durationMs - MIN_MS) return;
        const left = {...it, durationMs: ms - it.startMs};
        const right = {...it, id: uid(), startMs: ms, durationMs: it.startMs + it.durationMs - ms, ...(sel.kind === 'audio' ? {inMs: it.inMs + (ms - it.startMs)} : {})};
        mutate(pp => withList(pp, sel.kind as OverlayKind, listFor(pp, sel.kind as OverlayKind).flatMap(i => (i.id === it.id ? [left, right] : [i]))));
        return;
      }
      const {starts} = layoutMain(p.main);
      let idx = p.main.findIndex((c, i) => c.id === sel?.id && ms > starts[i] && ms < starts[i] + clipDuration(c));
      if (idx < 0) idx = p.main.findIndex((c, i) => ms > starts[i] && ms < starts[i] + clipDuration(c));
      if (idx < 0) return;
      const c = p.main[idx];
      const local = ms - starts[idx];
      if (local < MIN_MS || clipDuration(c) - local < MIN_MS) return;
      const mid = c.inMs + (c.kind === 'image' ? local : local * c.speed);
      const left = {...c, outMs: mid};
      const right = {...c, id: uid(), inMs: mid};
      mutate(pp => ({...pp, main: pp.main.flatMap(x => (x.id === c.id ? [left, right] : [x]))}));
      set({selection: {kind: 'main', id: right.id}});
    },

    duplicateSelected: () => {
      const s = get(); const p = s.project; const sel = s.selection; if (!p || !sel) return;
      if (sel.kind === 'main') {
        const i = p.main.findIndex(c => c.id === sel.id); if (i < 0) return;
        const copy = {...p.main[i], id: uid()};
        mutate(pp => ({...pp, main: [...pp.main.slice(0, i + 1), copy, ...pp.main.slice(i + 1)]}));
        set({selection: {kind: 'main', id: copy.id}});
        return;
      }
      const it = listFor(p, sel.kind).find(i => i.id === sel.id); if (!it) return;
      const startMs = it.startMs + it.durationMs;
      const copy = {...it, id: uid(), startMs, row: assignRow(listFor(p, sel.kind), startMs, it.durationMs)};
      mutate(pp => withList(pp, sel.kind as OverlayKind, [...listFor(pp, sel.kind as OverlayKind), copy]));
      set({selection: {kind: sel.kind, id: copy.id}});
    },
    deleteSelected: () => {
      const s = get(); const sel = s.selection; if (!s.project || !sel) return;
      if (sel.kind === 'main') mutate(p => ({...p, main: p.main.filter(c => c.id !== sel.id)}));
      else mutate(p => withList(p, sel.kind as OverlayKind, listFor(p, sel.kind as OverlayKind).filter(i => i.id !== sel.id)));
      set({selection: null});
    },
    setRatio: ratio => mutate(p => ({...p, ratio})),
    setCover: cover => mutate(p => ({...p, cover}), false),
  };
});
