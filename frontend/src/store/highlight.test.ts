/**
 * 高亮配豆模式测试
 *
 * 对应「豆豆你呀」的高亮功能，但在 CC-PinDou 里是基于 gridData 的精确 hex 比对，
 * 不走颜色距离阈值，因此命中必须 100% 准确、不能误匹配相近色。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useHighlightStore,
  summarizeHighlight,
  summarizeProgress,

} from './useHighlightStore';
import { drawHighlightOverlay } from '../hooks/useCanvasRenderer';
import type { GridCell } from '../types/perler';

const RED = '#FF0000';
const NEAR_RED = '#FE0000'; // 与红色极接近，但必须视为不同色号
const BLUE = '#0000FF';

function resetStore() {
  // 直接调用 store 自带的 reset，避免漏字段导致测试间状态泄漏
  useHighlightStore.getState().reset();
}

function makeGrid(rows: number, cols: number, colors: (x: number, y: number) => string): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < cols; x++) {
      row.push({ x, y, color: colors(x, y), codes: {} });
    }
    grid.push(row);
  }
  return grid;
}

describe('useHighlightStore', () => {
  beforeEach(resetStore);

  it('选中色号后自动开启，取消最后一个后自动关闭', () => {
    const s = useHighlightStore.getState();
    expect(s.enabled).toBe(false);

    s.toggleHex(RED);
    expect(useHighlightStore.getState().enabled).toBe(true);
    expect(useHighlightStore.getState().hexes).toEqual([RED]);

    // 再选一个：多色号
    useHighlightStore.getState().toggleHex(BLUE);
    expect(useHighlightStore.getState().hexes).toEqual([RED, BLUE]);

    // 取消一个仍开启
    useHighlightStore.getState().toggleHex(RED);
    expect(useHighlightStore.getState().enabled).toBe(true);

    // 取消最后一个 → 自动关闭，避免整屏全灰
    useHighlightStore.getState().toggleHex(BLUE);
    expect(useHighlightStore.getState().hexes).toEqual([]);
    expect(useHighlightStore.getState().enabled).toBe(false);
  });

  it('未选任何色号时不允许开启（避免“开了却没效果”）', () => {
    useHighlightStore.getState().setEnabled(true);
    expect(useHighlightStore.getState().enabled).toBe(false);
  });

  it('压暗程度应被限制在 0-95', () => {
    const s = useHighlightStore.getState();
    s.setDimStrength(-20);
    expect(useHighlightStore.getState().dimStrength).toBe(0);
    useHighlightStore.getState().setDimStrength(200);
    expect(useHighlightStore.getState().dimStrength).toBe(95);
    useHighlightStore.getState().setDimStrength(NaN);
    expect(useHighlightStore.getState().dimStrength).toBe(95); // 非法值被忽略
  });

  it('prune 应移除已不存在的颜色，并在清空后关闭', () => {
    useHighlightStore.getState().setHexes([RED, BLUE]);
    expect(useHighlightStore.getState().enabled).toBe(true);

    useHighlightStore.getState().prune([RED]);
    expect(useHighlightStore.getState().hexes).toEqual([RED]);
    expect(useHighlightStore.getState().enabled).toBe(true);

    useHighlightStore.getState().prune([]);
    expect(useHighlightStore.getState().hexes).toEqual([]);
    expect(useHighlightStore.getState().enabled).toBe(false);
  });

  it('clearHexes 应清空并关闭', () => {
    useHighlightStore.getState().setHexes([RED]);
    useHighlightStore.getState().clearHexes();
    expect(useHighlightStore.getState().hexes).toEqual([]);
    expect(useHighlightStore.getState().enabled).toBe(false);
  });
});

describe('summarizeHighlight', () => {
  it('应精确统计命中数量，且不把相近色算进去', () => {
    // 3x3：4 个红、2 个近红、2 个蓝、1 个透明
    const grid = makeGrid(3, 3, (x, y) => {
      if (x === 0 && y === 0) return 'transparent';
      if (y === 0) return RED;          // (1,0) (2,0)
      if (y === 1 && x < 2) return RED; // (0,1) (1,1)
      if (y === 1) return NEAR_RED;     // (2,1)
      if (y === 2 && x < 2) return NEAR_RED;
      return BLUE;
    });

    const red = summarizeHighlight(grid, [RED]);
    expect(red.total).toBe(4);
    expect(red.counts[RED]).toBe(4);
    // 关键：极接近的 #FE0000 绝不能被算作 #FF0000
    expect(red.counts[NEAR_RED]).toBeUndefined();

    // RED 4 颗 + BLUE 1 颗 = 5（NEAR_RED 3 颗与透明 1 格都不计）
    const both = summarizeHighlight(grid, [RED, BLUE]);
    expect(both.total).toBe(5);
    expect(both.counts[RED]).toBe(4);
    expect(both.counts[BLUE]).toBe(1);
  });

  it('空网格或未选色号时返回 0', () => {
    expect(summarizeHighlight(null, [RED])).toEqual({ total: 0, counts: {} });
    expect(summarizeHighlight(makeGrid(2, 2, () => RED), [])).toEqual({ total: 0, counts: {} });
  });
});

/** 记录 drawImage / fillRect / stroke 调用的假 canvas 上下文 */
function createMockCtx() {
  const strokes: Array<{ moveTo: number[]; lineTo: number[] }> = [];
  let current: { moveTo: number[]; lineTo: number[] } | null = null;
  const fillRects: number[][] = [];
  const drawn: Array<{ x: number; y: number }> = [];

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => {
      current = null;
    }),
    moveTo: vi.fn((x: number, y: number) => {
      current = { moveTo: [x, y], lineTo: [] };
      strokes.push(current);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      if (current) current.lineTo = [x, y];
    }),
    stroke: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRects.push([x, y, w, h]);
    }),
    drawImage: vi.fn((_img: unknown, x: number, y: number) => {
      drawn.push({ x, y });
    }),
    fillText: vi.fn(),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineJoin(_v: string) {},
    globalAlpha: 1,
  };
  return { ctx, fillRects, strokes, drawn };
}

