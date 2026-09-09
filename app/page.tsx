'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { palettes, type PaletteId } from '@/lib/thumbnail-layout';
import {
  Check,
  Download,
  Eye,
  LayoutTemplate,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ThumbnailCanvas,
  type TemplateId,
  type ThumbnailCanvasHandle,
} from '@/components/thumbnail-canvas';

const templates: Array<{ id: TemplateId; name: string; note: string }> = [
  { id: 'impacto', name: 'Impacto', note: 'Alertas e chamadas curtas' },
  { id: 'lista', name: 'Lista', note: 'Erros, passos e dicas' },
  { id: 'explicacao', name: 'Explicação', note: 'Conceitos educativos' },
];

const categories = [
  'Investimentos',
  'Educação financeira',
  'Finanças pessoais',
] as const;

type Category = string;

type SavedDraft = {
  category: Category;
  episode: string;
  showEpisode: boolean;
  palette: PaletteId;
  highlight: string;
  photoDataUrl: string | null;
  photoOffset: { x: number; y: number };
  photoZoom: number;
  showLogo: boolean;
  subtitle: string;
  template: TemplateId;
  title: string;
};

type ModelTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const initialDraft: SavedDraft = {
  category: 'Educação financeira',
  episode: '05',
  showEpisode: true,
  palette: 'navy',
  highlight: 'dinheiro',
  photoDataUrl: null,
  photoOffset: { x: 0, y: 0 },
  photoZoom: 1,
  showLogo: true,
  subtitle: 'Pequenas decisões, grandes consequências.',
  template: 'impacto',
  title: '3 erros que estão acabando com seu dinheiro',
};

function normalizeWord(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

async function preparePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma imagem PNG, JPG ou WebP.');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 15 MB.');
  }

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new window.Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('A imagem não pôde ser aberta.'));
    nextImage.src = source;
  });

  const maxDimension = 1800;
  const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.88);
}

