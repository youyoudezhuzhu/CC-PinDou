import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '../store/useConfigStore';
import { getModeTheme } from '../utils/theme';
import { Switch } from './ui/switch';
import {
  Grid3X3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw,
} from 'lucide-react';

const clampInt = (v: number, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/**
 * 箭头步进 + 可直接输入的数值控件
 *
 * 之前用滑块调间隔/线宽很难精确落在想要的数值上，手感也差；
 * 改成和 X/Y 坐标一致的「左箭头 / 数值 / 右箭头」，中间的数值还能手动输入。
 * 输入框用本地字符串暂存，失焦或回车才提交，否则输入「12」的过程中
 * 会先被当成 1 写进去。
 */
function Stepper({
  value, min, max, onChange,
  DecIcon = ChevronLeft, IncIcon = ChevronRight,
  decLabel, incLabel, inputLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  DecIcon?: typeof ChevronLeft;
  IncIcon?: typeof ChevronLeft;
  decLabel: string;
  incLabel: string;
  inputLabel: string;
}) {
  const [text, setText] = useState(String(value));

  // store 变化（例如点箭头）后同步回输入框
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const next = clampInt(Number(raw), min, max, value);
    onChange(next);
    setText(String(next));
  };

  const btn = 'nook-tool !w-7 !h-7 shrink-0';

  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => onChange(clampInt(value - 1, min, max, value))} aria-label={decLabel}>
        <DecIcon className="w-4 h-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={inputLabel}
        value={text}
        min={min}
        max={max}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        className="flex-1 min-w-0 h-7 rounded-lg text-xs font-bold tabular-nums text-center bg-[var(--bg-surface-alt)] text-[var(--text-primary)] border border-transparent focus:border-[var(--theme-draw)] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button className={btn} onClick={() => onChange(clampInt(value + 1, min, max, value))} aria-label={incLabel}>
        <IncIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

/** 一行：左侧标签 + 步进控件 + 右侧单位 */
function Row({
  label, unit, children,
}: {
  label: string; unit?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-[var(--text-muted)] w-8 shrink-0">{label}</span>
      {children}
      {unit && (
        <span className="text-[10px] text-[var(--text-muted)] w-4 shrink-0">{unit}</span>
      )}
    </div>
  );
}

/**
 * 标识线 / 田字格（右侧栏卡片，与拼豆图层 / 背景图层并列）
 *
 * 放在右侧栏而不是设置弹窗：设置是模态弹窗，打开后背景会被模糊，
 * 看不清田字格偏移了多少格，没法「边看边调」。
 * 所有改动直接写 canvasConfig，实时生效；导出用的是同一份配置。
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
          <div className="flex flex-col gap-2 p-3">
            <label className="flex items-center justify-between gap-2 pb-0.5">
              <span className="text-[12px] font-medium text-[var(--text-main)]">显示田字格</span>
              <Switch
                checked={showMarkLines}
                onChange={(v) => update({ showMarkLines: v })}
                themeColor={theme.main}
              />
            </label>

            {showMarkLines && (
              <>
                <Row label="小格" unit="格">
                  <Stepper
                    value={minorInterval}
                    min={2}
                    max={50}
                    onChange={(v) => update({ minorInterval: v })}
                    decLabel="小格间隔减 1"
                    incLabel="小格间隔加 1"
                    inputLabel="小格间隔"
                  />
                </Row>

                <Row label="大格" unit="格">
                  <Stepper
                    value={markInterval}
                    min={2}
                    max={100}
                    onChange={(v) => update({ markInterval: v })}
                    decLabel="大格间隔减 1"
                    incLabel="大格间隔加 1"
                    inputLabel="大格间隔"
                  />
                </Row>

                <Row label="细线" unit="px">
                  <Stepper
                    value={minorLineWidth}
                    min={1}
                    max={8}
                    onChange={(v) => update({ minorLineWidth: v })}
                    decLabel="细线变细"
                    incLabel="细线变粗"
                    inputLabel="细线粗细"
                  />
                </Row>

                <Row label="粗线" unit="px">
                  <Stepper
                    value={majorLineWidth}
                    min={1}
                    max={12}
                    onChange={(v) => update({ majorLineWidth: v })}
                    decLabel="粗线变细"
                    incLabel="粗线变粗"
                    inputLabel="粗线粗细"
                  />
                </Row>

                <div className="flex items-center justify-between pt-1">
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

                <Row label="X">
                  <Stepper
                    value={gridOffsetX}
                    min={-999}
                    max={999}
                    onChange={(v) => update({ gridOffsetX: v })}
                    decLabel="田字格左移一格"
                    incLabel="田字格右移一格"
                    inputLabel="田字格 X 位移"
                  />
                </Row>

                <Row label="Y">
                  <Stepper
                    value={gridOffsetY}
                    min={-999}
                    max={999}
                    onChange={(v) => update({ gridOffsetY: v })}
                    DecIcon={ChevronUp}
                    IncIcon={ChevronDown}
                    decLabel="田字格上移一格"
                    incLabel="田字格下移一格"
                    inputLabel="田字格 Y 位移"
                  />
                </Row>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
