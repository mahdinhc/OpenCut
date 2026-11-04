export const C = {
  bg: '#000000', panel: '#101012', card: '#1C1C1F', card2: '#2A2A2E', line: '#2C2C30',
  text: '#FFFFFF', sub: '#9A9AA2', accent: '#25F4EE', accent2: '#FE2C55', danger: '#FF453A',
  main: '#34343A', textClip: '#7C5CFF', stickerClip: '#FF9F0A', audioClip: '#1FA67A',
};
/** Font ids are registered natively under the same name (see Fonts.kt), so the id IS the RN fontFamily. */
export const fontFamily = (id: string) => (id === 'sans' ? 'poppins' : id);
