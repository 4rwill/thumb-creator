'use client';

import { forwardRef, type PointerEvent, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { layoutContent, palettes, templateConfigs, type Measure, type PaletteId, type TemplateId, type TextLayout } from '@/lib/thumbnail-layout';

export type { TemplateId } from '@/lib/thumbnail-layout';
export type ThumbnailCanvasHandle = { exportPng: () => Promise<void> };
type Props = {
  category: string; episode: string; showEpisode: boolean; palette: PaletteId;
  highlight: string; photoDataUrl: string | null; photoOffset: { x: number; y: number };
  photoZoom: number; showLogo: boolean; showSafeArea: boolean;
  subtitle: string; template: TemplateId; title: string;
  onPhotoOffsetChange: (offset: { x: number; y: number }) => void;
  onValidationChange: (message: string) => void;
};

function useImage(src: string | null) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => { if (!cancelled) setLoaded({ src, image, error: false }); };
    image.onerror = () => { if (!cancelled) setLoaded({ src, image: null, error: true }); };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return { image: loaded?.src === src ? loaded.image : null, error: loaded?.src === src && loaded.error };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export const ThumbnailCanvas = forwardRef<ThumbnailCanvasHandle, Props>(function ThumbnailCanvas(props, ref) {
  const { category, episode, showEpisode, palette, highlight, photoDataUrl, photoOffset, photoZoom, showLogo, showSafeArea, subtitle, template, title, onPhotoOffsetChange, onValidationChange } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [scale, setScale] = useState(0.32);
  const [fonts, setFonts] = useState<{ headline: string; body: string } | null>(null);
  const [fontError, setFontError] = useState(false);
  const photoAsset = useImage(photoDataUrl);
  const logoAsset = useImage('/clemilson-financas-logo.png');
  const photo = photoAsset.image;
  const logo = logoAsset.image;
  const config = templateConfigs[template];
  const colors = palettes[palette];
  const area = { ...config.photo, height: config.photo.height + (showLogo ? 0 : 280) };

  useEffect(() => {
    let cancelled = false;
    const style = getComputedStyle(document.body);
    const headline = style.getPropertyValue('--font-montserrat').trim() || 'Montserrat';
    const body = style.getPropertyValue('--font-inter').trim() || 'Inter';
    Promise.all([document.fonts.load('800 100px ' + headline), document.fonts.load('600 34px ' + body)])
      .then(() => document.fonts.ready)
      .then(() => { if (!cancelled) setFonts({ headline, body }); })
      .catch(() => { if (!cancelled) setFontError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const resize = () => setScale(Math.min(Math.max(160, holder.clientWidth - 40) / 1080, Math.max(320, holder.clientHeight - 40) / 1920));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback((): string => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !fonts) return fontError ? 'Não foi possível carregar as fontes. Recarregue a página.' : 'Carregando as fontes da marca…';
    // Canvas state persists across renders: reset all text and paint settings.
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '0px';
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, 1080, 1920);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(1100, 1140, 650, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1100, 1140, 590, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const photoArea = { ...config.photo, height: config.photo.height + (showLogo ? 0 : 280) };
    ctx.save();
    rounded(ctx, photoArea.x, photoArea.y, photoArea.width, photoArea.height, photoArea.radius);
    ctx.clip();
    ctx.fillStyle = colors.surface;
    ctx.fillRect(photoArea.x, photoArea.y, photoArea.width, photoArea.height);
    if (photo) {
      const ratio = Math.max(photoArea.width / photo.width, photoArea.height / photo.height) * photoZoom;
      const w = photo.width * ratio, h = photo.height * ratio;
      const maxX = Math.max(0, (w - photoArea.width) / 2), maxY = Math.max(0, (h - photoArea.height) / 2);
      const x = photoArea.x - maxX + Math.max(-maxX, Math.min(maxX, photoOffset.x));
      const y = photoArea.y - maxY + Math.max(-maxY, Math.min(maxY, photoOffset.y));
      ctx.drawImage(photo, x, y, w, h);
    } else {
      ctx.fillStyle = colors.muted;
      ctx.font = '600 24px ' + fonts.body;
      ctx.textAlign = 'center';
      ctx.fillText('Adicione sua foto', photoArea.x + photoArea.width / 2, photoArea.y + photoArea.height / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    const measure = (family: string, weight: number): Measure => (text, size) => {
      ctx.font = weight + ' ' + size + 'px ' + family;
      const metrics = ctx.measureText(text);
      return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent };
    };
    const layout = layoutContent(template, title, subtitle, measure(fonts.headline, 800), measure(fonts.body, 600));
    const errors: string[] = [];
    if (!title.trim()) errors.push('Escreva o título da capa.');
    if (!layout.main.fits) errors.push('O título não cabe neste template. Encurte o texto ou escolha outro modelo.');
    if (!layout.secondary.fits) errors.push('O subtítulo não cabe. Encurte o texto.');
    const drawBlock = (block: TextLayout, x: number, y: number, width: number, family: string, weight: number, color: string, highlightWord = '') => {
      if (!block.fits) return;
      ctx.font = weight + ' ' + block.size + 'px ' + family;
      ctx.textBaseline = 'alphabetic';
      block.lines.forEach((line, index) => {
        const baseline = y + block.ascent + index * block.lineHeight;
        ctx.fillStyle = color;
        ctx.fillText(line, x, baseline);
        if (!highlightWord.trim()) return;
        for (const match of line.matchAll(/\S+/g)) {
          if (normalize(match[0]) !== normalize(highlightWord)) continue;
          const start = ctx.measureText(line.slice(0, match.index)).width;
          const end = ctx.measureText(line.slice(0, match.index! + match[0].length)).width;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + start, baseline - block.ascent, Math.min(end - start, width), block.ascent + block.descent);
          ctx.clip();
          ctx.fillStyle = colors.accent;
          ctx.fillText(line, x, baseline);
          ctx.restore();
        }
      });
    };
    drawBlock(layout.main, config.text.x, config.text.y, config.text.width, fonts.headline, 800, colors.text, highlight);
    drawBlock(layout.secondary, config.text.x, layout.subtitleY, config.text.width, fonts.body, 600, colors.muted);

    const categoryMax = showEpisode ? 670 : 920;
    if (category.trim()) {
      const label = category.trim().toLocaleUpperCase('pt-BR');
      const labelMeasure = measure(fonts.body, 700);
      let size = 26;
      while (size > 20 && labelMeasure(label, size).width > categoryMax - 40) size -= 2;
      const labelWidth = labelMeasure(label, size).width;
      if (labelWidth > categoryMax - 40) errors.push('O nome da categoria está longo demais para o cabeçalho.');
      else {
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        rounded(ctx, 80, 150, labelWidth + 40, 64, 32);
        ctx.stroke();
        ctx.fillStyle = colors.text;
        ctx.font = '700 ' + size + 'px ' + fonts.body;
        ctx.fillText(label, 100, 192);
      }
    }
    if (showEpisode) {
      if (!/^\d{1,3}$/.test(episode)) errors.push('Informe o número do episódio ou desative sua exibição.');
      else {
        ctx.textAlign = 'right';
        ctx.font = '800 32px ' + fonts.headline;
        ctx.fillStyle = colors.text;
        ctx.fillText('EP. ' + episode.padStart(2, '0'), 1000, 194);
        ctx.textAlign = 'left';
      }
    }
    if (showLogo && logo) {
      // Keep the supplied white lettering legible on the light palettes.
      if (palette === 'gold' || palette === 'ivory') {
        ctx.fillStyle = '#011023';
        rounded(ctx, config.logo.x - 18, config.logo.y - 12, config.logo.width + 36, config.logo.width * logo.height / logo.width + 24, 24);
        ctx.fill();
      }
      ctx.drawImage(logo, config.logo.x, config.logo.y, config.logo.width, config.logo.width * logo.height / logo.width);
    }
    if (photoDataUrl && !photo) errors.push(photoAsset.error ? 'A foto não pôde ser carregada. Escolha outra imagem.' : 'Carregando a foto…');
    if (showLogo && !logo) errors.push(logoAsset.error ? 'A logo não pôde ser carregada.' : 'Carregando a logo…');
    if (errors.length && !layout.fits) {
      ctx.fillStyle = colors.muted;
      ctx.font = '600 28px ' + fonts.body;
      ctx.fillText('Ajuste o texto para visualizar a composição.', 80, 255);
    }
    return errors.join(' ');
  }, [category, episode, showEpisode, palette, highlight, photoDataUrl, photoOffset, photoZoom, showLogo, subtitle, template, title, config, colors, fonts, fontError, photo, logo, photoAsset.error, logoAsset.error]);

  useEffect(() => { onValidationChange(draw()); }, [draw, onValidationChange]);

  useImperativeHandle(ref, () => ({
    async exportPng() {
      const error = draw();
      if (error) throw new Error(error);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('A prévia ainda não está pronta.');
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png'));
      const slug = [category, showEpisode ? 'ep-' + episode.padStart(2, '0') : '', title].filter(Boolean).join('-').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = (slug || 'clemilson-financas') + '.png';
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  }), [category, episode, showEpisode, title, draw]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 1080, y: (event.clientY - rect.top) / rect.height * 1920 };
  };
  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    const p = point(event);
    if (p.x < area.x || p.x > area.x + area.width || p.y < area.y || p.y > area.y + area.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...p, originX: photoOffset.x, originY: photoOffset.y };
  };
  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !photo) return;
    const p = point(event);
    const ratio = Math.max(area.width / photo.width, area.height / photo.height) * photoZoom;
    const maxX = (photo.width * ratio - area.width) / 2, maxY = (photo.height * ratio - area.height) / 2;
    onPhotoOffsetChange({ x: Math.max(-maxX, Math.min(maxX, drag.originX + p.x - drag.x)), y: Math.max(-maxY, Math.min(maxY, drag.originY + p.y - drag.y)) });
  };
  const stopDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div ref={holderRef} className="relative flex min-h-0 h-full w-full items-center justify-center overflow-hidden p-5">
      <div className="relative shrink-0 overflow-hidden border border-white/20 shadow-[0_28px_80px_rgba(0,0,0,.48)]" style={{ width: 1080 * scale, height: 1920 * scale }}>
        <canvas ref={canvasRef} width={1080} height={1920} aria-label="Pré-visualização editável da thumbnail" className={`block h-full w-full touch-none ${photo ? 'cursor-grab active:cursor-grabbing' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} />
        {showSafeArea && <div className="pointer-events-none absolute inset-[7%_6%] border border-dashed border-blue-400/80"><span className="absolute -top-5 right-0 bg-[#011023] px-1 text-[12px] text-white">Guia de margem</span></div>}
      </div>
    </div>
  );
});
