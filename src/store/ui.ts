import {create} from 'zustand';

export type PanelName = 'speed' | 'volume' | 'filter' | 'adjust' | 'canvas' | 'text' | 'sticker' | 'opacity' | 'zoom' | 'export' | null;
export type PickerPurpose = 'new' | 'main' | 'overlay' | null;

interface UI {
  route: 'home' | 'editor';
  picker: PickerPurpose;
  panel: PanelName;
  toast: string | null;
  setRoute: (r: 'home' | 'editor') => void;
  setPicker: (p: PickerPurpose) => void;
  setPanel: (p: PanelName) => void;
  showToast: (m: string) => void;
}
let timer: any;
export const useUI = create<UI>(set => ({
  route: 'home', picker: null, panel: null, toast: null,
  setRoute: route => set({route}),
  setPicker: picker => set({picker}),
  setPanel: panel => set({panel}),
  showToast: m => { clearTimeout(timer); set({toast: m}); timer = setTimeout(() => set({toast: null}), 2200); },
}));