describe('drawHighlightOverlay', () => {
  const baseOptions = {
    rows: 3,
    cols: 3,
    beadSize: 10,
    margin: 0,
    dimStrength: 80,
    circleMode: false,
    showCode: false,
    brand: 'MARD',
    getBrightness: () => 100,
    getCircleBeadCanvas: () =>
      ({ width: 10, height: 10 }) as unknown as HTMLCanvasElement,
  };

  it('应先铺压暗蒙版，再只重画命中的格子', () => {
    const grid = makeGrid(3, 3, (x, y) => (x === 0 && y === 0 ? RED : BLUE));
    const { ctx, fillRects, drawn } = createMockCtx();

    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: grid,
      hexes: [RED],
      outline: false,
    });

    // 压暗蒙版铺满整个画布区域
    expect(fillRects).toContainEqual([0, 0, 30, 30]);
    // 只有 1 个命中格被重画（方形模式用 fillRect）
    const hitPaints = fillRects.filter(([, , w, h]) => w === 10 && h === 10);
    expect(hitPaints).toHaveLength(1);
    expect(hitPaints[0]).toEqual([0, 0, 10, 10]);
    expect(drawn).toHaveLength(0);
  });

  it('圆形模式下命中格应改用 drawImage 绘制圆豆', () => {
    const grid = makeGrid(2, 2, () => RED);
    const { ctx, drawn } = createMockCtx();

    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      rows: 2,
      cols: 2,
      gridData: grid,
      hexes: [RED],
      outline: false,
      circleMode: true,
    });

    expect(drawn).toHaveLength(4);
  });

  it('压暗程度为 0 时不应铺蒙版', () => {
    const grid = makeGrid(2, 2, () => RED);
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      rows: 2,
      cols: 2,
      gridData: grid,
      hexes: [RED],
      dimStrength: 0,
      outline: false,
    });
    expect(fillRects).not.toContainEqual([0, 0, 20, 20]);
  });

  it('描边只画区域外轮廓，不逐格画方框', () => {
    // 2x2 全部命中 → 作为一个整体，只有外圈 8 条边
    const solid = makeGrid(2, 2, () => RED);
    const { ctx, strokes } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      rows: 2,
      cols: 2,
      gridData: solid,
      hexes: [RED],
      outline: true,
    });
    // 2x2 实心块的外轮廓 = 8 条单位边
    expect(strokes).toHaveLength(8);

    // 单个孤立格子 → 4 条边
    const single = makeGrid(3, 3, (x, y) => (x === 1 && y === 1 ? RED : BLUE));
    const second = createMockCtx();
    drawHighlightOverlay(second.ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: single,
      hexes: [RED],
      outline: true,
    });
    expect(second.strokes).toHaveLength(4);
  });

  it('未命中任何格子时不应重画任何豆子', () => {
    const grid = makeGrid(2, 2, () => BLUE);
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      rows: 2,
      cols: 2,
      gridData: grid,
      hexes: [RED],
      outline: true,
    });
    expect(fillRects.filter(([, , w, h]) => w === 10 && h === 10)).toHaveLength(0);
  });

  it('相近色不能被误判为命中（无需颜色阈值）', () => {
    const grid = makeGrid(1, 2, (x) => (x === 0 ? RED : NEAR_RED));
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      rows: 1,
      cols: 2,
      gridData: grid,
      hexes: [RED],
      outline: false,
    });
    const painted = fillRects.filter(([, , w, h]) => w === 10 && h === 10);
    expect(painted).toHaveLength(1);
    expect(painted[0]).toEqual([0, 0, 10, 10]); // 只有 #FF0000 那一格
  });
});

