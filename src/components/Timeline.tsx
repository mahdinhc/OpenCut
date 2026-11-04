import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle} from 'react-native-reanimated';
import Icon from '../ui/Icon';
import {C} from '../theme';
import {Engine} from '../native/engine';
import {useEditor} from '../store/editor';
import {useTransport} from '../store/transport';
import {useUI} from '../store/ui';
import {clipDuration, layoutMain} from '../engine/layout';
import {AudioItem, MainClip, StickerItem, TextItem} from '../types';
import {clamp, fmtShort} from '../util';

const RULER_H = 22, MAIN_H = 58, LANE_H = 30, GAP = 4, MIN_MS = 200;
type Ov = TextItem | StickerItem | AudioItem;

function useThumbs(c: MainClip, width: number) {
  const tw = ((MAIN_H - 4) * 16) / 9;
  const n = clamp(Math.ceil(width / tw), 1, 40);
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    let on = true;
    const h = setTimeout(() => {
      const dur = c.outMs - c.inMs;
      const times = Array.from({length: n}, (_, i) => (c.kind === 'image' ? 0 : Math.round((c.inMs + (dur * (i + 0.5)) / n) / 500) * 500));
      Engine.getFrames(c.uri, c.kind, times, Math.round(tw * 2), (MAIN_H - 4) * 2).then(p => on && setPaths(p)).catch(() => {});
    }, 120);
    return () => { on = false; clearTimeout(h); };
  }, [c.uri, c.kind, c.inMs, c.outMs, n]);
  return {paths, n};
}

function Handle({side, h, onBegin, onMove, onEnd}: {side: 'l' | 'r'; h: number; onBegin: () => void; onMove: (dx: number) => void; onEnd: () => void}) {
  const pan = Gesture.Pan().minDistance(1)
    .onBegin(() => runOnJS(onBegin)())
    .onUpdate(e => runOnJS(onMove)(e.translationX))
    .onFinalize(() => runOnJS(onEnd)());
  return (
    <GestureDetector gesture={pan}>
      <View style={[s.handle, {height: h}, side === 'l' ? {left: -1, borderTopLeftRadius: 6, borderBottomLeftRadius: 6} : {right: -1, borderTopRightRadius: 6, borderBottomRightRadius: 6}]}>
        <View style={s.grip} />
      </View>
    </GestureDetector>
  );
}

const MainClipView = memo(function MainClipView({clip, left, width, selected, ppm, onLock}: {clip: MainClip; left: number; width: number; selected: boolean; ppm: number; onLock: (b: boolean) => void}) {
  const select = useEditor(s => s.select);
  const setRange = useEditor(s => s.setRange);
  const checkpoint = useEditor(s => s.checkpoint);
  const moveMain = useEditor(s => s.moveMain);
  const {paths, n} = useThumbs(clip, width);
  const base = useRef({inMs: 0, outMs: 0});
  const tx = useSharedValue(0);
  const lift = useSharedValue(0);

  const beginTrim = () => { onLock(true); checkpoint(); base.current = {inMs: clip.inMs, outMs: clip.outMs}; };
  const trim = (side: 'l' | 'r') => (dx: number) => {
    const dMs = (dx / ppm) * (clip.kind === 'image' ? 1 : clip.speed);
    const b = base.current;
    const minSrc = MIN_MS * (clip.kind === 'image' ? 1 : clip.speed);
    if (side === 'l') setRange(clip.id, clamp(b.inMs + dMs, 0, b.outMs - minSrc), b.outMs);
    else setRange(clip.id, b.inMs, clamp(b.outMs + dMs, b.inMs + minSrc, clip.srcDurationMs));
  };
  const endTrim = () => onLock(false);

  const reorder = (finalX: number) => {
    const p = useEditor.getState().project; if (!p) return;
    const {starts} = layoutMain(p.main);
    const center = left + width / 2 + finalX;
    const others = p.main.filter(c => c.id !== clip.id);
    const idxOthers = p.main.map((c, i) => ({c, mid: (starts[i] + clipDuration(c) / 2) * ppm})).filter(o => o.c.id !== clip.id);
    let target = 0;
    idxOthers.forEach((o, i) => { if (o.mid < center) target = i + 1; });
    if (others.length >= 0) moveMain(clip.id, target);
  };
  const press = () => select({kind: 'main', id: clip.id});
  const drag = Gesture.Pan().activateAfterLongPress(350)
    .onStart(() => { runOnJS(onLock)(true); runOnJS(press)(); lift.value = 1; })
    .onUpdate(e => { tx.value = e.translationX; })
    .onEnd(e => { runOnJS(reorder)(e.translationX); })
    .onFinalize(() => { tx.value = 0; lift.value = 0; runOnJS(onLock)(false); });
  const tap = Gesture.Tap().onEnd(() => runOnJS(press)());
  const g = Gesture.Exclusive(drag, tap);
  const st = useAnimatedStyle(() => ({transform: [{translateX: tx.value}], zIndex: lift.value ? 10 : 0, opacity: lift.value ? 0.85 : 1}));

  return (
    <GestureDetector gesture={g}>
      <Animated.View style={[{position: 'absolute', left, width, height: MAIN_H, top: 0}, st]}>
        <View style={[s.clipBox, selected && s.sel]}>
          <View style={{flexDirection: 'row', flex: 1}}>
            {Array.from({length: n}).map((_, i) => (
              <Image key={i} source={paths[i] ? {uri: paths[i]} : undefined} style={{width: width / n, height: '100%', backgroundColor: C.main}} resizeMode="cover" />
            ))}
          </View>
          <View style={s.badge}>
            <Text style={s.badgeT}>{clip.speed !== 1 ? `${clip.speed}x ` : ''}{fmtShort(clipDuration(clip))}</Text>
          </View>
        </View>
        {selected ? (<>
          <Handle side="l" h={MAIN_H} onBegin={beginTrim} onMove={trim('l')} onEnd={endTrim} />
          <Handle side="r" h={MAIN_H} onBegin={beginTrim} onMove={trim('r')} onEnd={endTrim} />
        </>) : null}
      </Animated.View>
    </GestureDetector>
  );
});

