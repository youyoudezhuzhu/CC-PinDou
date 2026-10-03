import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useConfigStore } from '../store/useConfigStore';
import { useHighlightStore } from '../store/useHighlightStore';
import { getModeTheme } from '../utils/theme';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Highlighter, ChevronDown, ChevronUp, X, Eye } from 'lucide-react';

/**
 * 高亮配豆栏
 *
 * 按色号把目标拼豆高亮、其余压暗，方便一颗一颗配色。
 * 浮在画布左下角，三种模式都能用；直接精确比对 gridData 的 hex，
 * 不需要颜色距离阈值，也不会误匹配。
 */
export function BeadHighlightBar() {
  const gridData = useEditorStore((s) => s.gridData);
  const colorList = useEditorStore((s) => s.colorList);
  const brand = useConfigStore((s) => s.brand);
  const theme = getModeTheme('draw');

  const enabled = useHighlightStore((s) => s.enabled);
  const hexes = useHighlightStore((s) => s.hexes);
  const dimStrength = useHighlightStore((s) => s.dimStrength);
  const outline = useHighlightStore((s) => s.outline);
  const toggleHex = useHighlightStore((s) => s.toggleHex);
  const clearHexes = useHighlightStore((s) => s.clearHexes);
  const setEnabled = useHighlightStore((s) => s.setEnabled);
  const setDimStrength = useHighlightStore((s) => s.setDimStrength);
  const setOutline = useHighlightStore((s) => s.setOutline);
  const prune = useHighlightStore((s) => s.prune);

  const [expanded, setExpanded] = useState(false);

  // 画板改动后某些颜色可能已不存在，清掉失效的高亮项（prune 内部无变化时不会 set，安全）
  useEffect(() => {
    prune(colorList.map((c) => c.hex));
  }, [colorList, prune]);

  // 命中统计：选中的色号各有多少颗
  const { total, counts } = useMemo(() => {
    const wanted = new Set(hexes);
    const result: Record<string, number> = {};
    let sum = 0;
    if (!gridData || hexes.length === 0) return { total: 0, counts: result };
    for (const row of gridData) {
      for (const cell of row) {
        if (cell.color === 'transparent' || !wanted.has(cell.color)) continue;
        result[cell.color] = (result[cell.color] ?? 0) + 1;
        sum++;
      }
    }
    return { total: sum, counts: result };
  }, [gridData, hexes]);

  if (!gridData || gridData.length === 0 || colorList.length === 0) return null;

  const active = enabled && hexes.length > 0;

  return (
    <div className="absolute bottom-4 left-4 z-40 flex flex-col items-start gap-2 max-w-[min(560px,calc(100vw-120px))]">
      {/* 展开面板 */}
      {expanded && (
        <div className="w-[min(520px,calc(100vw-120px))] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-bold text-[var(--text-heading)] flex items-center gap-1.5">
              <Highlighter className="w-3.5 h-3.5" style={{ color: theme.main }} />
              选择要高亮的色号
              {hexes.length > 0 && (
                <span className="font-normal text-[var(--text-muted)]">
                  （已选 {hexes.length} 色 · 共 {total} 颗）
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
                onClick={clearHexes}
                disabled={hexes.length === 0}
              >
                清空
              </button>
              <button
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                onClick={() => setExpanded(false)}
                aria-label="收起配豆高亮面板"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 色号列表 */}
          <div className="max-h-[132px] overflow-y-auto flex flex-wrap gap-1.5 p-2.5">
            {colorList.map((color) => {
              const selected = hexes.includes(color.hex);
              const code = color.codes[brand] || color.hex;
              return (
                <button
                  key={color.hex}
                  onClick={() => toggleHex(color.hex)}
                  title={`${code} · ${color.count} 颗`}
                  className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 text-[11px] font-bold transition-all duration-150"
                  style={{
                    background: selected ? theme.light8 : 'var(--bg-surface-alt)',
                    border: `2px solid ${selected ? theme.main : 'transparent'}`,
                    color: 'var(--text-primary)',
                  }}
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0 border border-[var(--border-default)]"
                    style={{ background: color.hex }}
                  />
                  {code}
                  <span className="font-normal text-[var(--text-muted)]">
                    ×{selected && counts[color.hex] !== undefined ? counts[color.hex] : color.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 渲染设置 */}
          <div className="px-3 py-2.5 border-t border-[var(--border-subtle)] flex flex-col gap-2">
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
              />
              <span className="text-[11px] font-bold w-9 text-right" style={{ color: theme.main }}>
                {dimStrength}%
              </span>
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">
                描出高亮区域的外轮廓
              </span>
              <Switch checked={outline} onChange={setOutline} themeColor={theme.main} />
            </label>
          </div>
        </div>
      )}

      {/* 收起态按钮条 */}
      <div className="flex items-center gap-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-lg pl-1 pr-2 py-1">
        <button
          onClick={() => {
            if (hexes.length === 0) {
              // 还没选色号时，先展开面板让用户选
              setExpanded(true);
              return;
            }
            setEnabled(!enabled);
          }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors"
          style={
            active
              ? { background: theme.main, color: '#fff' }
              : { background: 'var(--bg-surface-alt)', color: 'var(--text-primary)' }
          }
          title={active ? '关闭高亮' : '开启高亮配豆'}
        >
          <Highlighter className="w-3.5 h-3.5" />
          配豆高亮
        </button>

        {active && (
          <Badge
            variant="secondary"
            className="rounded-full text-[11px] font-bold px-2 py-0.5 border-none whitespace-nowrap"
          >
            {hexes.length} 色 · {total} 颗
          </Badge>
        )}

        {!active && hexes.length > 0 && (
          <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
            已选 {hexes.length} 色（已暂停）
          </span>
        )}

        {active && (
          <span className="flex items-center gap-0.5" title="已高亮色号">
            <Eye className="w-3 h-3 text-[var(--text-muted)]" />
            <span className="flex items-center gap-0.5">
              {hexes.slice(0, 6).map((hex) => (
                <span
                  key={hex}
                  className="w-3.5 h-3.5 rounded-full border border-[var(--border-default)]"
                  style={{ background: hex }}
                />
              ))}
              {hexes.length > 6 && (
                <span className="text-[10px] text-[var(--text-muted)]">+{hexes.length - 6}</span>
              )}
            </span>
          </span>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={expanded ? '收起配豆高亮面板' : '展开配豆高亮面板'}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
