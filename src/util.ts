export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const p2 = (n: number) => (n < 10 ? '0' + n : '' + n);
export function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${p2(Math.floor(s / 60))}:${p2(Math.floor(s % 60))}.${Math.floor((s * 10) % 10)}`;
}
export function fmtShort(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1000);
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}
