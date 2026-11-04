import {create} from 'zustand';

interface T {
  pos: number; total: number; playing: boolean; scrubbing: boolean;
  seek: {ms: number; exact: boolean; n: number};
  setTotal: (n: number) => void; setPos: (ms: number) => void;
  seekTo: (ms: number, exact?: boolean) => void;
  play: () => void; pause: () => void; toggle: () => void; setScrubbing: (b: boolean) => void;
}
let n = 0;
export const useTransport = create<T>((set, get) => ({
  pos: 0, total: 0, playing: false, scrubbing: false, seek: {ms: 0, exact: true, n: 0},
  setTotal: total => set(s => ({total, pos: Math.min(s.pos, total)})),
  setPos: pos => set({pos}),
  seekTo: (ms, exact = true) => {
    const t = Math.max(0, Math.min(ms, get().total));
    set({pos: t, seek: {ms: t, exact, n: ++n}});
  },
  play: () => {
    const s = get();
    if (s.total <= 0) return;
    if (s.pos >= s.total - 50) s.seekTo(0, true);
    set({playing: true});
  },
  pause: () => set({playing: false}),
  toggle: () => (get().playing ? get().pause() : get().play()),
  setScrubbing: scrubbing => set({scrubbing}),
}));