describe('useHighlightStore / 逐色配豆进度', () => {
  beforeEach(resetStore);

  it('toggleDone 应切换某色号的完成状态', () => {
    const s = useHighlightStore.getState();
    expect(s.doneHexes).toEqual([]);
    s.toggleDone(RED);
    expect(useHighlightStore.getState().doneHexes).toEqual([RED]);
    useHighlightStore.getState().toggleDone(BLUE);
    expect(useHighlightStore.getState().doneHexes).toEqual([RED, BLUE]);
    // 再点一次取消
    useHighlightStore.getState().toggleDone(RED);
    expect(useHighlightStore.getState().doneHexes).toEqual([BLUE]);
  });

  it('marking done 不应影响高亮选择', () => {
    useHighlightStore.getState().toggleHex(RED);
    useHighlightStore.getState().toggleDone(RED);
    expect(useHighlightStore.getState().hexes).toEqual([RED]);
    expect(useHighlightStore.getState().enabled).toBe(true);
    expect(useHighlightStore.getState().doneHexes).toEqual([RED]);
  });

  it('clearDone 应清空进度但保留高亮', () => {
    useHighlightStore.getState().setHexes([RED]);
    useHighlightStore.getState().setDoneHexes([RED, BLUE]);
    useHighlightStore.getState().clearDone();
    expect(useHighlightStore.getState().doneHexes).toEqual([]);
    expect(useHighlightStore.getState().hexes).toEqual([RED]);
  });

  it('prune 应同时清理高亮与进度中已不存在的色号', () => {
    useHighlightStore.getState().setHexes([RED, BLUE]);
    useHighlightStore.getState().setDoneHexes([RED, BLUE]);
    useHighlightStore.getState().prune([RED]);
    expect(useHighlightStore.getState().hexes).toEqual([RED]);
    expect(useHighlightStore.getState().doneHexes).toEqual([RED]);
  });

  it('隐藏已配完默认开启', () => {
    expect(useHighlightStore.getState().hideDone).toBe(true);
    useHighlightStore.getState().setHideDone(false);
    expect(useHighlightStore.getState().hideDone).toBe(false);
  });
});

