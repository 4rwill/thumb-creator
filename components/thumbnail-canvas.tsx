'use client';

import {
  forwardRef,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export type TemplateId = 'impacto' | 'lista' | 'explicacao';

export type ThumbnailCanvasHandle = {
  exportPng: () => Promise<void>;
};

type ThumbnailCanvasProps = {
  category: string;
  episode: string;
  highlight: string;
  photoDataUrl: string | null;
  photoOffset: { x: number; y: number };
  photoZoom: number;
  showLogo: boolean;
  showSafeArea: boolean;
  subtitle: string;
  template: TemplateId;
  title: string;
  onPhotoOffsetChange: (offset: { x: number; y: number }) => void;
};

type TemplateConfig = {
  title: { x: number; y: number; width: number; fontSize: number; maxLines: number };
  subtitle: { x: number; y: number; width: number };
  photo: { x: number; y: number; width: number; height: number; radius: number };
  logo: { x: number; y: number; width: number };
};

const ARTBOARD_WIDTH = 1080;
const ARTBOARD_HEIGHT = 1920;

const templateConfigs: Record<TemplateId, TemplateConfig> = {
  impacto: {
    title: { x: 86, y: 300, width: 890, fontSize: 122, maxLines: 5 },
    subtitle: { x: 90, y: 930, width: 560 },
    photo: { x: 485, y: 900, width: 595, height: 820, radius: 72 },
    logo: { x: 82, y: 1530, width: 330 },
  },
  lista: {
    title: { x: 78, y: 350, width: 610, fontSize: 104, maxLines: 6 },
    subtitle: { x: 82, y: 1100, width: 470 },
    photo: { x: 580, y: 450, width: 500, height: 1270, radius: 40 },
    logo: { x: 76, y: 1510, width: 330 },
  },
  explicacao: {
    title: { x: 90, y: 300, width: 900, fontSize: 116, maxLines: 5 },
    subtitle: { x: 94, y: 790, width: 760 },
    photo: { x: 120, y: 940, width: 840, height: 780, radius: 86 },
    logo: { x: 694, y: 1540, width: 300 },
  },
};

function useCanvasImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const nextImage = new window.Image();
    nextImage.decoding = 'async';
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = src;
    return () => {
      nextImage.onload = null;
    };
  }, [src]);

  return image;
}

function normalizeWord(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function drawTitle(
  context: CanvasRenderingContext2D,
  config: TemplateConfig['title'],
  title: string,
  highlight: string,
) {
  const words = title.trim().toLocaleUpperCase('pt-BR').split(/\s+/).filter(Boolean);
  const lineHeight = config.fontSize * 0.92;
  const spaceWidth = config.fontSize * 0.3;
  context.font = `800 ${config.fontSize}px Montserrat`;
  context.textBaseline = 'top';
  context.shadowColor = 'rgba(0,0,0,.2)';
  context.shadowBlur = 6;

  let x = config.x;
  let y = config.y;
  let line = 1;

  for (const word of words) {
    const width = context.measureText(word).width;
    if (x > config.x && x + width > config.x + config.width) {
      if (line >= config.maxLines) break;
      x = config.x;
      y += lineHeight;
      line += 1;
    }
    context.fillStyle = normalizeWord(word) === normalizeWord(highlight) ? '#f4be50' : '#ffffff';
    context.fillText(word, x, y);
    x += width + spaceWidth;
  }
  context.shadowBlur = 0;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = '';
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) context.fillText(line, x, lineY);
}