function Wave({uri, inMs, durationMs, srcMs, width}: {uri: string; inMs: number; durationMs: number; srcMs: number; width: number}) {
  const [w, setW] = useState<number[]>([]);
  useEffect(() => { let on = true; Engine.getWaveform(uri, 240).then(x => on && setW(x)); return () => { on = false; }; }, [uri]);
  const bars = clamp(Math.floor(width / 4), 2, 160);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', height: LANE_H - 6, overflow: 'hidden'}}>
      {Array.from({length: bars}).map((_, i) => {
        const pos = (inMs + (durationMs * i) / bars) / Math.max(1, srcMs);
        const v = w.length ? w[clamp(Math.floor(pos * w.length), 0, w.length - 1)] : 0.25;
        return <View key={i} style={{width: 2, marginRight: width / bars - 2, height: 3 + v * (LANE_H - 12), backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 1}} />;
      })}
    </View>
  );
}

const OverlayBar = memo(function OverlayBar({item, top, ppm, pad, selected, onLock}: {item: Ov; top: number; ppm: number; pad: number; selected: boolean; onLock: (b: boolean) => void}) {
  const select = useEditor(s => s.select);
  const moveItem = useEditor(s => s.moveItem);
  const checkpoint = useEditor(s => s.checkpoint);
  const base = useRef({start: 0, dur: 0, inMs: 0});
  const left = pad + item.startMs * ppm, width = Math.max(14, item.durationMs * ppm);
  const color = item.kind === 'text' ? C.textClip : item.kind === 'sticker' ? C.stickerClip : C.audioClip;
  const press = () => select({kind: item.kind, id: item.id});
  const total = () => layoutMain(useEditor.getState().project?.main ?? []).total;
  const inMsOf = (i: Ov) => (i.kind === 'audio' ? i.inMs : undefined);

  const dragBase = () => { checkpoint(); base.current = {start: item.startMs, dur: item.durationMs, inMs: item.kind === 'audio' ? item.inMs : 0}; };
  const dx0 = useSharedValue(0);
  const move = (dx: number) => {
    const b = base.current;
    moveItem(item.kind, item.id, clamp(b.start + dx / ppm, 0, Math.max(0, total() - b.dur)), b.dur, inMsOf(item));
  };
  const drag = Gesture.Pan().activateAfterLongPress(250)
    .onStart(() => { runOnJS(onLock)(true); runOnJS(press)(); runOnJS(dragBase)(); })
    .onUpdate(e => { dx0.value = e.translationX; runOnJS(move)(e.translationX); })
    .onFinalize(() => runOnJS(onLock)(false));
  const tap = Gesture.Tap().onEnd(() => runOnJS(press)());

  const trim = (side: 'l' | 'r') => (dx: number) => {
    const b = base.current, dMs = dx / ppm;
    if (side === 'r') {
      const max = item.kind === 'audio' ? Math.min(item.srcDurationMs - b.inMs, total() - b.start) : total() - b.start;
      moveItem(item.kind, item.id, b.start, clamp(b.dur + dMs, MIN_MS, max), inMsOf(item));
    } else {
      const d = clamp(dMs, -b.start - (item.kind === 'audio' ? 0 : 0), b.dur - MIN_MS);
      const dd = item.kind === 'audio' ? clamp(d, -b.inMs, b.dur - MIN_MS) : d;
      moveItem(item.kind, item.id, b.start + dd, b.dur - dd, item.kind === 'audio' ? b.inMs + dd : undefined);
    }
  };

  return (
    <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
      <View style={{position: 'absolute', left, top, width, height: LANE_H}}>
        <View style={[s.ov, {backgroundColor: color}, selected && s.sel]}>
          {item.kind === 'text' ? <Text numberOfLines={1} style={s.ovT}>{item.text}</Text> : null}
          {item.kind === 'sticker' ? (item.emoji ? <Text style={s.ovT}>{item.emoji}</Text> : <Image source={{uri: item.uri}} style={{width: 20, height: 20, margin: 4}} />) : null}
          {item.kind === 'audio' ? <Wave uri={item.uri} inMs={item.inMs} durationMs={item.durationMs} srcMs={item.srcDurationMs} width={width} /> : null}
        </View>
        {selected ? (<>
          <Handle side="l" h={LANE_H} onBegin={dragBase} onMove={trim('l')} onEnd={() => onLock(false)} />
          <Handle side="r" h={LANE_H} onBegin={dragBase} onMove={trim('r')} onEnd={() => onLock(false)} />
        </>) : null}
      </View>
    </GestureDetector>
  );
});

