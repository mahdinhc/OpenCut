import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from './Icon';
import {C} from '../theme';

/** CapCut-style bottom panel: title + confirm check. */
export default function Sheet({title, onClose, children, height}: {title: string; onClose: () => void; children: React.ReactNode; height?: number}) {
  return (
    <View style={[s.root, height ? {height} : null]}>
      <View style={s.body}>{children}</View>
      <View style={s.bar}>
        <Text style={s.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={12}><Icon name="check" size={24} color={C.accent} /></Pressable>
      </View>
    </View>
  );
}

export function Chip({label, active, onPress, color}: {label: string; active?: boolean; onPress: () => void; color?: string}) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && {backgroundColor: color ?? C.accent}]}>
      <Text style={[s.chipT, active && {color: '#000', fontWeight: '700'}]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: {backgroundColor: C.panel, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line},
  body: {paddingHorizontal: 14, paddingTop: 10},
  bar: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line},
  title: {color: C.text, fontSize: 14, fontWeight: '600'},
  chip: {paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', marginRight: 8},
  chipT: {color: C.text, fontSize: 13},
});
