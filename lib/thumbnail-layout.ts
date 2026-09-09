export type TemplateId = 'impacto' | 'lista' | 'explicacao';
export type PaletteId = 'navy' | 'gold' | 'ivory' | 'graphite';

export const palettes = {
  navy: { name: 'Navy clássico', background: '#011023', surface: '#0b2037', text: '#ffffff', muted: '#c9ced5', accent: '#f4be50' },
  gold: { name: 'Dourado', background: '#f4be50', surface: '#f4d48e', text: '#011023', muted: '#223145', accent: '#011023' },
  ivory: { name: 'Marfim', background: '#f8f6f1', surface: '#dee3ea', text: '#011023', muted: '#39485d', accent: '#5d4200' },
  graphite: { name: 'Grafite', background: '#171c21', surface: '#30353b', text: '#ffffff', muted: '#c9ced5', accent: '#e2c37f' },
} as const;

export const templateConfigs = {
  impacto: {
    text: { x: 80, y: 285, width: 920, height: 650, maxSize: 122, minSize: 64, maxLines: 5 },
    photo: { x: 80, y: 995, width: 920, height: 495, radius: 48 },
    logo: { x: 390, y: 1540, width: 300 },
  },
  lista: {
    text: { x: 80, y: 290, width: 490, height: 1200, maxSize: 100, minSize: 60, maxLines: 10 },
    photo: { x: 620, y: 290, width: 380, height: 1200, radius: 40 },
    logo: { x: 390, y: 1540, width: 300 },
  },
  explicacao: {
    text: { x: 80, y: 285, width: 920, height: 580, maxSize: 112, minSize: 62, maxLines: 5 },
    photo: { x: 160, y: 925, width: 760, height: 565, radius: 64 },
    logo: { x: 390, y: 1540, width: 300 },
  },
} as const;

export type Measure = (text: string, size: number) => { width: number; ascent: number; descent: number };
export type TextLayout = { lines: string[]; size: number; lineHeight: number; ascent: number; descent: number; height: number; fits: boolean };

// Keep explicit newlines and every word; never silently discard overflow.
export function fitText(text: string, width: number, height: number, maxSize: number, minSize: number, maxLines: number, measure: Measure): TextLayout {
  let result: TextLayout = { lines: [], size: maxSize, lineHeight: 0, ascent: 0, descent: 0, height: 0, fits: true };
  if (!text.trim()) return result;
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines: string[] = [];
    let tooWide = false;
    for (const paragraph of text.trim().split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (measure(word, size).width > width) tooWide = true;
        const candidate = line ? `${line} ${word}` : word;
        if (line && measure(candidate, size).width > width) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
    const metrics = measure(text.replace(/\s+/g, ' ') + ' ÁÉÍÓÚÇgj', size);
    const ascent = Math.max(metrics.ascent, size * 0.8);
    const descent = Math.max(metrics.descent, size * 0.22);
    const lineHeight = Math.ceil(Math.max(size * 1.16, ascent + descent + size * 0.12));
    const totalHeight = ascent + descent + (lines.length - 1) * lineHeight;
    result = { lines, size, lineHeight, ascent, descent, height: totalHeight, fits: !tooWide && lines.length <= maxLines && totalHeight <= height };
    if (result.fits) return result;
  }
  return result;
}

export function layoutContent(template: TemplateId, title: string, subtitle: string, titleMeasure: Measure, bodyMeasure: Measure) {
  const box = templateConfigs[template].text;
  const secondary = fitText(subtitle, box.width, 150, 34, 28, 3, bodyMeasure);
  const gap = subtitle.trim() ? 36 : 0;
  const main = fitText(title.toLocaleUpperCase('pt-BR'), box.width, box.height - secondary.height - gap, box.maxSize, box.minSize, box.maxLines, titleMeasure);
  return { main, secondary, subtitleY: box.y + main.height + gap, fits: main.fits && secondary.fits };
}