describe('summarizeProgress', () => {
  const colorList = [
    { hex: RED, count: 100 },
    { hex: BLUE, count: 50 },
    { hex: NEAR_RED, count: 50 },
  ];

  it('应按豆数统计进度', () => {
    const p = summarizeProgress(colorList, []);
    expect(p.totalColors).toBe(3);
    expect(p.totalBeads).toBe(200);
    expect(p.doneColors).toBe(0);
    expect(p.percent).toBe(0);

    const half = summarizeProgress(colorList, [RED]);
    expect(half.doneColors).toBe(1);
    expect(half.doneBeads).toBe(100);
    expect(half.percent).toBe(50);

    const all = summarizeProgress(colorList, [RED, BLUE, NEAR_RED]);
    expect(all.doneColors).toBe(3);
    expect(all.doneBeads).toBe(200);
    expect(all.percent).toBe(100);
  });

  it('进度中已不存在的色号不应计入', () => {
    const p = summarizeProgress(colorList, ['#123456']);
    expect(p.doneColors).toBe(0);
    expect(p.doneBeads).toBe(0);
  });

  it('空配色不应除以零', () => {
    const p = summarizeProgress([], [RED]);
    expect(p.totalBeads).toBe(0);
    expect(p.percent).toBe(0);
    expect(summarizeProgress(null, []).percent).toBe(0);
  });
});

describe('drawHighlightOverlay / 隐藏已配完的色号', () => {
  const baseOptions = {
    rows: 2,
    cols: 2,
    beadSize: 10,
    margin: 0,
    dimStrength: 80,
    circleMode: false,
    showCode: false,
    brand: 'MARD',
    getBrightness: () => 100,
    getCircleBeadCanvas: () => ({ width: 10, height: 10 }) as unknown as HTMLCanvasElement,
  };

  it('hideDone 应给已配完的格子盖近白蒙版', () => {
    const grid = makeGrid(2, 2, (x) => (x === 0 ? RED : BLUE));
    const { ctx, fillRects } = createMockCtx();

    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: grid,
      hexes: [],
      doneHexes: [RED],
      hideDone: true,
      outline: false,
    });

    // 左侧两个红格被隐藏（10x10 的近白蒙版），蓝格不受影响
    const hidden = fillRects.filter(([, , w, h]) => w === 10 && h === 10);
    expect(hidden).toHaveLength(2);
    expect(hidden).toContainEqual([0, 0, 10, 10]);
    expect(hidden).toContainEqual([0, 10, 10, 10]);
  });

  it('hideDone 关闭时不应隐藏任何格子', () => {
    const grid = makeGrid(2, 2, () => RED);
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: grid,
      hexes: [],
      doneHexes: [RED],
      hideDone: false,
      outline: false,
    });
    expect(fillRects.filter(([, , w, h]) => w === 10 && h === 10)).toHaveLength(0);
  });

  it('隐藏已配完时不开启高亮，也不应整片压暗', () => {
    const grid = makeGrid(2, 2, () => BLUE);
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: grid,
      hexes: [],           // 没有高亮选择
      doneHexes: [RED],
      hideDone: true,
      outline: false,
    });
    // 没有命中任何已配完的格子 → 不应有任何绘制
    expect(fillRects).toHaveLength(0);
  });

  it('已配完的色号即使被高亮也不应被重画（交由隐藏处理）', () => {
    const grid = makeGrid(2, 2, () => RED);
    const { ctx, fillRects } = createMockCtx();
    drawHighlightOverlay(ctx as unknown as CanvasRenderingContext2D, {
      ...baseOptions,
      gridData: grid,
      hexes: [RED],
      doneHexes: [RED],
      hideDone: true,
      outline: false,
    });
    // 4 个格子都应是「隐藏蒙版」而不是「高亮重画」；
    // 两者尺寸相同，靠填充色区分不了，这里用调用次数判断：
    // 整片压暗 1 次 + 4 次隐藏蒙版 = 5 次 fillRect，且不含高亮重画额外的 4 次
    expect(fillRects).toHaveLength(5);
    expect(fillRects[0]).toEqual([0, 0, 20, 20]); // 整片压暗
  });
});
