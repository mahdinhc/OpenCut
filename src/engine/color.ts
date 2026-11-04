import {Adjust} from '../types';
import {clamp} from '../util';

type M3 = number[]; // row-major 3x3
const I: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (a: M3, b: M3): M3 => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
const lerp = (a: M3, b: M3, t: number): M3 => a.map((v, i) => v + (b[i] - v) * t);
const LW = [0.2126, 0.7152, 0.0722];
const sat = (s: number): M3 => {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push((1 - s) * LW[j] + (i === j ? s : 0));
  return r;
};
const diag = (r: number, g: number, b: number): M3 => [r, 0, 0, 0, g, 0, 0, 0, b];

export const FILTERS: {id: string; name: string; swatch: string; m: M3}[] = [
  {id: 'vivid', name: 'Vivid', swatch: '#FF5E3A', m: sat(1.45)},
  {id: 'mono', name: 'Mono', swatch: '#8E8E93', m: sat(0)},
  {id: 'noir', name: 'Noir', swatch: '#2C2C2E', m: mul(diag(0.85, 0.85, 0.85), sat(0))},
  {id: 'sepia', name: 'Sepia', swatch: '#A67B5B', m: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131]},
  {id: 'warm', name: 'Warm', swatch: '#FFB347', m: diag(1.12, 1.02, 0.86)},
  {id: 'cool', name: 'Cool', swatch: '#5AC8FA', m: diag(0.88, 1.0, 1.14)},
  {id: 'fade', name: 'Fade', swatch: '#C7B8A9', m: mul(diag(1.06, 1.06, 1.06), sat(0.65))},
  {id: 'vintage', name: 'Vintage', swatch: '#B08968', m: [0.9, 0.15, 0.05, 0.1, 0.85, 0.05, 0.05, 0.15, 0.7]},
  {id: 'cine', name: 'Cinema', swatch: '#1F6F78', m: [1.12, -0.04, -0.02, -0.03, 1.0, 0.06, -0.06, 0.08, 1.12]},
  {id: 'cyber', name: 'Cyber', swatch: '#BF5AF2', m: [0.9, 0, 0.2, 0, 1.0, 0.1, 0.2, 0.1, 1.1]},
  {id: 'dream', name: 'Dream', swatch: '#FFD6E8', m: [1.05, 0.05, 0, 0.02, 1.05, 0.03, 0.03, 0.05, 1.1]},
  {id: 'matte', name: 'Matte', swatch: '#8D99AE', m: mul(diag(1.05, 1.05, 1.08), sat(0.8))},
];

export interface FxSpec { brightness: number; contrast: number; matrix: number[] | null }

/** Brightness/contrast map to Media3 effects; everything linear folds into one 4x4 matrix. */
export function buildFx(a: Adjust, filterId: string | null, intensity: number): FxSpec {
  let m: M3 = I;
  const f = FILTERS.find(x => x.id === filterId);
  if (f) m = lerp(I, f.m, clamp(intensity, 0, 1));
  m = mul(m, sat(1 + a.saturation / 100));
  const k = Math.pow(2, a.exposure / 100);
  m = mul(diag(k, k, k), m);
  const w = a.warmth / 100 * 0.25;
  m = mul(diag(1 + w, 1, 1 - w), m);
  const t = a.tint / 100 * 0.2;
  m = mul(diag(1, 1 - t, 1), m);
  const identity = m.every((v, i) => Math.abs(v - I[i]) < 1e-4);
  let out: number[] | null = null;
  if (!identity) {
    out = new Array(16).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[j * 4 + i] = m[i * 3 + j]; // column-major
    out[15] = 1;
  }
  return {brightness: clamp(a.brightness / 100 * 0.5, -1, 1), contrast: clamp(a.contrast / 100, -1, 1), matrix: out};
}
