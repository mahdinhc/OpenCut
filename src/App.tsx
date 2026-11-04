import React from 'react';
import {StatusBar, StyleSheet, Text, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {C} from './theme';
import Home from './screens/Home';
import Editor from './screens/Editor';
import Picker from './screens/Picker';
import {useUI} from './store/ui';

export default function App() {
  const route = useUI(s => s.route);
  const picker = useUI(s => s.picker);
  const toast = useUI(s => s.toast);
  return (
    <GestureHandlerRootView style={{flex: 1, backgroundColor: C.bg}}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        {route === 'home' ? <Home /> : <Editor />}
        {picker ? <Picker /> : null}
        {toast ? <View style={s.toast} pointerEvents="none"><Text style={{color: '#fff'}}>{toast}</Text></View> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
const s = StyleSheet.create({
  toast: {position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(40,40,44,.95)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, zIndex: 100},
});