export default function Home() {
  const [draft, setDraft] = useState<SavedDraft>(initialDraft);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'local-only'>('saved');
  const [photoName, setPhotoName] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [layoutError, setLayoutError] = useState('Preparando a prévia…');
  const [exportError, setExportError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<ThumbnailCanvasHandle>(null);
  const stateRef = useRef(draft);
  stateRef.current = draft;

  const patchDraft = (patch: Partial<SavedDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('clemilson-thumbnail-draft');
      if (saved) {
        const value = JSON.parse(saved) as Partial<SavedDraft>;
        const restored = { ...initialDraft, ...value };
        if (!templates.some(item => item.id === restored.template)) restored.template = initialDraft.template;
        if (!Object.hasOwn(palettes, restored.palette)) restored.palette = 'navy';
        for (const key of ['category', 'episode', 'title', 'subtitle', 'highlight'] as const) {
          if (typeof restored[key] !== 'string') restored[key] = initialDraft[key];
        }
        if (typeof restored.showEpisode !== 'boolean') restored.showEpisode = true;
        if (typeof restored.showLogo !== 'boolean') restored.showLogo = true;
        if (!Number.isFinite(restored.photoZoom)) restored.photoZoom = 1;
        restored.photoZoom = Math.max(1, Math.min(2.4, restored.photoZoom));
        if (!Number.isFinite(restored.photoOffset?.x) || !Number.isFinite(restored.photoOffset?.y)) restored.photoOffset = { x: 0, y: 0 };
        if (typeof restored.photoDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(restored.photoDataUrl)) restored.photoDataUrl = null;
        setDraft(restored);
      }
    } catch {
      setSaveStatus('local-only');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem('clemilson-thumbnail-draft', JSON.stringify(draft));
        setSaveStatus('saved');
      } catch {
        try {
          window.localStorage.setItem(
            'clemilson-thumbnail-draft',
            JSON.stringify({ ...draft, photoDataUrl: null }),
          );
        } catch {
          // The editor still works in the current browser session.
        }
        setSaveStatus('local-only');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const validTemplates = templates.map((item) => item.id);

    void Promise.resolve(
      context.registerTool(
        {
          name: 'configure_thumbnail',
          title: 'Configurar thumbnail',
          description: 'Atualiza os textos, a categoria, o template e a exibição da logo na thumbnail visível.',
          inputSchema: {
            type: 'object',
            properties: {
              category: { type: 'string', maxLength: 40 },
              palette: { type: 'string', enum: Object.keys(palettes) },
              showEpisode: { type: 'boolean' },
              template: { type: 'string', enum: validTemplates },
              episode: { type: 'string', maxLength: 3 },
              title: { type: 'string', minLength: 1, maxLength: 120 },
              highlight: { type: 'string', maxLength: 24 },
              subtitle: { type: 'string', maxLength: 64 },
              showLogo: { type: 'boolean' },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
              throw new Error('Configuração inválida.');
            }
            const values = input as Record<string, unknown>;
            const lengths: Record<string, number> = { category: 40, episode: 3, title: 120, highlight: 24, subtitle: 64 };
            for (const [key, value] of Object.entries(values)) {
              if (key in lengths) {
                if (typeof value !== 'string' || value.length > lengths[key] || (key === 'title' && !value.trim())) throw new Error('Texto inválido: ' + key);
              } else if (key === 'showLogo' || key === 'showEpisode') {
                if (typeof value !== 'boolean') throw new Error('Valor inválido: ' + key);
              } else if (key === 'palette') {
                if (typeof value !== 'string' || !Object.hasOwn(palettes, value)) throw new Error('Paleta inválida.');
              } else if (key === 'template') {
                if (!validTemplates.includes(value as TemplateId)) throw new Error('Template inválido.');
              } else throw new Error('Campo desconhecido: ' + key);
            }
            if (typeof values.episode === 'string' && !/^\d{0,3}$/.test(values.episode)) throw new Error('Número de episódio inválido.');
            const current = stateRef.current;
            const next: SavedDraft = {
              ...current,
              category: typeof values.category === 'string' ? values.category : current.category,
              palette: typeof values.palette === 'string' ? values.palette as PaletteId : current.palette,
              showEpisode: typeof values.showEpisode === 'boolean' ? values.showEpisode : current.showEpisode,
              template: validTemplates.includes(values.template as TemplateId)
                ? (values.template as TemplateId)
                : current.template,
              episode: typeof values.episode === 'string' ? values.episode.replace(/\D/g, '').slice(0, 3) : current.episode,
              title: typeof values.title === 'string' ? values.title : current.title,
              highlight: typeof values.highlight === 'string' ? values.highlight.slice(0, 24) : current.highlight,
              subtitle: typeof values.subtitle === 'string' ? values.subtitle.slice(0, 64) : current.subtitle,
              showLogo: typeof values.showLogo === 'boolean' ? values.showLogo : current.showLogo,
            };
            flushSync(() => setDraft(next));
            return {
              status: 'configured',
              category: next.category,
              template: next.template,
              title: next.title,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    void Promise.resolve(
      context.registerTool(
        {
          name: 'read_thumbnail_state',
          title: 'Ler thumbnail atual',
          description: 'Retorna a configuração textual atualmente visível no editor.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            const current = stateRef.current;
            return {
              category: current.category,
              palette: current.palette,
              showEpisode: current.showEpisode,
              episode: current.episode,
              highlight: current.highlight,
              showLogo: current.showLogo,
              subtitle: current.subtitle,
              template: current.template,
              title: current.title,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  const titleCount = draft.title.length;
  const titleStatus = useMemo(() => {
    if (titleCount > 120) return 'Limite ultrapassado';
    return 'Ajuste automático';
  }, [titleCount]);
  const highlightIsValid = !draft.highlight.trim() || draft.title
    .split(/\s+/)
    .some((word) => normalizeWord(word) === normalizeWord(draft.highlight));
  const canExport = !!draft.title.trim() && titleCount <= 120 && highlightIsValid && !processingPhoto && !layoutError;

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    setProcessingPhoto(true);
    try {
      const dataUrl = await preparePhoto(file);
      setPhotoName(file.name);
      patchDraft({ photoDataUrl: dataUrl, photoOffset: { x: 0, y: 0 }, photoZoom: 1 });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível usar essa imagem.');
    } finally {
      setProcessingPhoto(false);
      event.target.value = '';
    }
  };

  const handleExport = async () => {
    if (!canExport || !canvasRef.current) return;
    setExporting(true);
    setExportError('');
    try {
      await canvasRef.current.exportPng();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Não foi possível exportar. Tente novamente.');
    } finally {
      window.setTimeout(() => setExporting(false), 450);
    }
  };

  const resetDraft = () => {
    setDraft(initialDraft);
    setPhotoName('');
    setPhotoError('');
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-[rgba(198,149,42,.18)] bg-[#090f14]/94 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="gold-gradient flex size-9 items-center justify-center rounded-xl text-[#011023] shadow-[0_8px_24px_rgba(198,149,42,.18)]">
              <LayoutTemplate className="size-4.5" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-heading text-sm font-bold tracking-[-0.02em] text-white">Criador de Thumbnails</p>
              <p className="text-xs text-[#8e9197]">Clemilson Finanças</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[rgba(198,149,42,.22)] bg-[#06172b] px-3 py-1.5 text-xs text-[#c9ced5]">
              {saveStatus === 'saving' ? (
                <LoaderCircle className="size-3 animate-spin text-[#f4be50]" />
              ) : (
                <span className="size-1.5 rounded-full bg-[#f4be50] shadow-[0_0_10px_#f4be50]" />
              )}
              {saveStatus === 'saving' ? 'Salvando' : saveStatus === 'local-only' ? 'Salvo sem a foto' : 'Rascunho salvo'}
            </div>
            <Button variant="ghost" size="sm" onClick={resetDraft} className="text-[#c9ced5] hover:bg-[#171c21] hover:text-white">
              Nova capa
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-5 py-6 xl:grid-cols-[minmax(320px,390px)_minmax(560px,1fr)] lg:px-8">
        <aside className="editor-scrollbar max-h-none overflow-y-auto rounded-2xl border bg-[#06172b]/84 shadow-[0_18px_50px_rgba(0,0,0,.22)] xl:max-h-[calc(100vh-112px)]">
          <div className="border-b px-5 py-5">
            <div className="mb-1 flex items-center gap-2 text-[#f4d48e]">
              <span className="text-xs font-bold tracking-[0.14em] uppercase">Conteúdo</span>
              <span className="h-px flex-1 bg-gradient-to-r from-[rgba(198,149,42,.5)] to-transparent" />
            </div>
            <p className="text-sm leading-6 text-[#c9ced5]">Preencha os campos e acompanhe a capa ao lado.</p>
          </div>

          <div className="space-y-6 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Input id="category" list="category-suggestions" value={draft.category} maxLength={40} onChange={event => patchDraft({ category: event.target.value })} placeholder="Digite o nome" className="h-10 border-white/10 bg-[#090f14]" />
                <datalist id="category-suggestions">{categories.map(item => <option key={item} value={item} />)}</datalist>
                <p className="text-xs text-[#8e9197]">Digite livremente. Vazio oculta a categoria.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2"><Label htmlFor="episode-switch">Exibir episódio</Label><Switch id="episode-switch" checked={draft.showEpisode} onCheckedChange={showEpisode => patchDraft({ showEpisode })} /></div>
                <div className="flex h-10 overflow-hidden rounded-lg border border-white/10 bg-[#090f14] focus-within:border-[#c6952a]">
                  <span className="grid place-items-center border-r border-white/10 px-3 text-xs font-bold text-[#f4d48e]">EP.</span>
                  <Input
                    id="episode"
                    aria-label="Número do episódio"
                    disabled={!draft.showEpisode}
                    value={draft.episode}
                    onChange={(event) => patchDraft({ episode: event.target.value.replace(/\D/g, '').slice(0, 3) })}
                    className="h-full rounded-none border-0 bg-transparent text-center font-bold focus-visible:ring-0"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="palette">Cor principal da capa</Label>
              <Select value={draft.palette} onValueChange={value => { if (typeof value === 'string' && Object.hasOwn(palettes, value)) patchDraft({ palette: value as PaletteId }); }}>
                <SelectTrigger id="palette" className="h-10 w-full border-white/10 bg-[#090f14]"><SelectValue>{palettes[draft.palette].name}</SelectValue></SelectTrigger>
                <SelectContent>{Object.entries(palettes).map(([id, colors]) => <SelectItem key={id} value={id}><span aria-hidden="true" className="size-4 rounded-full border border-white/30" style={{ background: colors.background }} />{colors.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-[#8e9197]">Textos e destaques acompanham a cor para manter o contraste.</p>
            </div>

            <section className="space-y-3">
              <Label>Template</Label>
              <div className="grid grid-cols-3 gap-2">
                {templates.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    onClick={() => patchDraft({ template: item.id, photoOffset: { x: 0, y: 0 } })}
                    className={`h-auto min-w-0 flex-col items-stretch rounded-xl p-2 text-left ${
                      draft.template === item.id
                        ? 'border-[#c6952a] bg-[#0b2037] shadow-[inset_0_0_0_1px_rgba(244,212,142,.12)]'
                        : 'border-white/8 bg-[#090f14]/65 hover:border-[rgba(198,149,42,.35)] hover:bg-[#0b2037]'
                    }`}
                  >
                    <span className="mb-2 block aspect-[9/12] w-full rounded-md border border-white/8 bg-[linear-gradient(150deg,#0b2037,#011023)] p-1.5">
                      <span className="block h-1.5 w-7 rounded-full bg-[#c6952a]" />
                      <span className="mt-2 block h-1 w-full rounded-full bg-white/70" />
                      <span className="mt-1 block h-1 w-2/3 rounded-full bg-white/40" />
                    </span>
                    <strong className="block text-xs text-white">{item.name}</strong>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-[#8e9197]">{templates.find((item) => item.id === draft.template)?.note}</p>
            </section>

            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="title">Título principal</Label>
                <span className={`text-xs ${titleCount > 120 ? 'text-[#ffb4ab]' : 'text-[#8e9197]'}`}>
                  {titleCount}/120 · {titleStatus}
                </span>
              </div>
              <Textarea
                id="title"
                value={draft.title}
                onChange={(event) => patchDraft({ title: event.target.value })}
                className="min-h-24 resize-none border-white/10 bg-[#090f14] leading-6"
                aria-invalid={titleCount > 120 || !!layoutError}
              />
              <p className="text-xs text-[#8e9197]">Use Enter para sugerir uma quebra de linha.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="highlight">Palavra em destaque</Label>
              <Input
                id="highlight"
                value={draft.highlight}
                onChange={(event) => patchDraft({ highlight: event.target.value.slice(0, 24) })}
                className="h-10 border-white/10 bg-[#090f14]"
                aria-invalid={!highlightIsValid}
              />
              {!highlightIsValid && <p className="text-xs text-[#ffb4ab]">Use uma palavra que esteja no título.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtítulo <span className="font-normal text-[#8e9197]">(opcional)</span></Label>
              <Input
                id="subtitle"
                value={draft.subtitle}
                onChange={(event) => patchDraft({ subtitle: event.target.value.slice(0, 64) })}
                className="h-10 border-white/10 bg-[#090f14]"
              />
            </div>

            <section className="space-y-3 border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="photo">Foto do educador</Label>
                  <p className="mt-1 truncate text-xs text-[#8e9197]">{photoName || (draft.photoDataUrl ? 'Foto do rascunho' : 'PNG, JPG ou WebP · até 15 MB')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={processingPhoto}
                  className="border-[rgba(198,149,42,.4)] bg-transparent text-[#f4d48e]"
                >
                  {processingPhoto ? <LoaderCircle className="animate-spin" /> : <Upload />}
                  {draft.photoDataUrl ? 'Trocar' : 'Escolher'}
                </Button>
              </div>
              <Input ref={photoInputRef} id="photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} className="sr-only" />
              {photoError && <p role="alert" className="text-xs text-[#ffb4ab]">{photoError}</p>}
              <div className="space-y-3 rounded-xl border border-white/8 bg-[#090f14]/55 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#c9ced5]">Zoom · {Math.round(draft.photoZoom * 100)}%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => patchDraft({ photoZoom: 1, photoOffset: { x: 0, y: 0 } })}
                    disabled={!draft.photoDataUrl}
                    className="text-[#8e9197]"
                  >
                    <RotateCcw /> Restaurar
                  </Button>
                </div>
                <Slider
                  value={[draft.photoZoom]}
                  min={1}
                  max={2.4}
                  step={0.05}
                  disabled={!draft.photoDataUrl}
                  onValueChange={(value) => patchDraft({ photoZoom: Array.isArray(value) ? Number(value[0]) : Number(value) })}
                  className="[&_[data-slot=slider-range]]:bg-[#c6952a] [&_[data-slot=slider-thumb]]:border-[#f4be50]"
                />
                {draft.photoDataUrl && <p className="text-[11px] leading-4 text-[#8e9197]">Arraste a foto diretamente na capa para ajustar o enquadramento.</p>}
              </div>
            </section>

            <div className="space-y-3 border-t pt-5">
              <div className="flex items-center justify-between">
                <Label htmlFor="logo-switch">Exibir logo</Label>
                <Switch id="logo-switch" checked={draft.showLogo} onCheckedChange={(checked) => patchDraft({ showLogo: checked })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="safe-switch">Mostrar área segura</Label>
                <Switch id="safe-switch" checked={showSafeArea} onCheckedChange={setShowSafeArea} />
              </div>
            </div>

            {(layoutError || exportError) && <p role="status" className="rounded-lg border border-[#ffb4ab]/30 p-3 text-sm text-[#ffb4ab]">{exportError || layoutError}</p>}
            <Button
              size="lg"
              disabled={!canExport || exporting}
              onClick={handleExport}
              className="gold-gradient h-11 w-full rounded-xl font-bold text-[#011023] shadow-[0_10px_30px_rgba(198,149,42,.2)] hover:brightness-110"
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
              {exporting ? 'Gerando imagem' : 'Baixar PNG'}
            </Button>
          </div>
        </aside>

        <section className="flex h-[720px] min-h-0 flex-col overflow-hidden rounded-2xl border bg-[#0e1419]/72 shadow-[0_18px_50px_rgba(0,0,0,.22)] xl:h-[calc(100vh-112px)]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-[#f4be50]" />
              <h1 className="text-sm font-semibold text-white">Pré-visualização</h1>
              <span className="rounded-full border border-white/8 bg-[#171c21] px-2 py-1 text-[11px] text-[#8e9197]">1080 × 1920</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8e9197]">
              {canExport ? <Check className="size-4 text-[#f4be50]" /> : <ShieldCheck className="size-4 text-[#c6952a]" />}
              {canExport ? 'Pronta para baixar' : 'Revise os campos'}
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:32px_32px]" />
            <ThumbnailCanvas
              ref={canvasRef}
              category={draft.category}
              episode={draft.episode}
              showEpisode={draft.showEpisode}
              palette={draft.palette}
              highlight={draft.highlight}
              photoDataUrl={draft.photoDataUrl}
              photoOffset={draft.photoOffset}
              photoZoom={draft.photoZoom}
              showLogo={draft.showLogo}
              showSafeArea={showSafeArea}
              subtitle={draft.subtitle}
              template={draft.template}
              title={draft.title}
              onPhotoOffsetChange={(photoOffset) => patchDraft({ photoOffset })}
              onValidationChange={setLayoutError}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
