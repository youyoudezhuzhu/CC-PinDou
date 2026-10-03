import { useEditorStore } from '../store/useEditorStore';
import { useHighlightStore } from '../store/useHighlightStore';
import { getModeTheme } from '../utils/theme';
import { Highlighter } from 'lucide-react';

/**
 * 高亮配豆入口按钮
 *
 * 用 position: fixed 定位在画布左下角。
 * 之前用 absolute 放在 overflow-auto 的滚动容器里，会定位到「滚动内容底部」，
 * 画布一大按钮就被推出视口，用户根本看不到入口 —— 这是个真实的实现失误。
 */
export function BeadHighlightTrigger() {
  const colorList = useEditorStore((s) => s.colorList);
  const theme = getModeTheme('draw');

  const panelOpen = useHighlightStore((s) => s.panelOpen);
  const setPanelOpen = useHighlightStore((s) => s.setPanelOpen);
  const enabled = useHighlightStore((s) => s.enabled);
  const hexes = useHighlightStore((s) => s.hexes);
  const doneHexes = useHighlightStore((s) => s.doneHexes);

  if (colorList.length === 0) return null;

  const active = enabled && hexes.length > 0;
  const progressDone = doneHexes.length;

  return (
    <button
      onClick={() => setPanelOpen(!panelOpen)}
      title="高亮配豆：按色号高亮 + 逐色配豆进度"
      aria-label="高亮配豆"
      className="fixed z-[290] left-4 bottom-4 flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-2 text-[11px] font-bold shadow-lg border transition-colors duration-200"
      style={
        active || panelOpen
          ? { background: theme.main, color: '#fff', borderColor: theme.light5 }
          : {
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }
      }
    >
      <Highlighter className="w-3.5 h-3.5" />
      配豆高亮
      {active && (
        <span className="font-normal opacity-90">
          {hexes.length} 色
        </span>
      )}
      {progressDone > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={
            active || panelOpen
              ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
              : { background: 'var(--ac-green)', color: '#fff' }
          }
        >
          已配完 {progressDone}
        </span>
      )}
    </button>
  );
}
