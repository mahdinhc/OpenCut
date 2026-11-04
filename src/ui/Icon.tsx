import React from 'react';
import MCI from 'react-native-vector-icons/MaterialCommunityIcons';
import {C} from '../theme';

export default function Icon({name, size = 24, color = C.text}: {name: string; size?: number; color?: string}) {
  return <MCI name={name} size={size} color={color} />;
}
