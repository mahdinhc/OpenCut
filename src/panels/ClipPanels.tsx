import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Sheet, {Chip} from '../ui/Sheet';
import Slider from '../ui/Slider';
import Icon from '../ui/Icon';
import {C} from '../theme';
import {useEditor, DEFAULT_ADJUST} from '../store/editor';
import {FILTERS} from '../engine/color';
import {Adjust, MainClip, Ratio, RATIO_VALUE} from '../types';
import {useUI} from '../store/ui';

function useSelectedMain(): MainClip | null {
  return useEditor(s => {
    const sel = s.selection;
    if (!s.project) return null;
    return (sel?.kind === 'main' ? s.project.main.find(c => c.id === sel.id) : null) ?? null;
  });
}

export function SpeedPanel({onClose}: {onClose: () => void}) {
  const clip = useSelectedMain();
  const upd = useEditor(s => s.updateMain);
  const cp = useEditor(s => s.checkpoint);
  if (!clip) return null;
  const disabled = clip.kind === 'image';
  return (
    <Sheet title="Speed" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
        {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8].map(v => (
          <Chip key={v} label={`${v}x`} active={clip.speed === v} onPress={() => { cp(); upd(clip.id, {speed: v}, false); }} />
        ))}
      </ScrollView>
      <Slider label="Custom" value={clip.speed} min={0.1} max={8} step={0.05} format={v => `${v.toFixed(2)}x`}
        onStart={cp} onChange={v => !disabled && upd(clip.id, {speed: v}, false)} />
      {disabled ? <Text style={s.hint}>Speed applies to video clips.</Text> : <Text style={s.hint}>Audio pitch is preserved.</Text>}
    </Sheet>
  );
}

export function VolumePanel({onClose}: {onClose: () => void}) {
  const sel = useEditor(s => s.selection);
  const clip = useSelectedMain();
  const audio = useEditor(s => (sel?.kind === 'audio' ? s.project?.audio.find(a => a.id === sel.id) : undefined));
  const updMain = useEditor(s => s.updateMain);
  const updItem = useEditor(s => s.updateItem);
  const cp = useEditor(s => s.checkpoint);
  const value = clip?.volume ?? audio?.volume;
  if (value === undefined) return null;
  const set = (v: number) => (clip ? updMain(clip.id, {volume: v}, false) : updItem('audio', audio!.id, {volume: v}, false));
  return (
    <Sheet title="Volume" onClose={onClose}>
      <Slider label="Volume" value={Math.round(value * 100)} min={0} max={200} format={v => `${v}%`} onStart={cp} onChange={v => set(v / 100)} />
      <Text style={s.hint}>Preview caps at 100%; export applies the full gain.</Text>
    </Sheet>
  );
}

export function FilterPanel({onClose}: {onClose: () => void}) {
  const clip = useSelectedMain();
  const upd = useEditor(s => s.updateMain);
  const updAll = useEditor(s => s.updateAllMain);
  const cp = useEditor(s => s.checkpoint);
  if (!clip) return null;
  return (
    <Sheet title="Filters" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
        <Tile name="Original" color="#444" active={!clip.filterId} onPress={() => upd(clip.id, {filterId: null})} />
        {FILTERS.map(f => <Tile key={f.id} name={f.name} color={f.swatch} active={clip.filterId === f.id} onPress={() => upd(clip.id, {filterId: f.id})} />)}
      </ScrollView>
      {clip.filterId ? <Slider label="Intensity" value={Math.round(clip.filterIntensity * 100)} min={0} max={100} onStart={cp} onChange={v => upd(clip.id, {filterIntensity: v / 100}, false)} /> : null}
      <Pressable style={s.apply} onPress={() => updAll({filterId: clip.filterId, filterIntensity: clip.filterIntensity})}>
        <Icon name="layers-outline" size={16} /><Text style={s.applyT}>Apply to all clips</Text>
      </Pressable>
    </Sheet>
  );
}

