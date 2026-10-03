import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useConfigStore } from '../store/useConfigStore';
import { useTextStore } from '../store/useTextStore';
import { getModeTheme } from '../utils/theme';
import { Button } from '@/components/ui';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  listPixelFonts,
  DEFAULT_PIXEL_FONT_ID,
} from '../engine/pixelFont';
import {
  PACKED_PIXEL_FONTS,
  getPackedFontMeta,
  isPixelFontLoaded,
  loadPixelFont,
} from '../engine/pixelFontLoader';
import { TextGlyphPreview } from './TextGlyphPreview';
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  isTextOutOfBounds,
  textObjectSize,
  countTextBeads,
} from '../engine/pixelText';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, Type, X } from 'lucide-react';

interface TextToolPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 常用倍率快捷项 */
const SCALE_PRESETS = [1, 2, 3, 4];

export function TextToolPanel({ open, onClose }: TextToolPanelProps) {
  const theme = getModeTheme('draw');
  const gridData = useEditorStore((s) => s.gridData);
  const selectedColor = useEditorStore((s) => s.selectedColor);
  const brand = useConfigStore((s) => s.brand);

  const object = useTextStore((s) => s.object);
  const placement = useTextStore((s) => s.placement);
  const ensureText = useTextStore((s) => s.ensureText);
  const updateText = useTextStore((s) => s.updateText);
  const nudge = useTextStore((s) => s.nudge);
  const place = useTextStore((s) => s.place);
  const removeText = useTextStore((s) => s.removeText);

  const [loadedFonts, setLoadedFonts] = useState<string[]>(() =>
    PACKED_PIXEL_FONTS.filter((meta) => isPixelFontLoaded(meta.id)).map((meta) => meta.id),
  );
  const [loadingFontId, setLoadingFontId] = useState<string | null>(null);
  const [followCurrentColor, setFollowCurrentColor] = useState(true);

  const bounds = useMemo(() => {
    if (!gridData || gridData.length === 0) return null;
    return { rows: gridData.length, cols: gridData[0]?.length ?? 0 };
  }, [gridData]);

  // 打开面板时确保存在一个文字对象（默认居中）
  useEffect(() => {
    if (open) ensureText();
  }, [open, ensureText]);

  // 跟随当前拼豆颜色
  useEffect(() => {
    if (!open || !followCurrentColor || !selectedColor) return;
    if (object && object.color !== selectedColor.hex) {
      updateText({ color: selectedColor.hex, codes: { ...selectedColor.codes } });
    }
    // 仅在颜色真正变化时同步，避免覆盖用户手动选择的颜色
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, followCurrentColor, selectedColor?.hex]);

  const fontOptions = useMemo(() => {
    // 内置字体（拉丁 5×7，无需联网）+ 全部打包点阵字体
    const builtin = listPixelFonts()
      .filter((font) => !getPackedFontMeta(font.id))
      .map((font) => ({ key: font.id, label: `${font.name}（内置）` }));
    const packed = PACKED_PIXEL_FONTS.map((meta) => ({
      key: meta.id,
      label: loadedFonts.includes(meta.id) ? meta.name : `${meta.name} · 首次加载`,
    }));
    return [...builtin, ...packed];
  }, [loadedFonts]);

  const activeFontMeta = getPackedFontMeta(object?.font ?? '');

  const handleFontChange = async (fontId: string) => {
    if (!object && !ensureText()) return;
    const meta = getPackedFontMeta(fontId);
    if (!meta) {
      updateText({ font: fontId });
      return;
    }
    if (isPixelFontLoaded(fontId)) {
      setLoadedFonts((prev) => (prev.includes(fontId) ? prev : [...prev, fontId]));
      updateText({ font: fontId });
      return;
    }
    setLoadingFontId(fontId);
    try {
      await loadPixelFont(fontId);
      setLoadedFonts((prev) => (prev.includes(fontId) ? prev : [...prev, fontId]));
      updateText({ font: fontId });
      toast.success(`${meta.name} 已加载`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '字体加载失败');
    } finally {
      setLoadingFontId(null);
    }
  };

  const handleScaleChange = (next: number) => {
    const clamped = Math.max(MIN_TEXT_SCALE, Math.min(MAX_TEXT_SCALE, Math.round(next)));
    updateText({ scale: clamped });
  };

  if (!open) return null;

  const text = object?.text ?? '';
  const font = object?.font ?? DEFAULT_PIXEL_FONT_ID;
  const scale = object?.scale ?? 1;
  const size = object ? textObjectSize(object) : { width: 0, height: 0 };
  const beadCount = object && bounds ? countTextBeads(object, bounds) : 0;
  const overflow = object && bounds ? isTextOutOfBounds(object, bounds) : false;
  const codeLabel = object ? object.codes[brand] || object.color : '';

  return (
    <div
      className="fixed z-[210] flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-lg"
      style={{ left: 56, top: 72, width: 250, maxHeight: 'calc(100vh - 96px)' }}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-heading)]">
          <Type className="w-3.5 h-3.5" style={{ color: theme.main }} />
          像素文字
        </div>
        <button
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          onClick={onClose}
          aria-label="关闭文字工具"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5 p-3 overflow-y-auto">
        {/* 文字输入 */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">文字</span>
          <textarea
            className="w-full min-h-[52px] resize-y rounded-lg border-[3px] border-[var(--nook-wood-light)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm text-[var(--text-heading)] font-semibold focus:outline-none focus:border-[var(--theme-draw)] focus:ring-2 focus:ring-[var(--theme-draw)] transition-all"
            value={text}
            placeholder="输入文字，支持换行"
            onChange={(e) => {
              if (!object) {
                ensureText({ text: e.target.value });
                return;
              }
              updateText({ text: e.target.value });
            }}
          />
        </label>

        {/* 字体 */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">字体</span>
          <Select
            value={font}
            options={fontOptions}
            onChange={handleFontChange}
            disabled={loadingFontId !== null}
            themeColor={theme.main}
          />
          {loadingFontId && (
            <span className="text-[10px] text-[var(--text-muted)]">
              正在加载点阵字形…（首次使用该字号需下载一次）
            </span>
          )}
        </label>

        {/* 字形实时预览：与真正落盘的拼豆格一一对应 */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">
            字形预览（1 倍，放大倍率按此逐点展开）
          </span>
          <TextGlyphPreview text={text} font={font} color={object?.color} />
          {activeFontMeta && (
            <span className="text-[10px] text-[var(--text-muted)] leading-snug">
              {activeFontMeta.desc}
              <br />
              点阵字形：{activeFontMeta.license}
            </span>
          )}
        </div>

        {/* 倍率 */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">
            倍率（1 格 = 1 颗拼豆）
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="nook-tool !w-8 !h-8 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
              onClick={() => handleScaleChange(scale - 1)}
              disabled={scale <= MIN_TEXT_SCALE}
              aria-label="减小倍率"
            >
              −
            </button>
            <div
              className="flex-1 h-8 flex items-center justify-center rounded-lg text-sm font-bold"
              style={{ background: theme.light8, color: theme.dark1 }}
            >
              {scale}×
            </div>
            <button
              className="nook-tool !w-8 !h-8 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
              onClick={() => handleScaleChange(scale + 1)}
              disabled={scale >= MAX_TEXT_SCALE}
              aria-label="增大倍率"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-1">
            {SCALE_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => handleScaleChange(preset)}
                className="flex-1 h-6 rounded-md text-[11px] font-bold transition-colors"
                style={
                  scale === preset
                    ? { background: theme.main, color: '#fff' }
                    : { background: 'var(--bg-surface-alt)', color: 'var(--text-muted)' }
                }
              >
                {preset}×
              </button>
            ))}
          </div>
        </div>

        {/* 颜色 */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">颜色</span>
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-md border border-[var(--border-default)] shrink-0"
              style={{
                background:
                  object && object.color !== 'transparent'
                    ? object.color
                    : 'repeating-linear-gradient(45deg,#ddd,#ddd 4px,#fff 4px,#fff 8px)',
              }}
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-xs font-bold text-[var(--text-heading)] truncate">
                {codeLabel || '—'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] truncate">
                {object?.color ?? '未选择'}
              </span>
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] text-[var(--text-muted)]">跟随当前拼豆颜色</span>
            <Switch
              checked={followCurrentColor}
              onChange={setFollowCurrentColor}
              themeColor={theme.main}
            />
          </label>
        </div>

        {/* 位置与尺寸 */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[var(--text-muted)]">位置 / 移动</span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[var(--text-primary)]">
              X {object?.x ?? 0} · Y {object?.y ?? 0}
            </span>
            <div className="grid grid-cols-3 gap-1">
              <span />
              <button className="nook-tool !w-6 !h-6" onClick={() => nudge(0, -1)} aria-label="上移一格">
                <ArrowUp className="w-3 h-3" />
              </button>
              <span />
              <button className="nook-tool !w-6 !h-6" onClick={() => nudge(-1, 0)} aria-label="左移一格">
                <ArrowLeft className="w-3 h-3" />
              </button>
              <span />
              <button className="nook-tool !w-6 !h-6" onClick={() => nudge(1, 0)} aria-label="右移一格">
                <ArrowRight className="w-3 h-3" />
              </button>
              <span />
              <button className="nook-tool !w-6 !h-6" onClick={() => nudge(0, 1)} aria-label="下移一格">
                <ArrowDown className="w-3 h-3" />
              </button>
              <span />
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">
            也可直接在画布上点击或拖动定位
          </span>
        </div>

        {/* 统计信息 */}
        <div className="rounded-lg bg-[var(--bg-surface-alt)] px-2.5 py-1.5 flex flex-col gap-0.5">
          <span className="text-[11px] text-[var(--text-primary)] font-semibold">
            {size.width}×{size.height} 格 · {beadCount} 颗拼豆
          </span>
          {overflow && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--theme-danger)' }}>
              超出画布，超出部分将被裁剪
            </span>
          )}
          {placement && (
            <span className="text-[10px] text-[var(--text-muted)]">
              已放置 · 继续修改会实时更新
            </span>
          )}
        </div>

        {/* 操作 */}
        <div className="flex flex-col gap-1.5">
          <Button
            variant="primary"
            color="green"
            block
            onClick={() => {
              if (!object) return;
              if (size.width === 0 || size.height === 0) {
                toast.error('请输入文字');
                return;
              }
              place();
              toast.success('文字已放置为拼豆');
            }}
            style={{ background: theme.main, borderColor: theme.light5 }}
          >
            {placement ? '更新文字' : '放置文字'}
          </Button>
          <Button
            variant="ghost"
            color="coral"
            block
            disabled={!object && !placement}
            onClick={() => {
              removeText();
              toast.success('已删除文字');
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除文字
          </Button>
        </div>
      </div>
    </div>
  );
}