export const ThumbnailCanvas = forwardRef<ThumbnailCanvasHandle, ThumbnailCanvasProps>(
  function ThumbnailCanvas(
    {
      category,
      episode,
      highlight,
      photoDataUrl,
      photoOffset,
      photoZoom,
      showLogo,
      showSafeArea,
      subtitle,
      template,
      title,
      onPhotoOffsetChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const holderRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
    const [scale, setScale] = useState(0.32);
    const photo = useCanvasImage(photoDataUrl);
    const logo = useCanvasImage('/clemilson-financas-logo.png');
    const config = templateConfigs[template];

    useEffect(() => {
      const holder = holderRef.current;
      if (!holder) return;
      const updateScale = () => {
        const availableWidth = Math.max(300, holder.clientWidth - 40);
        const availableHeight = Math.max(480, holder.clientHeight - 40);
        setScale(Math.min(availableWidth / ARTBOARD_WIDTH, availableHeight / ARTBOARD_HEIGHT));
      };
      updateScale();
      const observer = new ResizeObserver(updateScale);
      observer.observe(holder);
      return () => observer.disconnect();
    }, []);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      context.clearRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT);
      context.fillStyle = '#011023';
      context.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT);

      const halo = context.createRadialGradient(940, 250, 0, 940, 250, 470);
      halo.addColorStop(0, 'rgba(198,149,42,.22)');
      halo.addColorStop(1, 'rgba(198,149,42,0)');
      context.fillStyle = halo;
      context.fillRect(0, 0, ARTBOARD_WIDTH, 760);

      context.strokeStyle = 'rgba(198,149,42,.38)';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(1050, 1200, 610, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = 'rgba(244,212,142,.2)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(1070, 1210, 490, 0, Math.PI * 2);
      context.stroke();

      context.strokeStyle = 'rgba(198,149,42,.65)';
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(40, 1800);
      context.bezierCurveTo(320, 1720, 470, 1890, 720, 1770);
      context.bezierCurveTo(890, 1700, 1010, 1590, 1110, 1510);
      context.stroke();

      if (photo) {
        const photoConfig = config.photo;
        const baseScale = Math.max(photoConfig.width / photo.width, photoConfig.height / photo.height);
        const width = photo.width * baseScale * photoZoom;
        const height = photo.height * baseScale * photoZoom;
        const x = photoConfig.x - (width - photoConfig.width) / 2 + photoOffset.x;
        const y = photoConfig.y - (height - photoConfig.height) / 2 + photoOffset.y;
        context.save();
        roundedRect(context, photoConfig.x, photoConfig.y, photoConfig.width, photoConfig.height, photoConfig.radius);
        context.clip();
        context.drawImage(photo, x, y, width, height);
        context.restore();

        if (template !== 'explicacao') {
          const overlay = context.createLinearGradient(0, 0, 730, 0);
          overlay.addColorStop(0, '#011023');
          overlay.addColorStop(0.68, 'rgba(1,16,35,.9)');
          overlay.addColorStop(1, 'rgba(1,16,35,0)');
          context.fillStyle = overlay;
          context.fillRect(0, 180, 730, 1400);
        }
      } else {
        context.fillStyle = '#0b2037';
        context.strokeStyle = 'rgba(244,212,142,.42)';
        context.lineWidth = 3;
        context.setLineDash([18, 14]);
        roundedRect(context, config.photo.x, config.photo.y, config.photo.width, config.photo.height, config.photo.radius);
        context.fill();
        context.stroke();
        context.setLineDash([]);
        context.strokeStyle = '#c6952a';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(config.photo.x + config.photo.width / 2, config.photo.y + config.photo.height / 2 - 36, 42, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#c9ced5';
        context.font = '700 22px Inter';
        context.textAlign = 'center';
        context.letterSpacing = '3px';
        context.fillText('ADICIONE SUA FOTO', config.photo.x + config.photo.width / 2, config.photo.y + config.photo.height / 2 + 68);
        context.textAlign = 'left';
        context.letterSpacing = '0px';
      }

      context.fillStyle = 'rgba(1,16,35,.88)';
      context.strokeStyle = '#e2c37f';
      context.lineWidth = 2;
      roundedRect(context, 80, 92, 430, 66, 33);
      context.fill();
      context.stroke();
      context.fillStyle = '#f4d48e';
      context.font = '700 24px Inter';
      context.textAlign = 'center';
      context.letterSpacing = '3px';
      context.fillText(category.toLocaleUpperCase('pt-BR'), 295, 134);
      context.textAlign = 'right';
      context.letterSpacing = '0px';
      context.font = '800 34px Montserrat';
      context.fillStyle = '#ffffff';
      context.fillText(`EP. ${episode || '—'}`, 1000, 137);
      context.textAlign = 'left';

      drawTitle(context, config.title, title || 'Digite o título', highlight);

      if (subtitle) {
        context.fillStyle = '#c9ced5';
        context.font = '700 34px Inter';
        context.textBaseline = 'top';
        drawWrappedText(context, subtitle, config.subtitle.x, config.subtitle.y, config.subtitle.width, 46);
      }

      if (showLogo && logo) {
        const logoHeight = (config.logo.width * logo.height) / logo.width;
        context.drawImage(logo, config.logo.x, config.logo.y, config.logo.width, logoHeight);
      }

      context.fillStyle = 'rgba(198,149,42,.65)';
      context.fillRect(80, 1814, 920, 2);
    }, [category, config, episode, highlight, logo, photo, photoOffset, photoZoom, showLogo, subtitle, template, title]);

    useEffect(() => {
      void document.fonts.ready.then(draw);
    }, [draw]);

    useImperativeHandle(ref, () => ({
      async exportPng() {
        await document.fonts.ready;
        draw();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const slug = `${category}-${episode || 'sem-episodio'}-${title}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 86);
        const link = document.createElement('a');
        link.download = `${slug || 'thumbnail-clemilson-financas'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      },
    }), [category, draw, episode, title]);

    const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * ARTBOARD_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * ARTBOARD_HEIGHT,
      };
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!photo) return;
      const point = pointerPosition(event);
      const area = config.photo;
      if (point.x < area.x || point.x > area.x + area.width || point.y < area.y || point.y > area.y + area.height) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { x: point.x, y: point.y, originX: photoOffset.x, originY: photoOffset.y };
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag || !photo) return;
      const point = pointerPosition(event);
      const baseScale = Math.max(config.photo.width / photo.width, config.photo.height / photo.height);
      const width = photo.width * baseScale * photoZoom;
      const height = photo.height * baseScale * photoZoom;
      const maxX = Math.max(0, (width - config.photo.width) / 2);
      const maxY = Math.max(0, (height - config.photo.height) / 2);
      onPhotoOffsetChange({
        x: Math.max(-maxX, Math.min(maxX, drag.originX + point.x - drag.x)),
        y: Math.max(-maxY, Math.min(maxY, drag.originY + point.y - drag.y)),
      });
    };

    const finishDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };

    return (
      <div ref={holderRef} className="relative flex h-full min-h-[560px] w-full items-center justify-center overflow-hidden p-5">
        <div
          className="relative overflow-hidden rounded-[18px] border border-[rgba(244,212,142,.32)] shadow-[0_28px_80px_rgba(0,0,0,.48)]"
          style={{ width: ARTBOARD_WIDTH * scale, height: ARTBOARD_HEIGHT * scale }}
        >
          <canvas
            ref={canvasRef}
            width={ARTBOARD_WIDTH}
            height={ARTBOARD_HEIGHT}
            aria-label="Pré-visualização editável da thumbnail"
            className={`block h-full w-full ${photo ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          />
          {showSafeArea && (
            <div className="pointer-events-none absolute inset-[7%_6%] rounded-lg border border-dashed border-[rgba(244,190,80,.52)]">
              <span className="absolute -top-5 right-0 text-[8px] font-bold tracking-[.12em] text-[#f4be50]/80 uppercase">Área segura</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);