const ADJ: {k: keyof Adjust; label: string}[] = [
  {k: 'brightness', label: 'Brightness'}, {k: 'contrast', label: 'Contrast'}, {k: 'saturation', label: 'Saturation'},
  {k: 'exposure', label: 'Exposure'}, {k: 'warmth', label: 'Warmth'}, {k: 'tint', label: 'Tint'},
];
export function AdjustPanel({onClose}: {onClose: () => void}) {
  const clip = useSelectedMain();
  const upd = useEditor(s => s.updateMain);
  const updAll = useEditor(s => s.updateAllMain);
  const cp = useEditor(s => s.checkpoint);
  const [k, setK] = useState<keyof Adjust>('brightness');
  if (!clip) return null;
  return (
    <Sheet title="Adjust" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
        {ADJ.map(a => <Chip key={a.k} label={a.label} active={k === a.k} onPress={() => setK(a.k)} />)}
      </ScrollView>
      <Slider center value={clip.adjust[k]} min={-100} max={100} onStart={cp} onChange={v => upd(clip.id, {adjust: {...clip.adjust, [k]: v}}, false)} />
      <View style={{flexDirection: 'row'}}>
        <Pressable style={s.apply} onPress={() => { cp(); upd(clip.id, {adjust: {...DEFAULT_ADJUST}}, false); }}><Text style={s.applyT}>Reset</Text></Pressable>
        <Pressable style={[s.apply, {marginLeft: 8}]} onPress={() => updAll({adjust: clip.adjust})}><Icon name="layers-outline" size={16} /><Text style={s.applyT}>Apply to all</Text></Pressable>
      </View>
    </Sheet>
  );
}

export function ZoomPanel({onClose}: {onClose: () => void}) {
  const clip = useSelectedMain();
  const upd = useEditor(s => s.updateMain);
  const cp = useEditor(s => s.checkpoint);
  if (!clip) return null;
  return (
    <Sheet title="Scale / crop" onClose={onClose}>
      <Slider label="Zoom" value={clip.zoom} min={1} max={4} step={0.05} format={v => `${v.toFixed(2)}x`} onStart={cp} onChange={v => upd(clip.id, {zoom: v}, false)} />
      <Text style={s.hint}>Zooms into the centre of the frame and crops the overflow.</Text>
    </Sheet>
  );
}

export function CanvasPanel({onClose}: {onClose: () => void}) {
  const ratio = useEditor(s => s.project?.ratio);
  const set = useEditor(s => s.setRatio);
  return (
    <Sheet title="Canvas" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(Object.keys(RATIO_VALUE) as Ratio[]).map(r => {
          const v = RATIO_VALUE[r];
          const w = v >= 1 ? 40 : 40 * v, h = v >= 1 ? 40 / v : 40;
          return (
            <Pressable key={r} onPress={() => set(r)} style={[s.ratio, ratio === r && {borderColor: C.accent}]}>
              <View style={{width: w, height: h, borderWidth: 1.5, borderColor: ratio === r ? C.accent : C.sub, borderRadius: 3}} />
              <Text style={[s.ratioT, ratio === r && {color: C.accent}]}>{r}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={s.hint}>Clips that don't match are fitted with black bars.</Text>
    </Sheet>
  );
}

export function OpacityPanel({onClose}: {onClose: () => void}) {
  const sel = useEditor(s => s.selection);
  const item = useEditor(s => (sel && sel.kind !== 'main' && sel.kind !== 'audio' ? (sel.kind === 'text' ? s.project?.texts : s.project?.stickers)?.find(i => i.id === sel.id) : undefined));
  const upd = useEditor(s => s.updateItem);
  const cp = useEditor(s => s.checkpoint);
  if (!item || !sel) return null;
  return (
    <Sheet title="Opacity" onClose={onClose}>
      <Slider label="Opacity" value={Math.round(item.transform.opacity * 100)} min={0} max={100} format={v => `${v}%`}
        onStart={cp} onChange={v => upd(sel.kind as any, item.id, {transform: {...item.transform, opacity: v / 100}}, false)} />
    </Sheet>
  );
}

function Tile({name, color, active, onPress}: {name: string; color: string; active: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={{marginRight: 10, alignItems: 'center'}}>
      <View style={[s.tile, {backgroundColor: color}, active && {borderColor: C.accent, borderWidth: 2}]} />
      <Text style={[s.tileT, active && {color: C.accent}]}>{name}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hint: {color: C.sub, fontSize: 11, marginVertical: 6},
  apply: {flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderRadius: 16, paddingHorizontal: 12, height: 32, alignSelf: 'flex-start', marginTop: 4},
  applyT: {color: C.text, fontSize: 12, marginLeft: 4},
  ratio: {width: 64, height: 76, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: C.card},
  ratioT: {color: C.sub, fontSize: 11, marginTop: 6},
  tile: {width: 62, height: 62, borderRadius: 8},
  tileT: {color: C.sub, fontSize: 11, marginTop: 4},
});
