import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import Icon from '../ui/Icon';
import {C} from '../theme';

export interface Tool { id: string; icon: string; label: string; danger?: boolean; disabled?: boolean }

export default function Toolbar({tools, onPress}: {tools: Tool[]; onPress: (id: string) => void}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.root} contentContainerStyle={s.content}>
      {tools.map(t => (
        <Pressable key={t.id} onPress={() => !t.disabled && onPress(t.id)} style={[s.tool, t.disabled && {opacity: 0.35}]}>
          <Icon name={t.icon} size={24} color={t.danger ? C.danger : C.text} />
          <Text style={[s.label, t.danger && {color: C.danger}]} numberOfLines={1}>{t.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: {backgroundColor: C.bg, maxHeight: 66, flexGrow: 0},
  content: {paddingHorizontal: 6},
  tool: {width: 66, height: 62, alignItems: 'center', justifyContent: 'center'},
  label: {color: C.sub, fontSize: 10.5, marginTop: 4},
});
