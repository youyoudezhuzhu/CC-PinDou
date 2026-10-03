/**
 * 高亮配豆模式 + 逐色配豆进度
 *
 * 用途：
 *   1. 高亮 —— 把目标色号的拼豆高亮、其余压暗，方便定位「这一色都在哪」
 *   2. 进度 —— 逐色勾选「已配完」，并可在画布上隐藏已配完的色号，
 *      跟着图纸一颗颗配豆时能一路把完成的颜色收掉
 *
 * 与「豆豆你呀」的差异：
 *   那个项目处理的是拼豆图纸**图片**，只能逐像素算颜色距离 + 阈值匹配，
 *   还要靠形态学闭运算/填洞/去噪补救误匹配。
 *   而 CC-PinDou 的 gridData 里直接存着每格的精确 hex，
 *   所以这里只需精确比对字符串，命中率 100%、零误判，也不需要阈值和形态学。
 *
 * 定位参考了对方的思路（fusuguo/ddny，AGPL-3.0），代码为独立实现（本项目 MIT）。
 */

import { create } from 'zustand';

export interface HighlightState {
  /** 控制面板是否展开 */
  panelOpen: boolean;
  /** 是否开启高亮配豆 */
  enabled: boolean;
  /** 被高亮的颜色（hex），按选择先后顺序 */
  hexes: string[];
  /** 非高亮区域的压暗程度 0-95（越大越暗） */
  dimStrength: number;
  /** 是否给高亮区域描边（只描区域外轮廓，不是逐格方框） */
  outline: boolean;

  // ── 逐色配豆进度 ──
  /** 已配完的色号（hex） */
  doneHexes: string[];
  /** 是否在画布上隐藏已配完的色号 */
  hideDone: boolean;

  setPanelOpen: (v: boolean) => void;
  setEnabled: (v: boolean) => void;
  /** 切换某个颜色的高亮状态（首次选中会自动开启） */
  toggleHex: (hex: string) => void;
  setHexes: (hexes: string[]) => void;
  clearHexes: () => void;
  setDimStrength: (v: number) => void;
  setOutline: (v: boolean) => void;

  /** 切换某个色号的「已配完」状态 */
  toggleDone: (hex: string) => void;
  setDoneHexes: (hexes: string[]) => void;
  clearDone: () => void;
  setHideDone: (v: boolean) => void;

  /** 只保留仍然存在的颜色（画板被清空/删色后调用） */
  prune: (available: string[]) => void;
  reset: () => void;
}

export const DEFAULT_DIM_STRENGTH = 78;

const clampDim = (v: number) => Math.max(0, Math.min(95, Math.round(v)));

export const useHighlightStore = create<HighlightState>((set, get) => ({
  panelOpen: false,
  enabled: false,
  hexes: [],
  dimStrength: DEFAULT_DIM_STRENGTH,
  outline: true,
  doneHexes: [],
  hideDone: true,

  setPanelOpen: (v) => set({ panelOpen: v }),

  setEnabled: (v) => {
    // 开启但一个颜色都没选时保持关闭，避免「开了却看不到效果」
    if (v && get().hexes.length === 0) return;
    set({ enabled: v });
  },

  toggleHex: (hex) => {
    const { hexes } = get();
    const next = hexes.includes(hex) ? hexes.filter((h) => h !== hex) : [...hexes, hex];
    set({ hexes: next, enabled: next.length === 0 ? false : true });
  },

  setHexes: (hexes) => set({ hexes, enabled: hexes.length > 0 }),

  clearHexes: () => set({ hexes: [], enabled: false }),

  setDimStrength: (v) => {
    if (!Number.isFinite(v)) return;
    set({ dimStrength: clampDim(v) });
  },

  setOutline: (v) => set({ outline: v }),

  toggleDone: (hex) => {
    const { doneHexes } = get();
    set({
      doneHexes: doneHexes.includes(hex)
        ? doneHexes.filter((h) => h !== hex)
        : [...doneHexes, hex],
    });
  },

  setDoneHexes: (hexes) => set({ doneHexes: hexes }),

  clearDone: () => set({ doneHexes: [] }),

  setHideDone: (v) => set({ hideDone: v }),

  prune: (available) => {
    const allow = new Set(available);
    const { hexes, doneHexes } = get();
    const nextHexes = hexes.filter((h) => allow.has(h));
    const nextDone = doneHexes.filter((h) => allow.has(h));
    const changed =
      nextHexes.length !== hexes.length || nextDone.length !== doneHexes.length;
    if (!changed) return;
    set({
      hexes: nextHexes,
      doneHexes: nextDone,
      enabled: nextHexes.length === 0 ? false : get().enabled,
    });
  },

  reset: () =>
    set({
      panelOpen: false,
      enabled: false,
      hexes: [],
      dimStrength: DEFAULT_DIM_STRENGTH,
      outline: true,
      doneHexes: [],
      hideDone: true,
    }),
}));

/** 各色号的高亮命中统计 */
export interface HighlightSummary {
  total: number;
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

/** 配豆进度统计 */
export interface BeadProgress {
  totalColors: number;
  doneColors: number;
  totalBeads: number;
  doneBeads: number;
  /** 完成百分比（按豆数，0-100，四舍五入） */
  percent: number;
}

/**
 * 统计配豆进度。
 * 以 colorList（当前画板的颜色统计）为基准，doneHexes 中已不存在的色号不计入。
 */
export function summarizeProgress(
  colorList: Array<{ hex: string; count: number }> | null,
  doneHexes: string[],
): BeadProgress {
  const list = colorList ?? [];
  const done = new Set(doneHexes);
  let totalBeads = 0;
  let doneBeads = 0;
  let doneColors = 0;
  for (const color of list) {
    totalBeads += color.count;
    if (done.has(color.hex)) {
      doneBeads += color.count;
      doneColors++;
    }
  }
  return {
    totalColors: list.length,
    doneColors,
    totalBeads,
    doneBeads,
    percent: totalBeads === 0 ? 0 : Math.round((doneBeads / totalBeads) * 100),
  };
}
