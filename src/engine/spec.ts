import {Project, MainClip} from '../types';
import {buildFx} from './color';
import {clipDuration, layoutMain} from './layout';

const fx = (c: MainClip) => ({
  ...buildFx(c.adjust, c.filterId, c.filterIntensity),
  rotation: c.rotation, flipX: c.flipH, flipY: c.flipV, zoom: c.zoom,
});

export function previewTimeline(p: Project) {
  const {starts} = layoutMain(p.main);
  return p.main.map((c, i) => ({
    uri: c.uri, kind: c.kind, startMs: Math.round(starts[i]), durationMs: Math.round(clipDuration(c)),
    inMs: Math.round(c.inMs), outMs: Math.round(c.outMs), speed: c.speed, volume: c.volume, fx: fx(c),
  }));
}

export function previewAudio(p: Project) {
  return p.audio.map(a => ({id: a.id, uri: a.uri, startMs: Math.round(a.startMs), inMs: Math.round(a.inMs), durationMs: Math.round(a.durationMs), volume: a.volume}));
}

export interface ExportOpts { shortSide: number; fps: number; bitrate: number; codec: 'h264' | 'hevc' }

export function exportDims(ratio: number, shortSide: number) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return ratio >= 1 ? {width: even(shortSide * ratio), height: even(shortSide)} : {width: even(shortSide), height: even(shortSide / ratio)};
}

export function exportSpec(p: Project, ratio: number, o: ExportOpts) {
  const {total} = layoutMain(p.main);
  const {width, height} = exportDims(ratio, o.shortSide);
  const tf = (t: {x: number; y: number; scale: number; rotation: number; opacity: number}) => ({x: t.x, y: t.y, scale: t.scale, rotation: t.rotation, opacity: t.opacity});
  const overlays = [
    ...p.stickers.map(s => ({type: 'sticker', startMs: s.startMs, endMs: s.startMs + s.durationMs, emoji: s.emoji ?? '', uri: s.uri ?? '', size: s.size, aspect: s.aspect, ...tf(s.transform)})),
    ...p.texts.map(t => ({
      type: 'text', startMs: t.startMs, endMs: t.startMs + t.durationMs, text: t.text, size: t.style.size, color: t.style.color,
      bg: t.style.bg ?? '', strokeColor: t.style.strokeColor ?? '', strokeWidth: t.style.strokeWidth, bold: t.style.bold,
      italic: t.style.italic, align: t.style.align, font: t.style.font, shadow: t.style.shadow, ...tf(t.transform),
    })),
  ];
  return {
    width, height, fps: o.fps, bitrate: o.bitrate, codec: o.codec, totalMs: Math.round(total),
    main: previewTimeline(p).map((s, i) => ({...s, durationMs: p.main[i].kind === 'image' ? p.main[i].outMs - p.main[i].inMs : s.durationMs})),
    audio: p.audio.map(a => ({uri: a.uri, startMs: Math.round(a.startMs), inMs: Math.round(a.inMs), durationMs: Math.round(a.durationMs), volume: a.volume, row: a.row})),
    overlays,
  };
}
