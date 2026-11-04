import React, {useEffect, useMemo} from 'react';
import {BackHandler, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import {C} from '../theme';
import Preview from '../components/Preview';
import Timeline from '../components/Timeline';
import Toolbar, {Tool} from '../components/Toolbar';
import {useEditor} from '../store/editor';
import {useTransport} from '../store/transport';
import {PanelName, useUI} from '../store/ui';
import {saveProject} from '../store/storage';
import {layoutMain} from '../engine/layout';
import {Engine} from '../native/engine';
import {fmt} from '../util';
import {AdjustPanel, CanvasPanel, FilterPanel, OpacityPanel, SpeedPanel, VolumePanel, ZoomPanel} from '../panels/ClipPanels';
import TextPanel from '../panels/TextPanel';
import StickerPanel from '../panels/StickerPanel';
import ExportPanel from '../panels/ExportPanel';

const ROOT: Tool[] = [
  {id: 'edit', icon: 'content-cut', label: 'Edit'}, {id: 'audio', icon: 'music-note-plus', label: 'Audio'},
  {id: 'text', icon: 'format-text', label: 'Text'}, {id: 'sticker', icon: 'sticker-emoji', label: 'Sticker'},
  {id: 'overlay', icon: 'image-plus', label: 'Overlay'}, {id: 'filter', icon: 'palette-swatch-variant', label: 'Filters'},
  {id: 'adjust', icon: 'tune-variant', label: 'Adjust'}, {id: 'canvas', icon: 'aspect-ratio', label: 'Canvas'},
];
const MAIN_TOOLS: Tool[] = [
  {id: 'split', icon: 'content-cut', label: 'Split'}, {id: 'speed', icon: 'speedometer', label: 'Speed'},
  {id: 'volume', icon: 'volume-high', label: 'Volume'}, {id: 'filter', icon: 'palette-swatch-variant', label: 'Filters'},
  {id: 'adjust', icon: 'tune-variant', label: 'Adjust'}, {id: 'rotate', icon: 'rotate-right', label: 'Rotate'},
  {id: 'mirror', icon: 'flip-horizontal', label: 'Mirror'}, {id: 'flipv', icon: 'flip-vertical', label: 'Flip'},
  {id: 'zoom', icon: 'crop', label: 'Crop'}, {id: 'dup', icon: 'content-copy', label: 'Duplicate'},
  {id: 'del', icon: 'delete-outline', label: 'Delete', danger: true},
];
const TEXT_TOOLS: Tool[] = [
  {id: 'text', icon: 'pencil', label: 'Edit'}, {id: 'opacity', icon: 'circle-opacity', label: 'Opacity'},
  {id: 'split', icon: 'content-cut', label: 'Split'}, {id: 'dup', icon: 'content-copy', label: 'Duplicate'},
  {id: 'del', icon: 'delete-outline', label: 'Delete', danger: true},
];
const STICKER_TOOLS: Tool[] = TEXT_TOOLS.slice(1);
const AUDIO_TOOLS: Tool[] = [
  {id: 'volume', icon: 'volume-high', label: 'Volume'}, {id: 'split', icon: 'content-cut', label: 'Split'},
  {id: 'dup', icon: 'content-copy', label: 'Duplicate'}, {id: 'del', icon: 'delete-outline', label: 'Delete', danger: true},
];

export default function Editor() {
  const insets = useSafeAreaInsets();
  const project = useEditor(s => s.project);
  const selection = useEditor(s => s.selection);
  const canUndo = useEditor(s => s.past.length > 0);
  const canRedo = useEditor(s => s.future.length > 0);
  const panel = useUI(s => s.panel);
  const setPanel = useUI(s => s.setPanel);
  const pos = useTransport(s => s.pos);
  const total = useTransport(s => s.total);
  const playing = useTransport(s => s.playing);

  // autosave (debounced) + project cover
  useEffect(() => {
    if (!project) return;
    const h = setTimeout(async () => {
      let cover = project.cover;
      if (!cover && project.main[0]) {
        try { cover = (await Engine.getFrames(project.main[0].uri, project.main[0].kind, [0], 320, 320))[0]; } catch {}
      }
      saveProject(cover ? {...project, cover} : project, layoutMain(project.main).total);
    }, 800);
    return () => clearTimeout(h);
  }, [project]);

  const close = () => {
    useTransport.getState().pause();
    useEditor.getState().close();
    setPanel(null);
    useUI.getState().setRoute('home');
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const ui = useUI.getState();
      if (ui.picker) { ui.setPicker(null); return true; }
      if (ui.panel) { ui.setPanel(null); return true; }
      if (useEditor.getState().selection) { useEditor.getState().select(null); return true; }
      close();
      return true;
    });
    return () => sub.remove();
  }, []);

  const tools = useMemo(() => {
    if (!selection) return ROOT;
    return selection.kind === 'main' ? MAIN_TOOLS : selection.kind === 'text' ? TEXT_TOOLS : selection.kind === 'sticker' ? STICKER_TOOLS : AUDIO_TOOLS;
  }, [selection]);

  const onTool = async (id: string) => {
    const ed = useEditor.getState();
    const t = useTransport.getState();
    const sel = ed.selection;
    const p = ed.project!;
    const mainSel = sel?.kind === 'main' ? p.main.find(c => c.id === sel.id) : undefined;
    t.pause();
    switch (id) {
      case 'edit': {
        const {starts} = layoutMain(p.main);
        const i = p.main.findIndex((c, k) => t.pos >= starts[k] && t.pos < (starts[k + 1] ?? Infinity));
        const c = p.main[Math.max(0, i)];
        if (c) ed.select({kind: 'main', id: c.id});
        break;
      }
      case 'split': ed.splitAt(t.pos); break;
      case 'dup': ed.duplicateSelected(); break;
      case 'del': ed.deleteSelected(); break;
      case 'rotate': if (mainSel) ed.updateMain(mainSel.id, {rotation: (mainSel.rotation + 90) % 360}); break;
      case 'mirror': if (mainSel) ed.updateMain(mainSel.id, {flipH: !mainSel.flipH}); break;
      case 'flipv': if (mainSel) ed.updateMain(mainSel.id, {flipV: !mainSel.flipV}); break;
      case 'text':
        if (sel?.kind !== 'text') ed.addText(t.pos);
        setPanel('text'); break;
      case 'audio': {
        const a = await Engine.pickFile('audio/*');
        if (a) ed.addAudio(t.pos, {id: '', uri: a.uri, kind: 'audio', name: a.name, durationMs: a.durationMs, width: 0, height: 0, hasAudio: true});
        break;
      }
      case 'overlay': useUI.getState().setPicker('overlay'); break;
      case 'filter': case 'adjust':
        if (!mainSel) {
          const {starts} = layoutMain(p.main);
          const i = Math.max(0, p.main.findIndex((c, k) => t.pos >= starts[k] && t.pos < (starts[k + 1] ?? Infinity)));
          if (p.main[i]) ed.select({kind: 'main', id: p.main[i].id});
        }
        setPanel(id as PanelName); break;
      default: setPanel(id as PanelName);
    }
  };

  if (!project) return null;
  const closePanel = () => setPanel(null);
  const panelEl = (() => {
    switch (panel) {
      case 'speed': return <SpeedPanel onClose={closePanel} />;
      case 'volume': return <VolumePanel onClose={closePanel} />;
      case 'filter': return <FilterPanel onClose={closePanel} />;
      case 'adjust': return <AdjustPanel onClose={closePanel} />;
      case 'zoom': return <ZoomPanel onClose={closePanel} />;
      case 'canvas': return <CanvasPanel onClose={closePanel} />;
      case 'opacity': return <OpacityPanel onClose={closePanel} />;
      case 'text': return <TextPanel onClose={closePanel} />;
      case 'sticker': return <StickerPanel onClose={closePanel} />;
      case 'export': return <ExportPanel onClose={closePanel} />;
      default: return null;
    }
  })();

  return (
    <View style={[s.root, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      <View style={s.top}>
        <Pressable onPress={close} hitSlop={10} style={s.topBtn}><Icon name="chevron-left" size={28} /></Pressable>
        <Text style={s.name} numberOfLines={1}>{project.name}</Text>
        <Pressable onPress={() => { useTransport.getState().pause(); setPanel('export'); }} style={s.exportBtn}><Text style={s.exportT}>Export</Text></Pressable>
      </View>
      <Preview />
      <View style={s.transport}>
        <Text style={s.time}>{fmt(pos)}<Text style={{color: C.sub}}> / {fmt(total)}</Text></Text>
        <Pressable onPress={() => useTransport.getState().toggle()} style={s.play}><Icon name={playing ? 'pause' : 'play'} size={26} /></Pressable>
        <View style={{flexDirection: 'row'}}>
          <Pressable disabled={!canUndo} onPress={() => useEditor.getState().undo()} style={[s.topBtn, !canUndo && {opacity: 0.3}]}><Icon name="undo" size={22} /></Pressable>
          <Pressable disabled={!canRedo} onPress={() => useEditor.getState().redo()} style={[s.topBtn, !canRedo && {opacity: 0.3}]}><Icon name="redo" size={22} /></Pressable>
        </View>
      </View>
      <View style={s.timeline}><Timeline /></View>
      {panelEl ?? (
        <View>
          {selection ? (
            <Pressable onPress={() => useEditor.getState().select(null)} style={s.back}><Icon name="chevron-left" size={18} color={C.sub} /><Text style={{color: C.sub, fontSize: 12}}>Back</Text></Pressable>
          ) : null}
          <Toolbar tools={tools} onPress={onTool} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  top: {height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6},
  topBtn: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  name: {flex: 1, color: C.sub, fontSize: 13, textAlign: 'center'},
  exportBtn: {height: 32, paddingHorizontal: 16, borderRadius: 16, backgroundColor: C.accent, justifyContent: 'center', marginRight: 6},
  exportT: {color: '#000', fontWeight: '700', fontSize: 13},
  transport: {height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10},
  time: {color: C.text, fontSize: 12, width: 110, fontVariant: ['tabular-nums']},
  play: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  timeline: {height: 200, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line},
  back: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 24},
});
