import { useEditorStore } from '../store/useEditorStore';
import { useHighlightStore } from '../store/useHighlightStore';
import { getModeTheme } from '../utils/theme';
import { Highlighter } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 高亮配豆入口按钮（可复用）
 *
 * 说明：不要把它做成浮在画布上的 absolute 元素 ——
 * absolute 在 overflow-auto 容器里会定位到滚动内容底部而被推出视口；
 * 即使改成 fixed 也会和左侧栏 / 底部图例重叠。
 * 因此入口直接内嵌在「图例栏」（普通/像素模式）与「绘制工具栏」（绘制模式）里。
 */
export function HighlightToggleButton({
  className,
  iconOnly = false,
}: {
  className?: string;
  /** 绘制工具栏只有 48px 宽，用纯图标形式 */
  iconOnly?: boolean;
}) {
  const colorList = useEditorStore((s) => s.colorList);
  const theme = getModeTheme('draw');

  const panelOpen = useHighlightStore((s) => s.panelOpen);
  const setPanelOpen = useHighlightStore((s) => s.setPanelOpen);
  const enabled = useHighlightStore((s) => s.enabled);
  const hexes = useHighlightStore((s) => s.hexes);
  const doneHexes = useHighlightStore((s) => s.doneHexes);

  const active = enabled && hexes.length > 0;
  // 注意：这个组件会被放进 <TooltipTrigger asChild>，而 Radix 的 asChild 要求
  // 恰好一个子元素 —— 一旦这里 return null，Slot 就会抛
  // "React.Children.only expected to receive a single React element child"，
  // 直接把整棵组件树打崩（只剩背景）。所以没有配色时返回禁用按钮而不是 null。
  const disabled = colorList.length === 0;

  if (iconOnly) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setPanelOpen(!panelOpen)}
        title={disabled ? '高亮配豆（当前画板还没有配色）' : '高亮配豆：按色号高亮 + 逐色配豆进度'}
        aria-label="高亮配豆"
        className={cn('nook-tool relative', disabled && 'opacity-30 pointer-events-none', className)}
        style={
          active || panelOpen
            ? { background: theme.light8, borderColor: theme.main, color: theme.dark1 }
            : undefined
        }
      >
        <Highlighter className="w-[18px] h-[18px]" />
        {doneHexes.length > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: 'var(--ac-green)', color: '#fff' }}
          >
            {doneHexes.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setPanelOpen(!panelOpen)}
      title={disabled ? '高亮配豆（当前画板还没有配色）' : '高亮配豆：按色号高亮 + 逐色配豆进度'}
      aria-label="高亮配豆"
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0',
        'border transition-colors duration-200',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      style={
        active || panelOpen
          ? { background: theme.main, color: '#fff', borderColor: theme.light5 }
          : {
              background: 'var(--bg-surface-alt)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }
      }
    >
      <Highlighter className="w-3.5 h-3.5" />
      配豆高亮
      {active && <span className="font-normal opacity-90">{hexes.length} 色</span>}
      {doneHexes.length > 0 && (
        <span
          className="rounded-full px-1.5 text-[10px] font-bold"
          style={
            active || panelOpen
              ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
              : { background: 'var(--ac-green)', color: '#fff' }
          }
        >
          {doneHexes.length}
        </span>
      )}
    </button>
  );
}
