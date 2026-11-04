import {MainClip} from '../types';

export const clipDuration = (c: MainClip) => (c.kind === 'image' ? c.outMs - c.inMs : (c.outMs - c.inMs) / c.speed);

export function layoutMain(main: MainClip[]) {
  const starts: number[] = [];
  let t = 0;
  for (const c of main) { starts.push(t); t += clipDuration(c); }
  return {starts, total: t};
}

export function assignRow(items: {startMs: number; durationMs: number; row: number}[], startMs: number, durationMs: number) {
  for (let r = 0; ; r++) {
    if (!items.some(i => i.row === r && i.startMs < startMs + durationMs && startMs < i.startMs + i.durationMs)) return r;
  }
}
