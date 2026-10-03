import { useEffect, useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useConfigStore } from '../store/useConfigStore';
import { useHighlightStore, summarizeProgress } from '../store/useHighlightStore';
import { getModeTheme } from '../utils/theme';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Highlighter, Check, X, RotateCcw, CheckCheck } from 'lucide-react';

/**
 * 高亮配豆面板（含逐色配豆进度）
 *
 * 用 position: fixed 渲染，避免像之前那样放在 overflow-auto 的滚动容器里，
 * absolute 定位会落到「滚动内容底部」而被推出视口、用户根本看不到入口。
 */
export function BeadHighlightPanel() {
  const gridData = useEditorStore((s) => s.gridData);
  const colorList = useEditorStore((s) => s.colorList);
  const brand = useConfigStore((s) => s.brand);
  const theme = getModeTheme('draw');

  const panelOpen = useHighlightStore((s) => s.panelOpen);
  const enabled = useHighlightStore((s) => s.enabled);
  const hexes = useHighlightStore((s) => s.hexes);
  const dimStrength = useHighlightStore((s) => s.dimStrength);
  const outline = useHighlightStore((s) => s.outline);
  const doneHexes = useHighlightStore((s) => s.doneHexes);
  const hideDone = useHighlightStore((s) => s.hideDone);

  const setPanelOpen = useHighlightStore((s) => s.setPanelOpen);
  const toggleHex = useHighlightStore((s) => s.toggleHex);
  const clearHexes = useHighlightStore((s) => s.clearHexes);
  const setDimStrength = useHighlightStore((s) => s.setDimStrength);
  const setOutline = useHighlightStore((s) => s.setOutline);
  const toggleDone = useHighlightStore((s) => s.toggleDone);
  const clearDone = useHighlightStore((s) => s.clearDone);
  const setHideDone = useHighlightStore((s) => s.setHideDone);
  const prune = useHighlightStore((s) => s.prune);

  // 画板改动后清理失效的色号（prune 无变化时不会 set，安全）
  useEffect(() => {
    prune(colorList.map((c) => c.hex));
  }, [colorList, prune]);

  // 命中统计
  const hitCounts = useMemo(() => {
    const wanted = new Set(hexes);
    const result: Record<string, number> = {};
    if (!gridData) return result;
    for (const row of gridData) {
      for (const cell of row) {
        if (cell.color === 'transparent' || !wanted.has(cell.color)) continue;
        result[cell.color] = (result[cell.color] ?? 0) + 1;
      }
    }
    return result;
  }, [gridData, hexes]);

  const progress = useMemo(
    () => summarizeProgress(colorList, doneHexes),
    [colorList, doneHexes],
  );

  const doneSet = useMemo(() => new Set(doneHexes), [doneHexes]);
  const highlightTotal = useMemo(
    () => Object.values(hitCounts).reduce((a, b) => a + b, 0),
    [hitCounts],
  );

  if (!panelOpen || !gridData || gridData.length === 0 || colorList.length === 0) return null;

  return (
    <div
      className="fixed z-[300] left-1/2 -translate-x-1/2 top-24 w-[min(460px,calc(100vw-32px))] flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg overflow-hidden"
      role="dialog"
      aria-label="高亮配豆面板"
    >
      {/* 标题 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <span className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-1.5">
          <Highlighter className="w-3.5 h-3.5" style={{ color: theme.main }} />
          高亮配豆
          {enabled && highlightTotal > 0 && (
            <span className="font-normal text-[var(--text-muted)]">
              （{hexes.length} 色 · {highlightTotal} 颗）
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={clearDone}
            disabled={doneHexes.length === 0}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            title="把所有色号重置为未配完"
          >
            <RotateCcw className="w-3 h-3" />
            重置进度
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="关闭高亮配豆面板"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 配豆进度 */}
      <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-[var(--text-primary)]">
            配豆进度 {progress.doneColors}/{progress.totalColors} 色
          </span>
          <span className="font-bold" style={{ color: theme.main }}>
            {progress.percent}%
          </span>
        </div>
        <div
          className="h-2 w-full rounded-full overflow-hidden"
          style={{ background: 'var(--bg-surface-alt)' }}
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress.percent}%`, background: theme.main }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">
          已完成 {progress.doneBeads} / {progress.totalBeads} 颗
        </span>
      </div>

      {/* 色号列表：左键点色号切换高亮，右侧勾选「已配完」 */}
      <div className="max-h-[38vh] overflow-y-auto p-2 flex flex-col gap-1">
        {colorList.map((color) => {
          const highlighted = hexes.includes(color.hex);
          const isDone = doneSet.has(color.hex);
          const code = color.codes[brand] || color.hex;
          const hit = highlighted ? (hitCounts[color.hex] ?? 0) : 0;
          return (
            <div
              key={color.hex}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              style={{
                background: highlighted ? theme.light8 : 'var(--bg-surface-alt)',
                opacity: isDone && hideDone ? 0.55 : 1,
              }}
            >
              <button
                onClick={() => toggleHex(color.hex)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                title={highlighted ? '取消高亮该色号' : '高亮该色号'}
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0 border"
                  style={{
                    background: color.hex,
                    borderColor: highlighted ? theme.main : 'var(--border-default)',
                    borderWidth: highlighted ? 2 : 1,
                  }}
                />
                <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">
                  {code}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  ×{color.count}
                </span>
                {highlighted && (
                  <span className="text-[10px] font-bold shrink-0" style={{ color: theme.main }}>
                    {hit} 颗
                  </span>
                )}
              </button>

              <button
                onClick={() => toggleDone(color.hex)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 transition-colors"
                style={
                  isDone
                    ? { background: 'var(--ac-green)', color: '#fff' }
                    : { background: 'var(--bg-surface)', color: 'var(--text-muted)' }
                }
                title={isDone ? '标记为未配完' : '标记为已配完'}
              >
                {isDone ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                {isDone ? '已配完' : '配完'}
              </button>
            </div>
          );
        })}
      </div>

      {/* 渲染设置 */}
      <div className="px-3 py-2.5 border-t border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-bold text-[var(--text-muted)] w-20 shrink-0">
            压暗程度
          </span>
          <Slider
            value={[dimStrength]}
            onValueChange={([v]) => setDimStrength(v)}
            min={0}
            max={95}
            step={1}
            themeColor={theme.main}
            className="flex-1"
            disabled={!enabled}
          />
          <span className="text-[11px] font-bold w-9 text-right" style={{ color: theme.main }}>
            {dimStrength}%
          </span>
        </div>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">描出高亮区域的外轮廓</span>
          <Switch checked={outline} onChange={setOutline} themeColor={theme.main} />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">
            在画布上隐藏已配完的色号
          </span>
          <Switch checked={hideDone} onChange={setHideDone} themeColor={theme.main} />
        </label>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border-subtle)] shrink-0">
        <button
          onClick={() => (hexes.length === 0 ? undefined : useHighlightStore.getState().setEnabled(!enabled))}
          disabled={hexes.length === 0}
          className="flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-colors disabled:opacity-40"
          style={
            enabled
              ? { background: 'var(--bg-surface-alt)', color: 'var(--text-primary)' }
              : { background: theme.main, color: '#fff' }
          }
        >
          {enabled ? '暂停高亮' : hexes.length === 0 ? '请先选择色号' : '开启高亮'}
        </button>
        <button
          onClick={clearHexes}
          disabled={hexes.length === 0}
          className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
        >
          清空高亮
        </button>
      </div>
    </div>
  );
}
