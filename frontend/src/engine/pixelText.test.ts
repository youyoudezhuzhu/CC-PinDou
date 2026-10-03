import { describe, it, expect } from 'vitest';
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  createTextObject,
  isTextOutOfBounds,
  normalizeScale,
  textObjectPixelSize,
  textObjectSize,
  textObjectToCells,
  countTextBeads,
} from './pixelText';
import { renderTextToMatrix, countMatrixPixels, PIXEL_FONT_5X7 } from './pixelFont';
import type { TextObject } from '../types/perler';

const BOUNDS = { rows: 64, cols: 64 };

function makeText(overrides: Partial<TextObject> = {}): TextObject {
  return createTextObject({
    text: 'HELLO',
    x: 0,
    y: 0,
    scale: 1,
    color: '#FF0000',
    codes: { MARD: 'A01' },
    ...overrides,
  });
}

/** 把格子集合转换为便于比较的 Set */
function cellSet(cells: Array<{ x: number; y: number }>): Set<string> {
  return new Set(cells.map((c) => `${c.x},${c.y}`));
}

describe('pixelText / 倍数规范化', () => {
  it('应把各种非法输入收敛到合法整数区间', () => {
    expect(normalizeScale(0)).toBe(MIN_TEXT_SCALE);
    expect(normalizeScale(-5)).toBe(MIN_TEXT_SCALE);
    expect(normalizeScale(2.4)).toBe(2);
    expect(normalizeScale(2.6)).toBe(3);
    expect(normalizeScale(999)).toBe(MAX_TEXT_SCALE);
    expect(normalizeScale(NaN)).toBe(MIN_TEXT_SCALE);
    expect(normalizeScale(Infinity)).toBe(MIN_TEXT_SCALE);
  });
});

describe('pixelText / 真实拼豆缩放（要求 3）', () => {
  it('HELLO 1× 的拼豆数等于点阵落豆数（1 个像素 = 1 颗豆）', () => {
    const matrix = renderTextToMatrix('HELLO', PIXEL_FONT_5X7);
    const expected = countMatrixPixels(matrix);
    const object = makeText({ scale: 1 });
    expect(countTextBeads(object)).toBe(expected);
    expect(expected).toBe(73);
  });

  it('HELLO 2× 应变成 2×2 颗真实拼豆（数量 ×4）', () => {
    const base = countTextBeads(makeText({ scale: 1 }));
    const doubled = countTextBeads(makeText({ scale: 2 }));
    expect(doubled).toBe(base * 4);
    expect(doubled).toBe(292);
  });

  it('HELLO 3× 应变成 3×3 颗真实拼豆（数量 ×9）', () => {
    const base = countTextBeads(makeText({ scale: 1 }));
    const tripled = countTextBeads(makeText({ scale: 3 }));
    expect(tripled).toBe(base * 9);
    expect(tripled).toBe(657);
  });

  it('2× 时每个落豆像素必须展开成完整且不重叠的 2×2 方块', () => {
    const object = makeText({ scale: 2 });
    const cells = textObjectToCells(object);
    const occupied = cellSet(cells);

    // 无重复格子
    expect(occupied.size).toBe(cells.length);

    // 每个原始落豆像素对应一个完整的 2×2 方块
    const oneX = cellSet(textObjectToCells(makeText({ scale: 1 })));
    const origins = new Set<string>();
    for (const cell of cells) {
      const ox = Math.floor(cell.x / 2) * 2;
      const oy = Math.floor(cell.y / 2) * 2;
      origins.add(`${ox},${oy}`);
      // 该 2×2 方块必须完整
      for (const dy of [0, 1]) {
        for (const dx of [0, 1]) {
          expect(occupied.has(`${ox + dx},${oy + dy}`), `缺少 ${ox + dx},${oy + dy}`).toBe(true);
        }
      }
    }
    // 方块数量 == 原始像素数量
    expect(origins.size).toBe(oneX.size);
  });

  it('3× 时占用格数正好是 1× 的 9 倍，且外接矩形也是 3 倍', () => {
    const one = textObjectToCells(makeText({ scale: 1 }));
    const three = textObjectToCells(makeText({ scale: 3 }));
    expect(three.length).toBe(one.length * 9);
    expect(textObjectSize(makeText({ scale: 3 }))).toEqual({
      width: textObjectSize(makeText({ scale: 1 })).width * 3,
      height: textObjectSize(makeText({ scale: 1 })).height * 3,
    });
  });

  it('textObjectSize 返回真实占用的拼豆格数', () => {
    // HELLO 点阵 29×7
    expect(textObjectPixelSize(makeText())).toEqual({ width: 29, height: 7 });
    expect(textObjectSize(makeText({ scale: 1 }))).toEqual({ width: 29, height: 7 });
    expect(textObjectSize(makeText({ scale: 2 }))).toEqual({ width: 58, height: 14 });
    expect(textObjectSize(makeText({ scale: 3 }))).toEqual({ width: 87, height: 21 });
  });
});

