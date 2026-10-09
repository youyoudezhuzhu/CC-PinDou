import { useState } from 'react';
import { getModeTheme } from '../utils/theme';
import { Switch, Button, Badge } from '@/components/ui';
import { Select } from './ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import {
  Search,
  AlertTriangle,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { Slider } from './ui/slider';
import type { CanvasConfig } from '../types/perler';

const BRANDS = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'] as const;

export interface SettingsConfig {
  brand: string;
  showCode: boolean;
  circleMode: boolean;
}

interface SettingsPanelProps {
  mode: string;
  config: SettingsConfig;
  onChange: (config: Partial<SettingsConfig>) => void;
  /** 画布配置（标识线/田字格）——这部分**实时生效**，不走草稿 */
  canvasConfig: CanvasConfig;
  onCanvasConfigChange: (patch: Partial<CanvasConfig>) => void;
}

export function SettingsPanel({
  mode,
  config,
  onChange,
  canvasConfig,
  onCanvasConfigChange,
}: SettingsPanelProps) {
  const [showChecks, setShowChecks] = useState(false);
  const theme = getModeTheme(mode);

  const { brand, showCode, circleMode } = config;
  const {
    showMarkLines,
    minorInterval,
    markInterval,
    minorLineWidth,
    majorLineWidth,
    gridOffsetX,
    gridOffsetY,
  } = canvasConfig;

  // 田字格位移：正负皆可（相当于把无限大的格子纸整体平移）
  const nudgeX = (d: number) => onCanvasConfigChange({ gridOffsetX: gridOffsetX + d });
  const nudgeY = (d: number) => onCanvasConfigChange({ gridOffsetY: gridOffsetY + d });
  const clamp = (v: number, lo: number, hi: number, fallback: number) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  };
  const arrowBtn = 'nook-tool !w-7 !h-7 shrink-0';

  return (
    <div className="flex flex-col gap-4 min-w-[280px]">
      {/* 品牌 */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide">拼豆品牌</label>
        <Select
          value={brand}
          options={BRANDS.map((b) => ({ key: b, label: b }))}
          onChange={(val) => onChange({ brand: val })}
          themeColor={theme.main}
        />
      </div>

      {/* 选项列表 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide">显示选项</label>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors hover:bg-[var(--bg-surface-alt)]">
          <span className="text-sm font-medium text-[var(--text-main)]">显示色号</span>
          <Switch checked={showCode} onChange={(v) => onChange({ showCode: v })} themeColor={theme.main} />
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors hover:bg-[var(--bg-surface-alt)]">
          <span className="text-sm font-medium text-[var(--text-main)]">圆形珠子</span>
          <Switch checked={circleMode} onChange={(v) => onChange({ circleMode: v })} themeColor={theme.main} />
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors hover:bg-[var(--bg-surface-alt)]">
          <span className="text-sm font-medium text-[var(--text-main)]">标识线 / 田字格</span>
          <Switch
            checked={showMarkLines}
            onChange={(v) => onCanvasConfigChange({ showMarkLines: v })}
            themeColor={theme.main}
          />
        </div>

        {showMarkLines && (
          <div className="px-3 py-2.5 rounded-lg bg-[var(--theme-draw-light-9)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--theme-draw)]">田字格定位</span>
              <span className="text-[10px] text-[var(--text-muted)]">改动实时生效</span>
            </div>

            {/* 两级间隔 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">小格 · 细线</span>
                <span className="text-xs font-bold text-[var(--theme-draw)]">{minorInterval}</span>
              </div>
              <Slider
                value={[minorInterval]}
                onValueChange={([v]) => onCanvasConfigChange({ minorInterval: clamp(v, 2, 50, 5) })}
                min={2}
                max={50}
                step={1}
                className="w-full"
                themeColor={theme.main}
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">大格 · 粗线</span>
                <span className="text-xs font-bold text-[var(--theme-draw)]">{markInterval}</span>
              </div>
              <Slider
                value={[markInterval]}
                onValueChange={([v]) => onCanvasConfigChange({ markInterval: clamp(v, 2, 100, 10) })}
                min={2}
                max={100}
                step={1}
                className="w-full"
                themeColor={theme.main}
              />
            </div>

            {/* 线宽 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">细线粗细</span>
                <span className="text-xs font-bold text-[var(--theme-draw)]">{minorLineWidth}px</span>
              </div>
              <Slider
                value={[minorLineWidth]}
                onValueChange={([v]) => onCanvasConfigChange({ minorLineWidth: clamp(v, 1, 8, 2) })}
                min={1}
                max={8}
                step={1}
                className="w-full"
                themeColor={theme.main}
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">粗线粗细</span>
                <span className="text-xs font-bold text-[var(--theme-draw)]">{majorLineWidth}px</span>
              </div>
              <Slider
                value={[majorLineWidth]}
                onValueChange={([v]) => onCanvasConfigChange({ majorLineWidth: clamp(v, 1, 12, 4) })}
                min={1}
                max={12}
                step={1}
                className="w-full"
                themeColor={theme.main}
              />
            </div>

            {/* 位移 */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">位移（格）</span>
              <button
                onClick={() => onCanvasConfigChange({ gridOffsetX: 0, gridOffsetY: 0 })}
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
              <span className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums bg-[var(--bg-surface)] text-[var(--text-primary)]">
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
              <span className="flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-bold tabular-nums bg-[var(--bg-surface)] text-[var(--text-primary)]">
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
                  className="flex-1 h-6 rounded-md text-[10px] font-bold transition-colors bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-[var(--text-muted)] leading-snug">
              移动的是田字格本身（相当于一张无限大的格子纸），图案不动。
              导出 / 保存图纸时会带上同一套田字格。
            </p>
          </div>
        )}
      </div>

      {/* 质量检查（仅展示按钮，实际检测在父组件触发） */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide">质量检查</label>
        <Button
          size="xs"
          variant={showChecks ? 'primary' : 'secondary'}
          color="green"
          block
          onClick={() => setShowChecks(!showChecks)}
        >
          <Search className="w-3.5 h-3.5" />
          {showChecks ? '收起检查工具' : '展开检查工具'}
        </Button>
        {showChecks && (
          <div className="flex flex-wrap gap-1.5 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-xs py-0.5 px-2">
                  <AlertTriangle className="w-3 h-3" />
                  孤立像素
                </Badge>
              </TooltipTrigger>
              <TooltipContent>请在画布右键菜单中使用检测功能</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-xs py-0.5 px-2">
                  <AlertTriangle className="w-3 h-3" />
                  结构不稳
                </Badge>
              </TooltipTrigger>
              <TooltipContent>请在画布右键菜单中使用检测功能</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-surface-alt)] text-[11px] text-[var(--text-muted)] leading-relaxed">
        <Settings2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--theme-draw)]" />
        <span>
          品牌 / 显示选项修改后点击「确认」生效。
          <br />
          标识线（田字格）为<strong className="text-[var(--theme-draw)]">实时生效</strong>，
          可在画布上一边看一边调，不受「取消」影响。
        </span>
      </div>
    </div>
  );
}
