import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import Sheet, {Chip} from '../ui/Sheet';
import Slider from '../ui/Slider';
import Icon from '../ui/Icon';
import {C} from '../theme';
import {useEditor} from '../store/editor';
import {TextStyle} from '../types';

const COLORS = ['#FFFFFF', '#000000', '#FF453A', '#FF9F0A', '#FFD60A', '#32D74B', '#25F4EE', '#0A84FF', '#BF5AF2', '#FF2D55', '#8E8E93', '#FFD6E8'];
const PRESETS: {name: string; style: Partial<TextStyle>}[] = [
  {name: 'Basic', style: {}},
  {name: 'Subtitle', style: {bg: '#000000AA', bold: false, shadow: false, size: 0.05}},
  {name: 'Impact', style: {color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.12, size: 0.1}},
  {name: 'Neon', style: {color: '#25F4EE', strokeColor: '#FE2C55', strokeWidth: 0.06, size: 0.09}},
  {name: 'Label', style: {color: '#000000', bg: '#FFD60A', size: 0.06, shadow: false}},
  {name: 'Serif', style: {font: 'serif', italic: true, bold: false, size: 0.08}},
  {name: 'Mono', style: {font: 'mono', color: '#32D74B', bg: '#000000CC', size: 0.05, shadow: false}},
  {name: 'Retro', style: {font: 'condensed', color: '#FFD60A', strokeColor: '#FF453A', strokeWidth: 0.1, size: 0.11}},
];
const TABS = ['Text', 'Presets', 'Font', 'Color', 'Outline', 'Background', 'Format'] as const;

export default function TextPanel({onClose}: {onClose: () => void}) {
  const sel = useEditor(s => s.selection);
  const item = useEditor(s => (sel?.kind === 'text' ? s.project?.texts.find(t => t.id === sel.id) : undefined));
  const upd = useEditor(s => s.updateItem);
  const cp = useEditor(s => s.checkpoint);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Text');
  if (!item) return null;
  const st = item.style;
  const setStyle = (p: Partial<TextStyle>, history = true) => upd('text', item.id, {style: {...st, ...p}}, history);

  const swatches = (cur: string | null, on: (c: string | null) => void, none?: boolean) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical: 6}}>
      {none ? <Pressable onPress={() => on(null)} style={[s.sw, {backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center'}, cur === null && s.swOn]}><Icon name="cancel" size={18} color={C.sub} /></Pressable> : null}
      {COLORS.map(c => <Pressable key={c} onPress={() => on(c)} style={[s.sw, {backgroundColor: c}, cur === c && s.swOn]} />)}
    </ScrollView>
  );

  return (
    <Sheet title="Text" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
        {TABS.map(t => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />)}
      </ScrollView>
      <View style={{minHeight: 96}}>
        {tab === 'Text' ? (
          <TextInput value={item.text} multiline autoFocus onFocus={cp} onChangeText={t => upd('text', item.id, {text: t}, false)}
            placeholder="Enter text" placeholderTextColor={C.sub} style={s.input} />
        ) : null}
        {tab === 'Presets' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {PRESETS.map(p => (
              <Pressable key={p.name} onPress={() => setStyle({...p.style})} style={s.preset}><Text style={{color: C.text, fontSize: 13}}>{p.name}</Text></Pressable>
            ))}
          </ScrollView>
        ) : null}
        {tab === 'Font' ? (
          <View>
            <View style={{flexDirection: 'row'}}>
              {(['sans', 'serif', 'mono', 'condensed'] as const).map(f => <Chip key={f} label={f} active={st.font === f} onPress={() => setStyle({font: f})} />)}
            </View>
            <Slider label="Size" value={Math.round(st.size * 1000)} min={20} max={200} onStart={cp} onChange={v => setStyle({size: v / 1000}, false)} />
          </View>
        ) : null}
        {tab === 'Color' ? swatches(st.color, c => setStyle({color: c ?? '#FFFFFF'})) : null}
        {tab === 'Outline' ? (
          <View>
            {swatches(st.strokeColor, c => setStyle({strokeColor: c, strokeWidth: c ? st.strokeWidth || 0.08 : 0}), true)}
            <Slider label="Width" value={Math.round(st.strokeWidth * 100)} min={0} max={25} onStart={cp} onChange={v => setStyle({strokeWidth: v / 100, strokeColor: st.strokeColor ?? '#000000'}, false)} />
          </View>
        ) : null}
        {tab === 'Background' ? swatches(st.bg, c => setStyle({bg: c}), true) : null}
        {tab === 'Format' ? (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Toggle icon="format-bold" on={st.bold} onPress={() => setStyle({bold: !st.bold})} />
            <Toggle icon="format-italic" on={st.italic} onPress={() => setStyle({italic: !st.italic})} />
            <Toggle icon="format-align-left" on={st.align === 'left'} onPress={() => setStyle({align: 'left'})} />
            <Toggle icon="format-align-center" on={st.align === 'center'} onPress={() => setStyle({align: 'center'})} />
            <Toggle icon="format-align-right" on={st.align === 'right'} onPress={() => setStyle({align: 'right'})} />
            <Toggle icon="box-shadow" on={st.shadow} onPress={() => setStyle({shadow: !st.shadow})} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function Toggle({icon, on, onPress}: {icon: string; on: boolean; onPress: () => void}) {
  return <Pressable onPress={onPress} style={[s.tg, on && {backgroundColor: C.accent}]}><Icon name={icon} size={20} color={on ? '#000' : C.text} /></Pressable>;
}

const s = StyleSheet.create({
  input: {color: C.text, fontSize: 16, backgroundColor: C.card, borderRadius: 10, padding: 10, minHeight: 80, textAlignVertical: 'top'},
  sw: {width: 34, height: 34, borderRadius: 17, marginRight: 10, borderWidth: 1, borderColor: C.line},
  swOn: {borderWidth: 3, borderColor: C.accent},
  preset: {paddingHorizontal: 16, height: 56, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginRight: 8},
  tg: {width: 42, height: 38, borderRadius: 8, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', marginRight: 8},
});
