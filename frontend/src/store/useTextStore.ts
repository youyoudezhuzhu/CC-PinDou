/**
 * 像素文字工具状态
 *
 * 设计要点（对应任务要求 4/5/6/7）：
 *  - 落盘的唯一形式是**真实拼豆格**（写入 editorStore.gridData），
 *    因此颜色统计 / PNG 导出 / 图纸导出 / 保存 / 加载 / Undo / Redo 全部自动兼容，
 *    不存在「文字一套数据、拼豆另一套数据」。
 *  - 未点「放置文字」前只有实时预览，不碰网格。
 *  - 放置后仍可改文字 / 倍率 / 颜色 / 移动 / 删除：先按记录回滚再重新落笔，
 *    并替换掉自己的历史记录，保证「一段文字 = 一步撤销」。
 *  - 若那些格子已被用户手绘覆盖，则自动脱钩（旧文字沉淀为普通拼豆），绝不破坏手绘内容。
 */

import { create } from 'zustand';
import { useEditorStore, sameCodes, type CellWrite } from './useEditorStore';
import type { HistoryAction, TextObject } from '../types/perler';
import {
  createTextObject,
  normalizeScale,
  textObjectSize,
  textObjectToCells,
} from '../engine/pixelText';

/** 历史记录中标记文字工具落笔的工具名 */
export const TEXT_TOOL_NAME = 'text';

/** 已落盘但仍在编辑中的文字记录 */
export interface TextPlacement {
  placementId: string;
  layerId: string;
  /** 本次实际写入的格子及其写入值（用于判断是否被手绘覆盖） */
  written: CellWrite[];
  /** 每个格子被覆盖前的原值（回滚用） */
  previous: CellWrite[];
}

export interface TextState {
  /** 当前编辑中的文字对象；null 表示还没有文字 */
  object: TextObject | null;
  /** 已落盘记录；null 表示仅预览、未写入网格 */
  placement: TextPlacement | null;

  /** 确保存在一个文字对象（不存在则创建），返回该对象 */
  ensureText: (init?: Partial<TextObject>) => TextObject | null;
  /** 修改文字属性（文字/倍率/颜色等），已落盘时实时重落笔 */
  updateText: (patch: Partial<TextObject>) => void;
  /** 设置锚点（取整到网格坐标） */
  setAnchor: (x: number, y: number) => void;
  /** 按整数格平移锚点 */
  nudge: (dx: number, dy: number) => void;
  /** 放置文字（首次落笔或重落笔） */
  place: () => void;
  /** 删除文字（可撤销：会记录为一步 batch_paint） */
  removeText: () => void;
  /** 结束编辑态：保留已落盘拼豆，仅解除编辑关联 */
  endText: () => void;
}

function genPlacementId(): string {
  return `text-placement-${Math.random().toString(36).slice(2, 11)}`;
}

/** 取当前画布尺寸，用于裁剪 */
function getBounds(): { rows: number; cols: number } | null {
  const grid = useEditorStore.getState().gridData;
  if (!grid || grid.length === 0) return null;
  return { rows: grid.length, cols: grid[0]?.length ?? 0 };
}

/** 文字是否至少会产生一颗豆（空文字/全空白不需要落笔） */
function hasAnyBead(object: TextObject, bounds: { rows: number; cols: number }): boolean {
  return textObjectToCells(object, bounds).length > 0;
}

/** 把文字对象展开为待写入的格子 */
function toWrites(object: TextObject, bounds: { rows: number; cols: number }): CellWrite[] {
  return textObjectToCells(object, bounds).map((cell) => ({
    x: cell.x,
    y: cell.y,
    color: object.color,
    codes: { ...object.codes },
  }));
}

/** 计算文字居中时的锚点 */
function centerAnchor(object: TextObject, bounds: { rows: number; cols: number }): { x: number; y: number } {
  const { width, height } = textObjectSize(object);
  return {
    x: Math.round((bounds.cols - width) / 2),
    y: Math.round((bounds.rows - height) / 2),
  };
}

/**
 * 判断已落盘记录是否仍然「属于我们」：
 * 所有写入格都还保持着我们写入的颜色与色号。
 * 一旦用户在这些格子上手绘过，就不再回滚，转为脱钩。
 */
function placementStillIntact(placement: TextPlacement): boolean {
  const grid = useEditorStore.getState().gridData;
  if (!grid) return false;
  for (const write of placement.written) {
    const cell = grid[write.y]?.[write.x];
    if (!cell) return false;
    if (cell.color !== write.color || !sameCodes(cell.codes, write.codes)) return false;
  }
  return true;
}

