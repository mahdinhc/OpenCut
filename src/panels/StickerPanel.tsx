import React, {useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import Sheet, {Chip} from '../ui/Sheet';
import {useEditor} from '../store/editor';
import {useTransport} from '../store/transport';

const SETS: Record<string, string[]> = {
  Smileys: ["😀", "😂", "🥹", "😍", "🥰", "😎", "🤩", "🥳", "😭", "😡", "🤯", "😱", "🤔", "🙄", "😴", "🤗", "😇", "🤪", "😜"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💘", "💝", "💕", "💞", "💓", "💗"],
  Hands: ["👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤞", "🤟", "👌", "💪", "👋", "🤙", "👊", "✊"],
  Fun: ["🔥", "✨", "⭐", "🌟", "💥", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "💯", "💫", "🌈", "⚡"],
  Nature: ["🌸", "🌹", "🌻", "🌴", "🍀", "🌙", "☀️", "⛅", "❄️", "🌊", "🐶", "🐱", "🦋", "🐼", "🦁"],
  Food: ["🍕", "🍔", "🍟", "🍣", "🍩", "🍰", "🍎", "🍓", "🍉", "☕", "🍺", "🍿", "🍦", "🥑", "🌮"],
  Symbols: ["✅", "❌", "⚠️", "❓", "❗", "➡️", "⬅️", "⬆️", "⬇️", "▶️", "⏸️", "🔔", "📍", "💬", "🎵", "🎬"],
};

export default function StickerPanel({onClose}: {onClose: () => void}) {
  const [cat, setCat] = useState('Smileys');
  const add = useEditor(s => s.addSticker);
  return (
    <Sheet title="Stickers" onClose={onClose}>
      <View style={{flexDirection: 'row', marginBottom: 8}}>
        <FlatList horizontal data={Object.keys(SETS)} keyExtractor={k => k} showsHorizontalScrollIndicator={false}
          renderItem={({item}) => <Chip label={item} active={cat === item} onPress={() => setCat(item)} />} />
      </View>
      <FlatList key={cat} data={SETS[cat]} numColumns={8} keyExtractor={(e, i) => e + i} style={{height: 110}}
        renderItem={({item}) => (
          <Pressable style={s.cell} onPress={() => add(useTransport.getState().pos, {emoji: item})}><Text style={{fontSize: 28}}>{item}</Text></Pressable>
        )} />
    </Sheet>
  );
}
const s = StyleSheet.create({cell: {flex: 1 / 8, aspectRatio: 1, alignItems: 'center', justifyContent: 'center'}});
