import { useConfigStore } from '../store/useConfigStore';
import { useUIStore } from '../store/useUIStore';
import { getModeTheme } from '../utils/theme';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import {
  Grid3X3, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw,
} from 'lucide-react';

/**
 * 田字格定位面板
 *
 * 图纸一大就很难快速报出「第几行第几列」。这里用两级辅助线做定位：
 *   - 每 5 格一条细线（小格）
 *   - 每 10 格一条粗线（大格）
 * 并且整块田字格可以上下左右平移若干格（相当于一张无限大的田字格，
 * 移动的是格子而不是图案），方便把分组线对齐到自己图案的边界上。
 *
 * 所有改动**实时生效**：直接写 canvasConfig，不走「改完再点确认」的草稿流程。
 * 注意导出（exportImageFrontend）用的是同一套分组/位移逻辑，
 * 保证「编辑器里看到的」和「导出的图纸」完全一致。
 */
export function GridGuidePanel() {
  const theme = getModeTheme('draw');
  const canvasConfig = useConfigStore((s) => s.canvasConfig);
  const updateCanvasConfig = useConfigStore((s) => s.updateCanvasConfig);
  const gridGuideOpen = useUIStore((s) => s.gridGuideOpen);
  const setGridGuideOpen = useUIStore((s) => s.setGridGuideOpen);

  const { showMarkLines, minorInterval, markInterval, gridOffsetX, gridOffsetY } = canvasConfig;

  if (!gridGuideOpen) return null;

  const setMinor = (v: number) =>
    updateCanvasConfig({ minorInterval: Math.max(2, Math.min(50, Math.round(v) || 5)) });
  const setMajor = (v: number) =>
    updateCanvasConfig({ markInterval: Math.max(2, Math.min(100, Math.round(v) || 10)) });
  const nudgeX = (d: number) => updateCanvasConfig({ gridOffsetX: gridOffsetX + d });
  const nudgeY = (d: number) => updateCanvasConfig({ gridOffsetY: gridOffsetY + d });
  const resetOffset = () => updateCanvasConfig({ gridOffsetX: 0, gridOffsetY: 0 });

  const arrowBtn =
    'nook-tool !w-7 !h-7 shrink-0';

  return (
    <div
      className="fixed z-[300] left-1/2 -translate-x-1/2 top-24 w-[min(400px,calc(100vw-32px))] flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg overflow-hidden"
      role="dialog"
      aria-label="田字格定位面板"
    >
      {/* 标题 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <span className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-1.5">
          <Grid3X3 className="w-3.5 h-3.5" style={{ color: theme.main }} />
          田字格定位
        </span>
        <button
          onClick={() => setGridGuideOpen(false)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="关闭田字格定位面板"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* 开关 */}
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--text-primary)]">显示田字格辅助线</span>
          <Switch
            checked={showMarkLines}
            onChange={(v) => updateCanvasConfig({ showMarkLines: v })}
            themeColor={theme.main}
          />
        </label>

        {/* 两级间隔 */}
        <div className={showMarkLines ? 'flex flex-col gap-2.5' : 'flex flex-col gap-2.5 opacity-50 pointer-events-none'}>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] w-[86px] shrink-0">
              小格 · 细线
            </span>
            <Slider
              value={[minorInterval]}
              onValueChange={([v]) => setMinor(v)}
              min={2}
              max={20}
              step={1}
              themeColor={theme.main}
              className="flex-1"
            />
            <span className="text-[11px] font-bold w-9 text-right" style={{ color: theme.main }}>
              {minorInterval}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] w-[86px] shrink-0">
              大格 · 粗线
            </span>
            <Slider
              value={[markInterval]}
              onValueChange={([v]) => setMajor(v)}
              min={2}
              max={50}
              step={1}
              themeColor={theme.main}
              className="flex-1"
            />
            <span className="text-[11px] font-bold w-9 text-right" style={{ color: theme.main }}>
              {markInterval}
            </span>
          </div>
        </div>

        {/* 位移 */}
        <div className={showMarkLines ? 'flex flex-col gap-2' : 'flex flex-col gap-2 opacity-50 pointer-events-none'}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-muted)]">田字格位移（格）</span>
            <button
              onClick={resetOffset}
              disabled={gridOffsetX === 0 && gridOffsetY === 0}
              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              归零
            </button>
          </div>

          {/* X 轴 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--text-muted)] w-4 shrink-0">X</span>
            <button className={arrowBtn} onClick={() => nudgeX(-1)} aria-label="田字格左移一格">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span
              className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums"
              style={{ background: theme.light8, color: theme.dark1 }}
            >
              {gridOffsetX > 0 ? `+${gridOffsetX}` : gridOffsetX}
            </span>
            <button className={arrowBtn} onClick={() => nudgeX(1)} aria-label="田字格右移一格">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Y 轴 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--text-muted)] w-4 shrink-0">Y</span>
            <button className={arrowBtn} onClick={() => nudgeY(1)} aria-label="田字格下移一格">
              <ChevronDown className="w-4 h-4" />
            </button>
            <span
              className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums"
              style={{ background: theme.light8, color: theme.dark1 }}
            >
              {gridOffsetY > 0 ? `+${gridOffsetY}` : gridOffsetY}
            </span>
            <button className={arrowBtn} onClick={() => nudgeY(-1)} aria-label="田字格上移一格">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* 快捷步进 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)] shrink-0">快速位移</span>
            {[
              { label: '左', d: -minorInterval, axis: 'x' as const },
              { label: '右', d: minorInterval, axis: 'x' as const },
              { label: '上', d: -minorInterval, axis: 'y' as const },
              { label: '下', d: minorInterval, axis: 'y' as const },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => (item.axis === 'x' ? nudgeX(item.d) : nudgeY(item.d))}
                className="flex-1 h-6 rounded-md text-[10px] font-bold transition-colors"
                style={{ background: 'var(--bg-surface-alt)', color: 'var(--text-muted)' }}
              >
                {item.label}
                {item.d}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-[var(--text-muted)] leading-snug">
            移动的是田字格本身（相当于一张无限大的格子纸），图案不动。
            把分组线对齐到图案边界后，报坐标会容易很多。
          </p>
        </div>
      </div>
    </div>
  );
}
