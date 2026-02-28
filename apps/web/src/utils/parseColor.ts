/**
 * Parse hex (#fff, #ffffff, #ffffffff) or rgba(r,g,b,a) to [r,g,b,a] in 0-1.
 */
export function parseColor(str: string): [number, number, number, number] {
  const s = str.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const n = hex.length;
    if (n === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, 1];
    }
    if (n === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b, 1];
    }
    if (n === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return [r, g, b, a];
    }
  }
  const rgba = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgba) {
    const r = Math.min(255, Math.max(0, parseFloat(rgba[1]))) / 255;
    const g = Math.min(255, Math.max(0, parseFloat(rgba[2]))) / 255;
    const b = Math.min(255, Math.max(0, parseFloat(rgba[3]))) / 255;
    const a = rgba[4] != null ? parseFloat(rgba[4]) : 1;
    return [r, g, b, a];
  }
  return [0, 0, 0, 1];
}
