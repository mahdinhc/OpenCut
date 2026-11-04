import React, {memo, useEffect, useMemo, useRef, useState} from 'react';
import {Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {PreviewView} from '../native/engine';
import {useEditor} from '../store/editor';
import {useTransport} from '../store/transport';
import {useUI} from '../store/ui';
import {previewAudio, previewTimeline} from '../engine/spec';
import {RATIO_VALUE, StickerItem, TextItem, Transform} from '../types';
import TextBody from './TextBody';

type Item = TextItem | StickerItem;

const OverlayItemView = memo(function OverlayItemView({item, cw, ch, selected}: {item: Item; cw: number; ch: number; selected: boolean}) {
  const select = useEditor(s => s.select);
  const update = useEditor(s => s.updateItem);
  const checkpoint = useEditor(s => s.checkpoint);
  const t = item.transform;
  const x = useSharedValue(t.x), y = useSharedValue(t.y), sc = useSharedValue(t.scale), rot = useSharedValue(t.rotation);
  const bx = useSharedValue(0), by = useSharedValue(0), bs = useSharedValue(1), br = useSharedValue(0);
  const [size, setSize] = useState({w: 0, h: 0});
  useEffect(() => { x.value = t.x; y.value = t.y; sc.value = t.scale; rot.value = t.rotation; }, [t.x, t.y, t.scale, t.rotation]);

  const commit = (nx: number, ny: number, ns: number, nr: number) => {
    const patch: Transform = {...t, x: nx, y: ny, scale: ns, rotation: nr};
    update(item.kind, item.id, {transform: patch}, false);
  };
  const begin = () => { select({kind: item.kind, id: item.id}); checkpoint(); };

  const pan = Gesture.Pan().minDistance(2)
    .onBegin(() => { bx.value = x.value; by.value = y.value; runOnJS(begin)(); })
    .onUpdate(e => { x.value = bx.value + e.translationX / cw; y.value = by.value + e.translationY / ch; })
    .onEnd(() => runOnJS(commit)(x.value, y.value, sc.value, rot.value));
  const pinch = Gesture.Pinch()
    .onBegin(() => { bs.value = sc.value; })
    .onUpdate(e => { sc.value = Math.max(0.1, Math.min(8, bs.value * e.scale)); })
    .onEnd(() => runOnJS(commit)(x.value, y.value, sc.value, rot.value));
  const rotate = Gesture.Rotation()
    .onBegin(() => { br.value = rot.value; })
    .onUpdate(e => { rot.value = br.value + (e.rotation * 180) / Math.PI; })
    .onEnd(() => runOnJS(commit)(x.value, y.value, sc.value, rot.value));
  const tap = Gesture.Tap().onEnd(() => runOnJS(select)({kind: item.kind, id: item.id}));
  const g = Gesture.Simultaneous(pan, pinch, rotate, tap);

  const style = useAnimatedStyle(() => ({
    transform: [
      {translateX: x.value * cw - size.w / 2}, {translateY: y.value * ch - size.h / 2},
      {rotate: `${rot.value}deg`}, {scale: sc.value},
    ],
    opacity: t.opacity,
  }));
  const onLayout = (e: LayoutChangeEvent) => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height});

  return (
    <GestureDetector gesture={g}>
      <Animated.View onLayout={onLayout} style={[{position: 'absolute', left: 0, top: 0}, style]}>
        {item.kind === 'text' ? (
          <TextBody text={item.text} style={item.style} canvasW={cw} />
        ) : item.emoji ? (
          <Text style={{fontSize: item.size * cw}}>{item.emoji}</Text>
        ) : (
          <Image source={{uri: item.uri}} style={{width: item.size * cw, height: (item.size * cw) / item.aspect}} resizeMode="contain" />
        )}
        {selected ? <View pointerEvents="none" style={s.frame} /> : null}
      </Animated.View>
    </GestureDetector>
  );
});

function OverlayLayer({cw, ch}: {cw: number; ch: number}) {
  const project = useEditor(s => s.project)!;
  const selection = useEditor(s => s.selection);
  const key = useTransport(st => {
    const t = st.pos;
    return [...project.stickers, ...project.texts].filter(i => t >= i.startMs && t < i.startMs + i.durationMs).map(i => i.id).join(',');
  });
  const items = useMemo(
    () => [...project.stickers, ...project.texts].filter(i => key.split(',').includes(i.id)),
    [key, project.stickers, project.texts],
  );
  return (
    <>
      {items.map(i => <OverlayItemView key={i.id} item={i} cw={cw} ch={ch} selected={selection?.id === i.id} />)}
    </>
  );
}

export default function Preview() {
  const project = useEditor(s => s.project)!;
  const select = useEditor(s => s.select);
  const playing = useTransport(s => s.playing);
  const seek = useTransport(s => s.seek);
  const [box, setBox] = useState({w: 0, h: 0});
  const ratio = RATIO_VALUE[project.ratio];
  let cw = box.w, ch = box.w / ratio;
  if (ch > box.h) { ch = box.h; cw = ch * ratio; }
  const timeline = useMemo(() => JSON.stringify(previewTimeline(project)), [project.main]);
  const audio = useMemo(() => JSON.stringify(previewAudio(project)), [project.audio]);
  const busy = useUI(s => s.busy);
  const frozen = useRef({timeline, audio});
  if (!busy) frozen.current = {timeline, audio};   // while trimming/dragging the native player keeps the last stable playlist

  return (
    <View style={s.area} onLayout={e => setBox({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
      {cw > 0 ? (
        <View style={{width: cw, height: ch, backgroundColor: '#000', overflow: 'hidden'}}>
          <PreviewView
            style={StyleSheet.absoluteFill}
            ratio={ratio} timeline={frozen.current.timeline} audio={frozen.current.audio} playing={playing} seek={seek}
            onProgress={e => { const t = useTransport.getState(); if (t.playing && !t.scrubbing) t.setPos(e.nativeEvent.ms); }}
            onEnded={() => { const t = useTransport.getState(); t.pause(); t.setPos(t.total); }}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => select(null)} />
          <OverlayLayer cw={cw} ch={ch} />
          {project.main.length === 0 ? <Text style={s.empty}>Add media to start</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  area: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505'},
  frame: {...StyleSheet.absoluteFillObject, borderWidth: 1.5, borderColor: '#fff', borderRadius: 4, margin: -4},
  empty: {position: 'absolute', alignSelf: 'center', top: '48%', color: '#777'},
});
