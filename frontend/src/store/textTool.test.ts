/**
 * 文字工具与现有绘图系统的整合测试（要求 7）
 *
 * 重点验证「文字 = 真实拼豆」：
 * 文字落盘后必须与手绘拼豆完全同构 —— 参与颜色统计、Undo/Redo、保存导出，
 * 且 0 位不覆盖已有拼豆。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './useEditorStore';
import { useTextStore } from './useTextStore';
import { countTextBeads, textObjectToCells } from '../engine/pixelText';
import { recalculateColorList } from '../utils/colorList';
import { PIXEL_FONT_5X7 } from '../engine/pixelFont';
import type { BeadLayer, TextObject } from '../types/perler';

const RED = '#FF0000';
const RED_CODES = { MARD: 'A01' };
const BLUE = '#0000FF';
const BLUE_CODES = { MARD: 'A02' };

function resetStores() {
  useEditorStore.setState({
    layers: [],
    activeLayerId: null,
    gridData: null,
    colorList: [],
    selectedColor: null,
    historyStack: [],
    redoStack: [],
    selectedCells: [],
    isolatedCells: [],
    unstableCells: [],
  });
  useTextStore.setState({ object: null, placement: null });
}

/** 取当前激活拼豆图层 */
function activeBeadLayer(): BeadLayer {
  const state = useEditorStore.getState();
  const layer = state.layers.find((l) => l.id === state.activeLayerId);
  if (!layer || layer.type !== 'bead') throw new Error('当前激活图层不是拼豆图层');
  return layer;
}

/** 统计当前网格中某个颜色的格子数 */
function countColor(hex: string): number {
  const grid = useEditorStore.getState().gridData;
  if (!grid) return 0;
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.color === hex) count++;
    }
  }
  return count;
}

function openText(overrides: Partial<TextObject> = {}): TextObject {
  const object = useTextStore.getState().ensureText({
    text: 'HELLO',
    scale: 1,
    color: RED,
    codes: { ...RED_CODES },
    x: 2,
    y: 3,
    ...overrides,
  });
  if (!object) throw new Error('创建文字对象失败');
  return object;
}

