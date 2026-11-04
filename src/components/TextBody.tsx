import React from 'react';
import {Text, View} from 'react-native';
import {fontFamily} from '../theme';
import {TextStyle} from '../types';

/** Shared by the live preview and the style panel; mirrors ExportEngine.drawText. */
export default function TextBody({text, style, canvasW}: {text: string; style: TextStyle; canvasW: number}) {
  const size = style.size * canvasW;
  const sw = style.strokeWidth * size;
  return (
    <View style={{
      maxWidth: canvasW * 0.9, backgroundColor: style.bg ?? 'transparent',
      paddingHorizontal: style.bg ? size * 0.35 : 0, paddingVertical: style.bg ? size * 0.15 : 0, borderRadius: size * 0.25,
    }}>
      <Text style={{
        color: style.color, fontSize: size, fontFamily: fontFamily(style.font), fontWeight: (style.bold ? '700' : '400'),
        fontStyle: style.italic ? 'italic' : 'normal', textAlign: style.align,
        textShadowColor: style.strokeColor && sw > 0 ? style.strokeColor : style.shadow ? 'rgba(0,0,0,0.67)' : 'transparent',
        textShadowRadius: style.strokeColor && sw > 0 ? Math.max(1, sw * 1.2) : style.shadow ? size * 0.08 : 0,
        textShadowOffset: {width: 0, height: style.shadow && !(style.strokeColor && sw > 0) ? size * 0.04 : 0},
        lineHeight: undefined,
      } as any}>{text}</Text>
    </View>
  );
}
