import React, {useCallback, useEffect, useState} from 'react';
import {Alert, FlatList, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import {C} from '../theme';
import {ProjectMeta, deleteProject, listProjects, loadProject} from '../store/storage';
import {useEditor} from '../store/editor';
import {useTransport} from '../store/transport';
import {useUI} from '../store/ui';
import {fmtShort} from '../util';

export default function Home() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<ProjectMeta[]>([]);
  const refresh = useCallback(() => listProjects().then(setList), []);
  useEffect(() => { refresh(); }, [refresh]);

  const openProject = async (id: string) => {
    const p = await loadProject(id);
    if (!p) return;
    useTransport.setState({pos: 0, playing: false});
    useEditor.getState().open(p);
    useUI.getState().setRoute('editor');
  };
  const remove = (m: ProjectMeta) =>
    Alert.alert('Delete project', `Delete "${m.name}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => { await deleteProject(m.id); refresh(); }},
    ]);

  return (
    <View style={[s.root, {paddingTop: insets.top + 8, paddingBottom: insets.bottom}]}>
      <View style={s.head}>
        <Text style={s.logo}>Open<Text style={{color: C.accent}}>Cut</Text></Text>
      </View>
      <Pressable style={s.new} onPress={() => useUI.getState().setPicker('new')}>
        <View style={s.plus}><Icon name="plus" size={28} color="#000" /></View>
        <Text style={s.newT}>New project</Text>
      </Pressable>
      <Text style={s.section}>Projects</Text>
      <FlatList
        data={list} numColumns={2} keyExtractor={m => m.id} contentContainerStyle={{paddingBottom: 20}}
        ListEmptyComponent={<Text style={s.empty}>Your projects appear here.</Text>}
        renderItem={({item}) => (
          <Pressable style={s.card} onPress={() => openProject(item.id)} onLongPress={() => remove(item)}>
            <View style={s.thumb}>
              {item.cover ? <Image source={{uri: item.cover}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icon name="movie-open" size={30} color={C.sub} />}
              <Text style={s.dur}>{fmtShort(item.durationMs)}</Text>
            </View>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            <Text style={s.meta}>{item.clips} clip{item.clips === 1 ? '' : 's'} · {new Date(item.updatedAt).toLocaleDateString()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg, paddingHorizontal: 16},
  head: {height: 48, justifyContent: 'center'},
  logo: {color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5},
  new: {height: 120, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginVertical: 14},
  plus: {width: 52, height: 52, borderRadius: 26, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  newT: {color: C.text, fontWeight: '700', marginTop: 10, fontSize: 15},
  section: {color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 10},
  empty: {color: C.sub, textAlign: 'center', marginTop: 40},
  card: {flex: 1 / 2, padding: 4},
  thumb: {aspectRatio: 1.4, borderRadius: 10, backgroundColor: C.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
  dur: {position: 'absolute', right: 6, bottom: 6, color: '#fff', fontSize: 11, backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 5, borderRadius: 4},
  name: {color: C.text, fontSize: 13, marginTop: 6},
  meta: {color: C.sub, fontSize: 11},
});
