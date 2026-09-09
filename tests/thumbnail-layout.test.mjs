import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fitText, layoutContent, templateConfigs, palettes } from '../lib/thumbnail-layout.ts';

// Pass the installed canvas runtime; no browser or network is required.
const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = require(process.argv[2] || '@napi-rs/canvas');
for (const family of ['montserrat', 'inter']) {
  const root = '.vinext/fonts';
  const directory = readdirSync(root).find(name => name.startsWith(family + '-'));
  assert.ok(directory, 'The actual application font must be available: ' + family);
  const files = readdirSync(join(root, directory)).filter(name => name.endsWith('.woff2'));
  for (const file of files) assert.ok(GlobalFonts.registerFromPath(join(root, directory, file), family), 'Font registration failed');
}
const ctx = createCanvas(1080, 1920).getContext('2d');
const measure = (family, weight) => (text, size) => {
  ctx.font = `${weight} ${size}px ${family}`;
  const m = ctx.measureText(text);
  return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
};
const headline = measure('montserrat', 800), body = measure('inter', 600);
const titles = [
  '3 erros que estão acabando com seu dinheiro',
  'INVESTIMENTOS INTELIGENTES PARA CONSTRUIR SUA INDEPENDÊNCIA FINANCEIRA',
  'ÁGUA, AÇÃO E EDUCAÇÃO: por que começar hoje?',
  'O QUE É\nRENDA FIXA?',
  'WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW WWWW',
  'Uma explicação completa sobre investimentos e planejamento financeiro para quem quer aprender a cuidar do próprio futuro',
  'W'.repeat(120),
];
let cases = 0, rejected = 0;
for (const [id, config] of Object.entries(templateConfigs)) {
  for (const title of titles) for (const subtitle of ['', 'Pequenas decisões, grandes consequências.', 'W'.repeat(64)]) {
    const result = layoutContent(id, title, subtitle, headline, body);
    const words = text => text.trim().replace(/\s+/g, ' ');
    assert.equal(words(result.main.lines.join(' ')), words(title.toLocaleUpperCase('pt-BR')), 'No title words may be discarded');
    assert.equal(words(result.secondary.lines.join(' ')), words(subtitle), 'No subtitle words may be discarded');
    if (result.fits) {
      assert.ok(result.subtitleY >= config.text.y + result.main.height);
      assert.ok(result.subtitleY + result.secondary.height <= config.text.y + config.text.height + 0.001);
      assert.ok(result.main.lineHeight >= result.main.ascent + result.main.descent);
      assert.ok(result.main.lines.every(line => headline(line, result.main.size).width <= config.text.width));
      assert.ok(result.main.size >= config.text.minSize);
    } else rejected++;
    cases++;
  }
  // Text/photo regions cannot intersect, and footer is separated from both.
  const a = config.text, b = config.photo;
  assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  assert.ok(b.y + b.height < config.logo.y);
}
const manual = fitText('O QUE É\nRENDA FIXA?', 920, 600, 100, 60, 5, headline);
assert.deepEqual(manual.lines, ['O QUE É', 'RENDA FIXA?']);
assert.equal(fitText('W'.repeat(120), 490, 600, 100, 60, 10, headline).fits, false);
// Verify contrast for every pairing used by the renderer.
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
for (const palette of Object.values(palettes)) for (const role of ['text', 'muted', 'accent']) {
  const a = luminance(palette.background), b = luminance(palette[role]);
  assert.ok((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5, palette.name + ': ' + role);
}
console.log(`${cases} layout combinations verified with actual fonts; ${rejected} oversized cases rejected without truncation. Newlines, region separation and palette contrast passed.`);
