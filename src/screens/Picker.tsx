import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, Image, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import {Chip} from '../ui/Sheet';
import {C} from '../theme';
import {Engine, GalleryItem} from '../native/engine';
import {useUI} from '../store/ui';
import {newProject, useEditor} from '../store/editor';
import {useTransport} from '../store/transport';
import {Asset} from '../types';
import {fmtShort} from '../util';

const COLS = 4, PAGE = 120;

async function requestAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const P = PermissionsAndroid.PERMISSIONS;
  const perms = Number(Platform.Version) >= 33 ? [P.READ_MEDIA_VIDEO, P.READ_MEDIA_IMAGES] : [P.READ_EXTERNAL_STORAGE];
  const r = await PermissionsAndroid.requestMultiple(perms as any);
  return Object.values(r).some(v => v === 'granted');
}

const Cell = memo(function Cell({item, order, size, onPress}: {item: GalleryItem; order: number; size: number; onPress: (i: GalleryItem) => void}) {
  const [thumb, setThumb] = useState<string | undefined>(item.kind === 'image' ? item.uri : undefined);
  useEffect(() => {
    if (item.kind !== 'video') return;
    let on = true;
    Engine.getFrames(item.uri, 'video', [0], 256, 256).then(p => on && setThumb(p[0])).catch(() => {});
    return () => { on = false; };
  }, [item.uri, item.kind]);
  return (
    <Pressable onPress={() => onPress(item)} style={{width: size, height: size, padding: 1}}>
      <Image source={thumb ? {uri: thumb} : undefined} style={{flex: 1, backgroundColor: C.card}} resizeMode="cover" />
      {item.kind === 'video' ? <Text style={s.dur}>{fmtShort(item.durationMs)}</Text> : null}
      <View style={[s.dot, order > 0 && {backgroundColor: C.accent, borderColor: C.accent}]}>{order > 0 ? <Text style={s.dotT}>{order}</Text> : null}</View>
    </Pressable>
  );
});

export default function Picker() {
  const insets = useSafeAreaInsets();
  const purpose = useUI(st => st.picker)!;
  const setPicker = useUI(st => st.setPicker);
  const [tab, setTab] = useState<'all' | 'video' | 'image'>(purpose === 'overlay' ? 'image' : 'all');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [sel, setSel] = useState<GalleryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(90);
  const loading = useRef(false), done = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (loading.current || (done.current && !reset)) return;
    loading.current = true;
    try {
      const offset = reset ? 0 : items.length;
      const page = await Engine.getGallery(tab, offset, PAGE);
      done.current = page.length < PAGE;
      setItems(prev => (reset ? page : [...prev, ...page]));
    } finally { loading.current = false; }
  }, [tab, items.length]);

  useEffect(() => { requestAccess().then(setGranted); }, []);
  useEffect(() => { if (granted) { done.current = false; load(true); } }, [granted, tab]);

  const toggle = useCallback((it: GalleryItem) => {
    setSel(cur => {
      if (purpose === 'overlay') return [it];
      return cur.some(x => x.id === it.id) ? cur.filter(x => x.id !== it.id) : [...cur, it];
    });
  }, [purpose]);

  const confirm = async () => {
    if (!sel.length) return;
    setBusy(true);
    try {
      const assets: Asset[] = [];
      for (const g of sel) {
        let dur = g.durationMs, w = g.width, h = g.height, hasAudio = g.kind === 'video';
        if (g.kind === 'video' && (!dur || !w)) {
          const p = await Engine.probe(g.uri); dur = p.durationMs; w = p.width; h = p.height; hasAudio = p.hasAudio;
        }
        assets.push({id: g.id, uri: g.uri, kind: g.kind, name: g.name, durationMs: dur, width: w, height: h, hasAudio});
      }
      const ed = useEditor.getState();
      if (purpose === 'new') {
        useTransport.setState({pos: 0, playing: false});
        ed.open(newProject(assets));
        useUI.getState().setRoute('editor');
      } else if (purpose === 'main') {
        ed.addAssets(assets);
      } else {
        const a = assets[0];
        ed.addSticker(useTransport.getState().pos, {uri: a.uri, aspect: a.width > 0 && a.height > 0 ? a.width / a.height : 1});
      }
      setPicker(null);
    } finally { setBusy(false); }
  };

  return (
    <View style={[s.root, {paddingTop: insets.top, paddingBottom: insets.bottom}]} onLayout={e => setSize(Math.floor(e.nativeEvent.layout.width / COLS))}>
      <View style={s.head}>
        <Pressable onPress={() => setPicker(null)} hitSlop={10}><Icon name="close" size={26} /></Pressable>
        <Text style={s.title}>{purpose === 'overlay' ? 'Add overlay image' : 'Add media'}</Text>
        <View style={{width: 26}} />
      </View>
      {purpose !== 'overlay' ? (
        <View style={{flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 8}}>
          <Chip label="All" active={tab === 'all'} onPress={() => setTab('all')} />
          <Chip label="Video" active={tab === 'video'} onPress={() => setTab('video')} />
          <Chip label="Photo" active={tab === 'image'} onPress={() => setTab('image')} />
        </View>
      ) : null}
      {granted === false ? (
        <View style={s.center}>
          <Text style={{color: C.sub, marginBottom: 12}}>OpenCut needs access to your photos and videos.</Text>
          <Pressable style={s.grant} onPress={() => requestAccess().then(setGranted)}><Text style={{color: '#000', fontWeight: '700'}}>Allow access</Text></Pressable>
        </View>
      ) : granted === null ? <View style={s.center}><ActivityIndicator color={C.accent} /></View> : (
        <FlatList
          data={items} numColumns={COLS} keyExtractor={i => i.id + i.kind}
          initialNumToRender={24} windowSize={7} maxToRenderPerBatch={16} removeClippedSubviews
          onEndReached={() => load(false)} onEndReachedThreshold={0.6}
          getItemLayout={(_, i) => ({length: size, offset: size * Math.floor(i / COLS), index: i})}
          extraData={sel}
          renderItem={({item}) => <Cell item={item} size={size} order={sel.findIndex(x => x.id === item.id) + 1} onPress={toggle} />}
        />
      )}
      <View style={s.foot}>
        <Text style={{color: C.sub, flex: 1}}>{sel.length ? `${sel.length} selected` : 'Select media'}</Text>
        <Pressable disabled={!sel.length || busy} onPress={confirm} style={[s.add, (!sel.length || busy) && {opacity: 0.4}]}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.addT}>{purpose === 'new' ? 'Create' : 'Add'}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: C.bg, zIndex: 50},
  head: {height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14},
  title: {color: C.text, fontSize: 16, fontWeight: '700'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  grant: {paddingHorizontal: 24, height: 42, borderRadius: 21, backgroundColor: C.accent, justifyContent: 'center'},
  dur: {position: 'absolute', left: 6, bottom: 5, color: '#fff', fontSize: 10.5, textShadowColor: '#000', textShadowRadius: 3},
  dot: {position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,.25)', alignItems: 'center', justifyContent: 'center'},
  dotT: {color: '#000', fontSize: 12, fontWeight: '700'},
  foot: {height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: C.panel},
  add: {minWidth: 96, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20},
  addT: {color: '#000', fontWeight: '700'},
});
