import React, {useState} from 'react';
import {Text, View, StyleSheet} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import {C} from '../theme';
import {clamp} from '../util';

interface Props {
  value: number; min: number; max: number; step?: number; center?: boolean;
  onChange: (v: number) => void; onStart?: () => void; onEnd?: () => void;
  label?: string; format?: (v: number) => string;
}

/** Gesture-driven slider; onStart fires once per drag so callers can checkpoint undo history. */
export default function Slider({value, min, max, step = 1, center, onChange, onStart, onEnd, label, format}: Props) {
  const [w, setW] = useState(1);
  const f = clamp((value - min) / (max - min), 0, 1);
  const emit = (x: number) => {
    const raw = min + clamp(x / w, 0, 1) * (max - min);
    const v = Math.round(raw / step) * step;
    onChange(clamp(+v.toFixed(4), min, max));
  };
  const begin = (x: number) => { onStart?.(); emit(x); };
  const finish = () => onEnd?.();
  const pan = Gesture.Pan().minDistance(0)
    .onBegin(e => { runOnJS(begin)(e.x); })
    .onUpdate(e => { runOnJS(emit)(e.x); })
    .onFinalize(() => { runOnJS(finish)(); });
  const c0 = center ? clamp((0 - min) / (max - min), 0, 1) : 0;
  const left = Math.min(c0, f), width = Math.abs(f - c0);
  return (
    <View style={{paddingVertical: 6}}>
      {label ? (
        <View style={s.row}><Text style={s.label}>{label}</Text><Text style={s.val}>{format ? format(value) : Math.round(value)}</Text></View>
      ) : null}
      <GestureDetector gesture={pan}>
        <View style={s.hit} onLayout={e => setW(e.nativeEvent.layout.width)}>
          <View style={s.track} />
          <View style={[s.fill, {left: `${left * 100}%`, width: `${width * 100}%`}]} />
          <View style={[s.thumb, {left: `${f * 100}%`}]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  row: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2},
  label: {color: C.sub, fontSize: 12}, val: {color: C.text, fontSize: 12, fontWeight: '600'},
  hit: {height: 32, justifyContent: 'center'},
  track: {height: 3, borderRadius: 2, backgroundColor: C.card2},
  fill: {position: 'absolute', height: 3, borderRadius: 2, backgroundColor: C.accent},
  thumb: {position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', marginLeft: -9, top: 7},
});
