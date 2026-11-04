import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from '../ui/Icon';
import {Chip} from '../ui/Sheet';
import {C} from '../theme';
import {Engine, engineEvents} from '../native/engine';
import {useEditor} from '../store/editor';
import {exportDims, exportSpec} from '../engine/spec';
import {layoutMain} from '../engine/layout';
import {RATIO_VALUE} from '../types';
import {fmtShort} from '../util';

const RES = [{l: '720p', v: 720}, {l: '1080p', v: 1080}, {l: '2K', v: 1440}, {l: '4K', v: 2160}];
const FPS = [24, 30, 60];

export default function ExportPanel({onClose}: {onClose: () => void}) {
  const project = useEditor(s => s.project)!;
  const [res, setRes] = useState(1080);
  const [fps, setFps] = useState(30);
  const [codec, setCodec] = useState<'h264' | 'hevc'>('h264');
  const [state, setState] = useState<'config' | 'running' | 'done' | 'error'>('config');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');
  const ratio = RATIO_VALUE[project.ratio];
  const {total} = layoutMain(project.main);
  const dims = exportDims(ratio, res);
  const bitrate = Math.round(dims.width * dims.height * fps * (codec === 'hevc' ? 0.07 : 0.1));
  const mb = ((bitrate / 8) * (total / 1000)) / 1e6;

  useEffect(() => {
    const sub = engineEvents.addListener('OpenCutExportProgress', (p: number) => setProgress(p));
    return () => sub.remove();
  }, []);

  const start = async () => {
    setState('running'); setProgress(0);
    try {
      const uri = await Engine.startExport(exportSpec(project, ratio, {shortSide: res, fps, bitrate, codec}));
      setResult(uri); setState('done');
    } catch (e: any) {
      if (String(e?.message).includes('cancelled')) { setState('config'); return; }
      setErr(e?.message ?? 'Export failed'); setState('error');
    }
  };

  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text style={s.title}>Export</Text>
        {state !== 'running' ? <Pressable onPress={onClose} hitSlop={12}><Icon name="close" size={22} /></Pressable> : null}
      </View>
      {state === 'config' ? (
        <View>
          <Row label="Resolution">{RES.map(r => <Chip key={r.v} label={r.l} active={res === r.v} onPress={() => setRes(r.v)} />)}</Row>
          <Row label="Frame rate">{FPS.map(f => <Chip key={f} label={`${f} fps`} active={fps === f} onPress={() => setFps(f)} />)}</Row>
          <Row label="Codec">
            <Chip label="H.264" active={codec === 'h264'} onPress={() => setCodec('h264')} />
            <Chip label="HEVC" active={codec === 'hevc'} onPress={() => setCodec('hevc')} />
          </Row>
          <Text style={s.info}>{dims.width}×{dims.height} · {(bitrate / 1e6).toFixed(1)} Mbps · ~{mb.toFixed(1)} MB · {fmtShort(total)}</Text>
          <Pressable style={s.go} onPress={start} disabled={total <= 0}><Text style={s.goT}>Export</Text></Pressable>
        </View>
      ) : null}
      {state === 'running' ? (
        <View style={{alignItems: 'center', paddingVertical: 10}}>
          <ActivityIndicator color={C.accent} />
          <Text style={s.pct}>{Math.round(progress * 100)}%</Text>
          <View style={s.bar}><View style={[s.fill, {width: `${progress * 100}%`}]} /></View>
          <Text style={s.info}>Keep the app open while exporting</Text>
          <Pressable style={s.cancel} onPress={() => Engine.cancelExport()}><Text style={{color: C.text}}>Cancel</Text></Pressable>
        </View>
      ) : null}
      {state === 'done' ? (
        <View style={{alignItems: 'center', paddingVertical: 8}}>
          <Icon name="check-circle" size={42} color={C.accent} />
          <Text style={s.pct}>Saved to Movies/OpenCut</Text>
          <View style={{flexDirection: 'row', marginTop: 12}}>
            <Pressable style={s.cancel} onPress={() => Engine.openVideo(result)}><Text style={{color: C.text}}>Play</Text></Pressable>
            <Pressable style={[s.go, {marginTop: 0, marginLeft: 10, paddingHorizontal: 28}]} onPress={() => Engine.shareVideo(result)}><Text style={s.goT}>Share</Text></Pressable>
          </View>
        </View>
      ) : null}
      {state === 'error' ? (
        <View style={{alignItems: 'center', paddingVertical: 8}}>
          <Icon name="alert-circle" size={42} color={C.danger} />
          <Text style={[s.info, {textAlign: 'center'}]}>{err}</Text>
          <Pressable style={s.cancel} onPress={() => setState('config')}><Text style={{color: C.text}}>Back</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
  return <View style={{marginBottom: 10}}><Text style={s.label}>{label}</Text><View style={{flexDirection: 'row'}}>{children}</View></View>;
}

const s = StyleSheet.create({
  root: {backgroundColor: C.panel, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16},
  head: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12},
  title: {color: C.text, fontSize: 17, fontWeight: '700'},
  label: {color: C.sub, fontSize: 12, marginBottom: 6},
  info: {color: C.sub, fontSize: 12, marginVertical: 8},
  go: {marginTop: 8, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  goT: {color: '#000', fontWeight: '700', fontSize: 15},
  pct: {color: C.text, fontSize: 18, fontWeight: '700', marginVertical: 8},
  bar: {width: '100%', height: 4, borderRadius: 2, backgroundColor: C.card2, overflow: 'hidden'},
  fill: {height: 4, backgroundColor: C.accent},
  cancel: {marginTop: 10, paddingHorizontal: 24, height: 40, borderRadius: 20, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center'},
});
