import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '../store/useConfigStore';
import { getModeTheme } from '../utils/theme';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import {
  Grid3X3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw,
} from 'lucide-react';

/**
 * 田字格定位（右侧栏卡片，与拼豆图层/背景图层并列）
 *
 * 为什么放在这里而不是设置弹窗里：
 * 设置是模态弹窗，打开后背景会被模糊，根本看不清田字格偏移了多少格，
 * 没法「边看边调」。放到右侧栏后画布始终可见，调节可以实时预览。
 *
 * 所有改动直接写 canvasConfig，实时生效；导出时用的是同一份配置。
 */
export function GridGuidePanel() {
  const [expanded, setExpanded] = useState(true);
  const theme = getModeTheme('draw');
  const canvasConfig = useConfigStore((s) => s.canvasConfig);
  const update = useConfigStore((s) => s.updateCanvasConfig);

  const {
    showMarkLines, minorInterval, markInterval,
    minorLineWidth, majorLineWidth, gridOffsetX, gridOffsetY,
  } = canvasConfig;

  const clamp = (v: number, lo: number, hi: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };
  const nudgeX = (d: number) => update({ gridOffsetX: gridOffsetX + d });
  const nudgeY = (d: number) => update({ gridOffsetY: gridOffsetY + d });
  const arrowBtn = 'nook-tool !w-7 !h-7 shrink-0';

  /** 一行滑块：标签 + 数值在上，滑块在下（右侧栏只有 ~248px，横排会太挤） */
  const SliderRow = ({
    label, value, unit, min, max, onChange,
  }: {
    label: string; value: number; unit?: string;
    min: number; max: number; onChange: (v: number) => void;
  }) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-bold" style={{ color: theme.main }}>
          {value}{unit ?? ''}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={1}
        className="w-full"
        themeColor={theme.main}
      />
    </div>
  );

  return (
    <div className="flex flex-col mx-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--theme-draw-light-5)] overflow-hidden">
      {/* 标题栏 */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--theme-draw-light-5)] bg-[var(--theme-draw)] cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-1 h-4 rounded-full bg-white" />
        <Grid3X3 className="w-3.5 h-3.5 text-white" />
        <span className="text-sm font-bold text-white">标识线 / 田字格</span>
        <ChevronDown
          className={cn('w-4 h-4 ml-auto text-white transition-transform duration-300', expanded && 'rotate-180')}
          style={{ transitionTimingFunction: 'var(--ease-bounce)' }}
        />
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
        style={{ transitionTimingFunction: 'var(--ease-bounce)' }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2.5 p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-[var(--text-main)]">显示田字格</span>
              <Switch
                checked={showMarkLines}
                onChange={(v) => update({ showMarkLines: v })}
                themeColor={theme.main}
              />
            </label>

            {showMarkLines && (
              <>
                <SliderRow
                  label="小格 · 细线" value={minorInterval} unit=" 格"
                  min={2} max={50}
                  onChange={(v) => update({ minorInterval: clamp(v, 2, 50, 5) })}
                />
                <SliderRow
                  label="大格 · 粗线" value={markInterval} unit=" 格"
                  min={2} max={100}
                  onChange={(v) => update({ markInterval: clamp(v, 2, 100, 10) })}
                />
                <SliderRow
                  label="细线粗细" value={minorLineWidth} unit="px"
                  min={1} max={8}
                  onChange={(v) => update({ minorLineWidth: clamp(v, 1, 8, 2) })}
                />
                <SliderRow
                  label="粗线粗细" value={majorLineWidth} unit="px"
                  min={1} max={12}
                  onChange={(v) => update({ majorLineWidth: clamp(v, 1, 12, 4) })}
                />

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">位移（格）</span>
                  <button
                    onClick={() => update({ gridOffsetX: 0, gridOffsetY: 0 })}
                    disabled={gridOffsetX === 0 && gridOffsetY === 0}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    归零
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--text-muted)] w-4 shrink-0">X</span>
                  <button className={arrowBtn} onClick={() => nudgeX(-1)} aria-label="田字格左移一格">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums bg-[var(--bg-surface-alt)] text-[var(--text-primary)]">
                    {gridOffsetX > 0 ? `+${gridOffsetX}` : gridOffsetX}
                  </span>
                  <button className={arrowBtn} onClick={() => nudgeX(1)} aria-label="田字格右移一格">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--text-muted)] w-4 shrink-0">Y</span>
                  <button className={arrowBtn} onClick={() => nudgeY(1)} aria-label="田字格下移一格">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <span className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums bg-[var(--bg-surface-alt)] text-[var(--text-primary)]">
                    {gridOffsetY > 0 ? `+${gridOffsetY}` : gridOffsetY}
                  </span>
                  <button className={arrowBtn} onClick={() => nudgeY(-1)} aria-label="田字格上移一格">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0">快速</span>
                  {[
                    { label: '左', d: -minorInterval, axis: 'x' as const },
                    { label: '右', d: minorInterval, axis: 'x' as const },
                    { label: '上', d: -minorInterval, axis: 'y' as const },
                    { label: '下', d: minorInterval, axis: 'y' as const },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => (item.axis === 'x' ? nudgeX(item.d) : nudgeY(item.d))}
                      className="flex-1 h-6 rounded-md text-[10px] font-bold transition-colors bg-[var(--bg-surface-alt)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                  移动的是田字格本身（相当于无限大的格子纸），图案不动。
                  记录与导出图纸都会带上同一套田字格。
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