export const useTextStore = create<TextState>((set, get) => ({
  object: null,
  placement: null,

  ensureText: (init) => {
    const existing = get().object;
    if (existing) {
      if (init) get().updateText(init);
      return get().object;
    }
    const bounds = getBounds();
    if (!bounds) return null;

    // 透明色不适合做文字颜色（落不下任何拼豆），退回黑色
    const selected = useEditorStore.getState().selectedColor;
    const usableColor = selected && selected.hex !== 'transparent' ? selected.hex : undefined;
    const usableCodes = selected && selected.hex !== 'transparent' ? selected.codes : undefined;

    const base = createTextObject({
      color: init?.color ?? usableColor ?? '#000000',
      codes: init?.codes ?? usableCodes ?? {},
      ...init,
    });
    const anchor = centerAnchor(base, bounds);
    const object: TextObject = { ...base, x: init?.x ?? anchor.x, y: init?.y ?? anchor.y };
    set({ object, placement: null });
    return object;
  },

  updateText: (patch) => {
    const current = get().object;
    if (!current) return;

    const next: TextObject = {
      ...current,
      ...patch,
      scale: patch.scale !== undefined ? normalizeScale(patch.scale) : current.scale,
      x: patch.x !== undefined ? Math.round(patch.x) : current.x,
      y: patch.y !== undefined ? Math.round(patch.y) : current.y,
      codes: patch.codes ? { ...patch.codes } : current.codes,
    };

    // 仅在已经落盘后才实时重落笔；否则只更新预览
    if (!get().placement) {
      set({ object: next });
      return;
    }
    restamp(next, set, get);
  },

  setAnchor: (x, y) => {
    const current = get().object;
    if (!current) return;
    get().updateText({ x: Math.round(x), y: Math.round(y) });
  },

  nudge: (dx, dy) => {
    const current = get().object;
    if (!current) return;
    get().updateText({ x: current.x + Math.round(dx), y: current.y + Math.round(dy) });
  },

  place: () => {
    const current = get().object;
    if (!current) return;
    const bounds = getBounds();
    if (!bounds) return;

    // 空文字：不产生任何格子，直接结束编辑态
    if (!hasAnyBead(current, bounds)) {
      set({ placement: null });
      return;
    }
    restamp(current, set, get);
  },

  removeText: () => {
    const { placement } = get();
    const editor = useEditorStore.getState();
    const bounds = getBounds();

    if (placement && bounds) {
      // 把文字占用的格子写回被覆盖前的原值，并记录为一步新的 batch_paint，
      // 这样「删除」本身也是可撤销的（撤销后文字会作为普通拼豆回来）。
      if (placementStillIntact(placement)) {
        editor.writeCellsAsHistory(
          placement.previous.map((cell) => ({ ...cell, codes: { ...cell.codes } })),
          TEXT_TOOL_NAME,
        );
      }
      // 若已被手绘覆盖则不做任何回滚，避免破坏用户内容
    }

    set({ object: null, placement: null });
  },

  endText: () => {
    set({ object: null, placement: null });
  },
}));

/**
 * 回滚当前落盘记录并重新落笔。
 * 抽成独立函数便于 place / updateText 共用，避免状态更新顺序耦合。
 */
function restamp(
  next: TextObject,
  set: (partial: Partial<TextState>) => void,
  get: () => TextState,
): void {
  const editor = useEditorStore.getState();
  const bounds = getBounds();
  if (!bounds || !editor.gridData) {
    set({ object: next, placement: null });
    return;
  }

  const current = get().placement;
  let placementId = current?.placementId ?? genPlacementId();

  if (current) {
    if (placementStillIntact(current)) {
      // 先按记录回滚，再按新参数落笔；随后 writeCellsAsHistory 会替换掉自己的旧记录
      editor.restoreCells(current.previous);
    } else {
      // 已被手绘覆盖 → 脱钩：旧文字沉淀为普通拼豆，新文字用新的 placementId 独立成一步
      placementId = genPlacementId();
    }
  }

  const writes = toWrites(next, bounds);
  if (writes.length === 0) {
    // 新参数下没有任何豆（如文字被清空）：只保留预览态，不再有落盘记录
    set({ object: next, placement: null });
    return;
  }

  const action: HistoryAction | null = editor.writeCellsAsHistory(writes, TEXT_TOOL_NAME, placementId);
  if (!action || action.type !== 'batch_paint') {
    set({ object: next, placement: null });
    return;
  }

  set({
    object: next,
    placement: {
      placementId,
      layerId: action.layerId,
      written: action.positions.map((p) => ({
        x: p.x,
        y: p.y,
        color: p.newColor,
        codes: { ...p.newCodes },
      })),
      previous: action.positions.map((p) => ({
        x: p.x,
        y: p.y,
        color: p.oldColor,
        codes: { ...p.oldCodes },
      })),
    },
  });
}