describe('pixelText / 背景透明（要求 6）', () => {
  it('位图中的 0 不产生任何格子', () => {
    const object = makeText({ text: 'A', scale: 1 });
    const cells = textObjectToCells(object);
    // 'A' 的 5×7 点阵里 0 的位置绝不能出现在格子集合中
    const matrix = renderTextToMatrix('A', PIXEL_FONT_5X7);
    const occupied = cellSet(cells);
    for (let y = 0; y < matrix.height; y++) {
      for (let x = 0; x < matrix.width; x++) {
        if (matrix.bits[y][x]) continue;
        expect(occupied.has(`${x},${y}`), `(${x},${y}) 是 0 位，不应落豆`).toBe(false);
      }
    }
  });

  it('空格不产生任何拼豆', () => {
    expect(countTextBeads(makeText({ text: '   ', scale: 1 }))).toBe(0);
    expect(countTextBeads(makeText({ text: '', scale: 1 }))).toBe(0);
  });
});

describe('pixelText / 边界处理（要求 10）', () => {
  it('超出画布的部分应被裁剪，且不产生越界坐标', () => {
    const object = makeText({ text: 'HELLO', scale: 2, x: 60, y: 60 });
    const cells = textObjectToCells(object, BOUNDS);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(BOUNDS.cols);
      expect(cell.y).toBeLessThan(BOUNDS.rows);
    }
  });

  it('负坐标（左上越界）同样只返回画布内的格子', () => {
    const object = makeText({ text: 'HELLO', scale: 1, x: -3, y: -2 });
    const cells = textObjectToCells(object, BOUNDS);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('完全在画布外时应返回空数组而不抛异常', () => {
    expect(textObjectToCells(makeText({ x: 500, y: 500 }), BOUNDS)).toEqual([]);
    expect(textObjectToCells(makeText({ x: -100, y: -100 }), BOUNDS)).toEqual([]);
  });

  it('isTextOutOfBounds 应正确判断是否越界', () => {
    expect(isTextOutOfBounds(makeText({ x: 0, y: 0 }), BOUNDS)).toBe(false);
    expect(isTextOutOfBounds(makeText({ x: 40, y: 0 }), BOUNDS)).toBe(true); // 40 + 29 > 64
    expect(isTextOutOfBounds(makeText({ x: -1, y: 0 }), BOUNDS)).toBe(true);
    expect(isTextOutOfBounds(makeText({ x: 0, y: -1 }), BOUNDS)).toBe(true);
    expect(isTextOutOfBounds(makeText({ x: 0, y: 60 }), BOUNDS)).toBe(true); // 60 + 7 > 64
  });

  it('锚点小数会被取整，保证严格对齐网格', () => {
    const cells = textObjectToCells(makeText({ x: 1.7, y: 2.2, text: 'A' }));
    for (const cell of cells) {
      expect(Number.isInteger(cell.x)).toBe(true);
      expect(Number.isInteger(cell.y)).toBe(true);
      expect(cell.x).toBeGreaterThanOrEqual(Math.round(1.7));
      expect(cell.y).toBeGreaterThanOrEqual(Math.round(2.2));
    }
  });
});

describe('pixelText / createTextObject', () => {
  it('应带有 type=text 与稳定的默认值', () => {
    const object = createTextObject();
    expect(object.type).toBe('text');
    expect(object.font).toBe('pixel-5x7');
    expect(object.scale).toBe(1);
    expect(Number.isInteger(object.x)).toBe(true);
    expect(Number.isInteger(object.y)).toBe(true);
    expect(object.id).toMatch(/^text-/);
  });

  it('应规范化传入的非法倍数与小数坐标', () => {
    const object = createTextObject({ scale: 0, x: 3.6, y: 4.2 });
    expect(object.scale).toBe(1);
    expect(object.x).toBe(4);
    expect(object.y).toBe(4);
  });
});