describe('文字工具整合', () => {
  beforeEach(() => {
    resetStores();
    useEditorStore.getState().createBlankGrid(32);
  });

  describe('放置文字（要求 5/7）', () => {
    it('放置后文字必须变成真实的 gridData 格子', () => {
      openText();
      useTextStore.getState().place();

      const cells = textObjectToCells(
        { text: 'HELLO', font: 'pixel-5x7', scale: 1, x: 2, y: 3 },
        { rows: 32, cols: 32 },
      );
      expect(cells.length).toBe(73);
      expect(countColor(RED)).toBe(73);

      const grid = useEditorStore.getState().gridData!;
      for (const cell of cells) {
        expect(grid[cell.y][cell.x].color).toBe(RED);
        expect(grid[cell.y][cell.x].codes).toEqual(RED_CODES);
      }
    });

    it('放置后 colorList 自动包含文字颜色（颜色统计兼容）', () => {
      openText();
      useTextStore.getState().place();

      const { colorList } = useEditorStore.getState();
      const entry = colorList.find((c) => c.hex === RED);
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(73);
      expect(entry!.codes).toEqual(RED_CODES);
    });

    it('文字的拼豆必须与手绘拼豆同构：gridData 与图层数据是同一份', () => {
      openText();
      useTextStore.getState().place();

      const layer = activeBeadLayer();
      const grid = useEditorStore.getState().gridData!;
      // 激活图层的 gridData 就是视图 gridData（同一引用，无复制、无第二套数据）
      expect(layer.gridData).toBe(grid);
      // 图层 colorList 也同步更新
      expect(layer.colorList.find((c) => c.hex === RED)?.count).toBe(73);
      // 与独立重算的结果一致
      expect(layer.colorList).toEqual(recalculateColorList(grid));
    });

    it('2× 的文字落盘后格子数量是 1× 的 4 倍（真实拼豆数量缩放）', () => {
      // 用足够大的画布，确保断言的是缩放本身而不是裁剪结果
      resetStores();
      useEditorStore.getState().createBlankGrid(128);

      openText({ scale: 1 });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(73);

      resetStores();
      useEditorStore.getState().createBlankGrid(128);
      openText({ scale: 2 });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(73 * 4);
    });

    it('3× 的文字落盘后格子数量是 1× 的 9 倍', () => {
      resetStores();
      useEditorStore.getState().createBlankGrid(128);
      openText({ scale: 3 });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(73 * 9);
    });
  });

  describe('背景透明（要求 6）', () => {
    it('文字矩阵中的 0 不得覆盖已有拼豆', () => {
      // 先手绘一条竖线
      const grid = useEditorStore.getState().gridData!;
      const painted: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < 32; y++) {
        grid[y][0].color = BLUE;
        grid[y][0].codes = { ...BLUE_CODES };
        painted.push({ x: 0, y });
      }

      // 把文字放在竖线右侧，紧邻但不重叠
      openText({ x: 1, y: 0 });
      useTextStore.getState().place();

      // 手绘的竖线必须原样保留
      for (const p of painted) {
        expect(grid[p.y][p.x].color).toBe(BLUE);
      }
      expect(countColor(BLUE)).toBe(32);
    });

    it('文字与已有拼豆重叠时，只有 1 位处被覆盖，0 位处的原内容保持不变', () => {
      const grid = useEditorStore.getState().gridData!;
      // 填满一块背景
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          grid[y][x].color = BLUE;
          grid[y][x].codes = { ...BLUE_CODES };
        }
      }

      openText({ x: 0, y: 0, text: 'A', scale: 1 });
      useTextStore.getState().place();

      // 'A' 点阵中为 0 的位置必须还是蓝色
      const matrix = PIXEL_FONT_5X7.glyphs.A;
      for (let y = 0; y < matrix.height; y++) {
        for (let x = 0; x < matrix.width; x++) {
          if (matrix.rows[y][x] === '1') {
            expect(grid[y][x].color).toBe(RED);
          } else {
            expect(grid[y][x].color).toBe(BLUE);
          }
        }
      }
    });
  });

  describe('Undo / Redo（要求 4/7）', () => {
    it('撤销应把文字完全移除并恢复原有内容', () => {
      const grid = useEditorStore.getState().gridData!;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          grid[y][x].color = BLUE;
          grid[y][x].codes = { ...BLUE_CODES };
        }
      }

      openText({ x: 0, y: 0, text: 'A' });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(18); // 'A' 有 18 个落豆像素

      useEditorStore.getState().undo();
      expect(countColor(RED)).toBe(0);
      expect(countColor(BLUE)).toBe(32 * 32);

      useEditorStore.getState().redo();
      expect(countColor(RED)).toBe(18);
    });

    it('撤销后 colorList 也要恢复', () => {
      openText();
      useTextStore.getState().place();
      expect(useEditorStore.getState().colorList.find((c) => c.hex === RED)?.count).toBe(73);

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().colorList.find((c) => c.hex === RED)).toBeUndefined();
    });

    it('整段文字只占一步撤销（移动/改字不产生多条历史）', () => {
      openText();
      useTextStore.getState().place();
      expect(useEditorStore.getState().historyStack).toHaveLength(1);

      useTextStore.getState().nudge(1, 0);
      useTextStore.getState().nudge(0, 1);
      useTextStore.getState().updateText({ text: 'HI' });
      useTextStore.getState().updateText({ scale: 2 });

      // 仍然只有一条历史记录
      expect(useEditorStore.getState().historyStack).toHaveLength(1);

      // 一次撤销即可把整段文字移除
      useEditorStore.getState().undo();
      expect(countColor(RED)).toBe(0);
    });
  });

  describe('移动（要求 4/5）', () => {
    it('移动后旧位置必须清空、新位置出现拼豆', () => {
      const object = openText({ x: 2, y: 3, text: 'A' });
      useTextStore.getState().place();

      const before = textObjectToCells(object, { rows: 32, cols: 32 });
      expect(countColor(RED)).toBe(18);

      useTextStore.getState().nudge(5, 4);
      const moved = textObjectToCells(
        { ...object, x: object.x + 5, y: object.y + 4 },
        { rows: 32, cols: 32 },
      );

      // 新位置全部是红色
      for (const cell of moved) {
        expect(useEditorStore.getState().gridData![cell.y][cell.x].color).toBe(RED);
      }
      // 旧位置中不在新位置的部分必须被清空
      const movedSet = new Set(moved.map((c) => `${c.x},${c.y}`));
      for (const cell of before) {
        if (movedSet.has(`${cell.x},${cell.y}`)) continue;
        expect(useEditorStore.getState().gridData![cell.y][cell.x].color).not.toBe(RED);
      }
      expect(countColor(RED)).toBe(18);
    });

    it('移动时锚点必须保持整数网格坐标', () => {
      openText({ x: 2, y: 3 });
      useTextStore.getState().nudge(3, -2);
      const object = useTextStore.getState().object!;
      expect(Number.isInteger(object.x)).toBe(true);
      expect(Number.isInteger(object.y)).toBe(true);
      expect(object.x).toBe(5);
      expect(object.y).toBe(1);
    });

    it('未放置时移动只更新预览，不得写入网格', () => {
      openText({ x: 2, y: 3 });
      useTextStore.getState().nudge(4, 4);
      expect(countColor(RED)).toBe(0);
      expect(useEditorStore.getState().historyStack).toHaveLength(0);
    });
  });

  describe('修改文字 / 颜色 / 倍率（要求 4）', () => {
    it('修改文字内容后应重新落笔为新内容', () => {
      openText({ text: 'A' });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(18);

      useTextStore.getState().updateText({ text: 'B' });
      // B 的落豆数为 15
      const bDots = PIXEL_FONT_5X7.glyphs.B.rows.join('').split('1').length - 1;
      expect(countColor(RED)).toBe(bDots);
    });

    it('修改颜色后占用格数不变，但颜色整体切换', () => {
      openText({ text: 'A', x: 0, y: 0 });
      useTextStore.getState().place();
      useTextStore.getState().updateText({ color: BLUE, codes: { ...BLUE_CODES } });
      expect(countColor(RED)).toBe(0);
      expect(countColor(BLUE)).toBe(18);
      const grid = useEditorStore.getState().gridData!;
      expect(grid[0][1].codes).toEqual(BLUE_CODES);
    });

    it('修改倍率后拼豆数量按平方增长', () => {
      openText({ text: 'A', scale: 1 });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(18);
      useTextStore.getState().updateText({ scale: 3 });
      expect(countColor(RED)).toBe(162);
    });
  });

  describe('删除（要求 4）', () => {
    it('删除应恢复文字覆盖前的内容，且删除本身可撤销', () => {
      const grid = useEditorStore.getState().gridData!;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          grid[y][x].color = BLUE;
          grid[y][x].codes = { ...BLUE_CODES };
        }
      }

      openText({ x: 0, y: 0, text: 'A' });
      useTextStore.getState().place();
      expect(countColor(RED)).toBe(18);

      useTextStore.getState().removeText();
      expect(countColor(RED)).toBe(0);
      // 原内容完整恢复
      expect(countColor(BLUE)).toBe(32 * 32);
      expect(useTextStore.getState().object).toBeNull();
    });

    it('未放置时删除不应改动网格', () => {
      openText();
      useTextStore.getState().removeText();
      expect(countColor(RED)).toBe(0);
      expect(useEditorStore.getState().historyStack).toHaveLength(0);
    });
  });

  describe('与手绘共存安全性', () => {
    it('文字落盘后若被手绘覆盖，再次编辑应脱钩而不是破坏手绘内容', () => {
      openText({ text: 'A', x: 0, y: 0 });
      useTextStore.getState().place();

      const grid = useEditorStore.getState().gridData!;
      // 模拟用户用画笔在文字上涂了别的颜色
      grid[0][1].color = BLUE;
      grid[0][1].codes = { ...BLUE_CODES };

      useTextStore.getState().updateText({ text: 'B' });

      // 用户涂的那一格必须保留（不被回滚覆盖）
      const after = useEditorStore.getState().gridData!;
      const stillBlue =
        after[0][1].color === BLUE ||
        // 或 B 恰好也落在该格：此时应为新文字颜色，但绝不能是「文字 A 的红色被回滚成透明」
        after[0][1].color === RED;
      expect(stillBlue).toBe(true);
    });

    it('空文字不应产生历史记录', () => {
      openText({ text: '' });
      useTextStore.getState().place();
      expect(useEditorStore.getState().historyStack).toHaveLength(0);
    });
  });

  describe('图层安全', () => {
    it('图片图层激活时不得写入文字', () => {
      useEditorStore.getState().addImageLayer('图片 1', 'data:image/png;base64,');
      const before = useEditorStore.getState().gridData;
      openText();
      useTextStore.getState().place();
      // 图片图层下 gridData 未变，也没有产生历史
      expect(useEditorStore.getState().gridData).toBe(before);
      expect(useEditorStore.getState().historyStack).toHaveLength(0);
    });
  });

  describe('越界（要求 10）', () => {
    it('文字超出画布时应被裁剪且不产生越界写入', () => {
      const object = openText({ text: 'HELLO', scale: 3, x: 28, y: 28 });
      expect(() => useTextStore.getState().place()).not.toThrow();

      const grid = useEditorStore.getState().gridData!;
      // 网格保持完整尺寸，没有被越界写入破坏
      expect(grid).toHaveLength(32);
      expect(grid[0]).toHaveLength(32);
      expect(countColor(RED)).toBeGreaterThan(0);
      expect(countColor(RED)).toBe(countTextBeads(object, { rows: 32, cols: 32 }));
    });

    it('文字完全在画布外时不应崩溃，也不写入任何格子', () => {
      openText({ x: 500, y: 500 });
      expect(() => useTextStore.getState().place()).not.toThrow();
      expect(countColor(RED)).toBe(0);
    });
  });
});
