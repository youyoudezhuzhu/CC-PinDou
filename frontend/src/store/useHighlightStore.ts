/**
 * 高亮配豆模式（参考「豆豆你呀」的功能定位，按 CC-PinDou 的数据模型独立实现）
 *
 * 用途：按色号逐色配豆时，把目标色号的拼豆高亮出来、其余压暗，
 * 方便一眼定位「这个颜色一共有哪些位置、各多少颗」。
 *
 * 与「豆豆你呀」的关键差异：
 *   那个项目处理的是拼豆图纸**图片**，只能逐像素算颜色距离 + 阈值匹配，
 *   还要靠形态学闭运算/填洞/去噪来补救误匹配。
 *   而 CC-PinDou 的 gridData 里直接存着每格的精确 hex，
 *   所以这里只需精确比对字符串，命中率 100%、零误判，也不需要阈值和形态学处理。
 */

import { create } from 'zustand';

export interface HighlightState {
  /** 是否开启高亮配豆 */
  enabled: boolean;
  /** 被高亮的颜色（hex），按选择先后顺序 */
  hexes: string[];
  /** 非高亮区域的压暗程度 0-95（越大越暗） */
  dimStrength: number;
  /** 是否给高亮区域描边（只描区域外轮廓，不是逐格方框） */
  outline: boolean;

  setEnabled: (v: boolean) => void;
  /** 切换某个颜色的高亮状态（首次开启会自动打开 enabled） */
  toggleHex: (hex: string) => void;
  setHexes: (hexes: string[]) => void;
  clearHexes: () => void;
  setDimStrength: (v: number) => void;
  setOutline: (v: boolean) => void;
  /** 只保留仍然存在于颜色列表中的高亮项（画板被清空/删色后调用） */
  prune: (available: string[]) => void;
  reset: () => void;
}

export const DEFAULT_DIM_STRENGTH = 78;

export const useHighlightStore = create<HighlightState>((set, get) => ({
  enabled: false,
  hexes: [],
  dimStrength: DEFAULT_DIM_STRENGTH,
  outline: true,

  setEnabled: (v) => {
    // 开启但一个颜色都没选时，保持关闭状态避免「开了却看不到效果」
    if (v && get().hexes.length === 0) return;
    set({ enabled: v });
  },

  toggleHex: (hex) => {
    const { hexes } = get();
    const next = hexes.includes(hex)
      ? hexes.filter((h) => h !== hex)
      : [...hexes, hex];
    set({
      hexes: next,
      // 选满最后一个颜色被取消时自动关闭，避免画面全灰
      enabled: next.length === 0 ? false : true,
    });
  },

  // 与 toggleHex 语义一致：只要还有选中的色号就开启，清空则关闭
  setHexes: (hexes) => set({ hexes, enabled: hexes.length > 0 }),

  clearHexes: () => set({ hexes: [], enabled: false }),

  setDimStrength: (v) => {
    if (!Number.isFinite(v)) return;
    set({ dimStrength: Math.max(0, Math.min(95, Math.round(v))) });
  },

  setOutline: (v) => set({ outline: v }),

  prune: (available) => {
    const allow = new Set(available);
    const { hexes } = get();
    const next = hexes.filter((h) => allow.has(h));
    if (next.length === hexes.length) return;
    set({ hexes: next, enabled: next.length === 0 ? false : get().enabled });
  },

  reset: () => set({ enabled: false, hexes: [], dimStrength: DEFAULT_DIM_STRENGTH, outline: true }),
}));

/**
 * 从配色数据构建高亮信息。
 * 纯函数，便于单测：返回命中格数统计与用于渲染的过滤网格。
 */
export interface HighlightSummary {
  /** 命中的格子总数 */
  total: number;
  /** 每个色号的命中数量 */
  counts: Record<string, number>;
}

export function summarizeHighlight(
  gridData: Array<Array<{ color: string }>> | null,
  hexes: string[],
): HighlightSummary {
  const counts: Record<string, number> = {};
  let total = 0;
  if (!gridData || hexes.length === 0) return { total, counts };
  const wanted = new Set(hexes);
  for (const row of gridData) {
    for (const cell of row) {
      if (cell.color === 'transparent' || !wanted.has(cell.color)) continue;
      counts[cell.color] = (counts[cell.color] ?? 0) + 1;
      total++;
    }
  }
  return { total, counts };
}