function Ruler({total, ppm, pad}: {total: number; ppm: number; pad: number}) {
  const steps = [1000, 2000, 5000, 10000, 30000, 60000];
  const step = steps.find(x => x * ppm >= 60) ?? 60000;
  const marks = [];
  for (let t = 0; t <= total + step; t += step) marks.push(t);
  return (
    <View style={{height: RULER_H}}>
      {marks.map(t => (
        <View key={t} style={{position: 'absolute', left: pad + t * ppm, top: 0}}>
          <Text style={s.tick}>{fmtShort(t)}</Text>
          <View style={s.tickDot} />
        </View>
      ))}
    </View>
  );
}

export default function Timeline() {
  const project = useEditor(s => s.project)!;
  const selection = useEditor(s => s.selection);
  const {width} = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const [locked, setLocked] = useState(false);
  const ppm = 0.08 * zoom;
  const {starts, total} = useMemo(() => layoutMain(project.main), [project.main]);
  const pad = width / 2;
  const scroller = useRef<Animated.ScrollView>(null);
  const user = useSharedValue(false);
  const zoomSV = useSharedValue(1), zoomBase = useSharedValue(1);

  const onScrub = useCallback((x: number) => {
    const t = useTransport.getState();
    if (t.playing) t.pause();
    t.seekTo(clamp(x / ppm, 0, total), false);
  }, [ppm, total]);
  const startScrub = useCallback(() => useTransport.getState().setScrubbing(true), []);
  const endScrub = useCallback(() => {
    const t = useTransport.getState();
    t.setScrubbing(false);
    t.seekTo(t.pos, true);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => { if (user.value) runOnJS(onScrub)(e.contentOffset.x); },
    onBeginDrag: () => { user.value = true; runOnJS(startScrub)(); },
    onEndDrag: e => {
      if (Math.abs(e.velocity?.x ?? 0) < 0.05) { user.value = false; runOnJS(endScrub)(); }
    },
    onMomentumEnd: () => { user.value = false; runOnJS(endScrub)(); },
  });

  // Follow playback / programmatic seeks without re-rendering.
  useEffect(() => {
    const go = (pos: number) => scroller.current?.scrollTo({x: pos * ppm, animated: false});
    go(useTransport.getState().pos);
    return useTransport.subscribe((st, prev) => { if (st.pos !== prev.pos && !st.scrubbing) go(st.pos); });
  }, [ppm]);
  useEffect(() => { useTransport.getState().setTotal(total); }, [total]);

  const pinch = Gesture.Pinch()
    .onBegin(() => { zoomBase.value = zoomSV.value; })
    .onUpdate(e => { zoomSV.value = clamp(zoomBase.value * e.scale, 0.15, 10); runOnJS(setZoom)(zoomSV.value); });

  const rows = (items: Ov[]) => (items.length ? Math.max(...items.map(i => i.row)) + 1 : 0);
  const tRows = rows(project.texts), sRows = rows(project.stickers), aRows = rows(project.audio);
  const contentW = pad * 2 + total * ppm;
  const topLanes = tRows + sRows;
  const mainTop = RULER_H + topLanes * (LANE_H + GAP) + 4;
  const audioTop = mainTop + MAIN_H + 8;
  const height = audioTop + Math.max(aRows, 1) * (LANE_H + GAP) + 10;
  const setLock = useCallback((b: boolean) => setLocked(b), []);
  const addMedia = () => useUI.getState().setPicker('main');

  return (
    <View style={s.root}>
      <GestureDetector gesture={pinch}>
        <ScrollView style={{flex: 1}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Animated.ScrollView
            ref={scroller} horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!locked}
            onScroll={scrollHandler} scrollEventThrottle={16} decelerationRate="fast" nestedScrollEnabled
          >
            <View style={{width: contentW, height}}>
              <Ruler total={total} ppm={ppm} pad={pad} />
              {project.texts.map(i => <OverlayBar key={i.id} item={i} top={RULER_H + i.row * (LANE_H + GAP)} ppm={ppm} pad={pad} selected={selection?.id === i.id} onLock={setLock} />)}
              {project.stickers.map(i => <OverlayBar key={i.id} item={i} top={RULER_H + (tRows + i.row) * (LANE_H + GAP)} ppm={ppm} pad={pad} selected={selection?.id === i.id} onLock={setLock} />)}
              <View style={{position: 'absolute', top: mainTop, left: 0, right: 0, height: MAIN_H}}>
                {project.main.map((c, i) => (
                  <MainClipView key={c.id} clip={c} left={pad + starts[i] * ppm} width={Math.max(24, clipDuration(c) * ppm)} selected={selection?.id === c.id} ppm={ppm} onLock={setLock} />
                ))}
                <Pressable onPress={addMedia} style={[s.add, {left: pad + total * ppm + 8}]}><Icon name="plus" size={20} color="#000" /></Pressable>
              </View>
              {project.audio.map(i => <OverlayBar key={i.id} item={i} top={audioTop + i.row * (LANE_H + GAP)} ppm={ppm} pad={pad} selected={selection?.id === i.id} onLock={setLock} />)}
            </View>
          </Animated.ScrollView>
        </ScrollView>
      </GestureDetector>
      <View pointerEvents="none" style={s.playhead}><View style={s.phDot} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  clipBox: {flex: 1, borderRadius: 6, overflow: 'hidden', marginHorizontal: 1, backgroundColor: C.main},
  sel: {borderWidth: 2, borderColor: '#fff'},
  badge: {position: 'absolute', left: 6, bottom: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 4},
  badgeT: {color: '#fff', fontSize: 9.5},
  handle: {position: 'absolute', top: 0, width: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'},
  grip: {width: 2, height: 14, backgroundColor: '#555', borderRadius: 1},
  ov: {flex: 1, borderRadius: 5, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 6},
  ovT: {color: '#fff', fontSize: 12},
  add: {position: 'absolute', top: 11, width: 36, height: 36, borderRadius: 6, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'},
  tick: {color: C.sub, fontSize: 9, marginLeft: -10},
  tickDot: {width: 2, height: 2, borderRadius: 1, backgroundColor: C.sub, marginTop: 1, marginLeft: -1},
  playhead: {position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1, backgroundColor: '#fff'},
  phDot: {position: 'absolute', top: -2, left: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff'},
});
