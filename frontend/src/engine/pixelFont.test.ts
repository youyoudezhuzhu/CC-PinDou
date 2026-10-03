import { describe, it, expect } from 'vitest';
import {
  PIXEL_FONT_5X7,
  DEFAULT_PIXEL_FONT_ID,
  getPixelFont,
  getGlyph,
  hasGlyph,
  listPixelFonts,
  parseGlyph,
  renderTextToMatrix,
  countMatrixPixels,
} from './pixelFont';

describe('pixelFont / 字形解析', () => {
  it('parseGlyph 应解析出正确的宽高与位图', () => {
    const glyph = parseGlyph('01110/10001/10001/11111/10001/10001/10001');
    expect(glyph.width).toBe(5);
    expect(glyph.height).toBe(7);
    expect(glyph.rows).toHaveLength(7);
    expect(glyph.rows[0]).toBe('01110');
    expect(glyph.rows[3]).toBe('11111');
  });

  it('parseGlyph 应把不足宽度的行补齐，避免索引到 undefined', () => {
    const glyph = parseGlyph('1/111');
    expect(glyph.width).toBe(3);
    expect(glyph.rows).toEqual(['100', '111']);
  });

  it('缺字时应回退到兜底字形', () => {
    const glyph = getGlyph(PIXEL_FONT_5X7, '𠀀');
    expect(glyph).toBe(PIXEL_FONT_5X7.fallback);
  });

  it('大小写折叠：无小写字形时回退到大写', () => {
    const font = {
      ...PIXEL_FONT_5X7,
      glyphs: { A: PIXEL_FONT_5X7.glyphs.A },
    };
    expect(getGlyph(font, 'a').rows).toEqual(PIXEL_FONT_5X7.glyphs.A.rows);
  });

  it('hasGlyph 应正确判断字符是否可渲染', () => {
    expect(hasGlyph(PIXEL_FONT_5X7, 'A')).toBe(true);
    expect(hasGlyph(PIXEL_FONT_5X7, 'z')).toBe(true);
    expect(hasGlyph(PIXEL_FONT_5X7, '7')).toBe(true);
    expect(hasGlyph(PIXEL_FONT_5X7, '#')).toBe(true);
    expect(hasGlyph(PIXEL_FONT_5X7, '\n')).toBe(true);
    expect(hasGlyph(PIXEL_FONT_5X7, '𠀀')).toBe(false);
  });

  it('getPixelFont：未知 id 回退到默认字体，保证旧工程可渲染', () => {
    expect(getPixelFont('不存在的字体').id).toBe(DEFAULT_PIXEL_FONT_ID);
    expect(getPixelFont(undefined).id).toBe(DEFAULT_PIXEL_FONT_ID);
    expect(getPixelFont('pixel-5x7').id).toBe('pixel-5x7');
  });

  it('listPixelFonts 至少包含内置 5×7 字体', () => {
    expect(listPixelFonts().some((font) => font.id === DEFAULT_PIXEL_FONT_ID)).toBe(true);
  });

  it('字库应覆盖 A-Z a-z 0-9 与常用符号', () => {
    const missing: string[] = [];
    for (let c = 0x20; c <= 0x7e; c++) {
      const char = String.fromCharCode(c);
      if (!PIXEL_FONT_5X7.glyphs[char]) missing.push(char);
    }
    expect(missing).toEqual([]);
  });

  it('每个字形都必须是 5×7 的点阵', () => {
    for (const [char, glyph] of Object.entries(PIXEL_FONT_5X7.glyphs)) {
      expect(glyph.height, `字形 ${char} 高度`).toBe(7);
      for (const row of glyph.rows) {
        expect(row.length, `字形 ${char} 行宽`).toBeGreaterThan(0);
        expect(/^[01]+$/.test(row), `字形 ${char} 只应含 0/1`).toBe(true);
      }
    }
  });
});

describe('pixelFont / 文字排版', () => {
  it('A 的点阵应与任务书给出的示例一致', () => {
    const matrix = renderTextToMatrix('A', PIXEL_FONT_5X7);
    expect(matrix.bits.map((row) => row.map((b) => (b ? '1' : '0')).join(''))).toEqual([
      '01110',
      '10001',
      '10001',
      '11111',
      '10001',
      '10001',
      '10001',
    ]);
  });

  it('空字符串应得到 0 宽矩阵', () => {
    const matrix = renderTextToMatrix('', PIXEL_FONT_5X7);
    expect(matrix.width).toBe(0);
  });

  it('多字符排版宽度 = 字形数 × (5 + 字距) - 字距', () => {
    const matrix = renderTextToMatrix('HELLO', PIXEL_FONT_5X7);
    // 5 个字符：5×5 + 4×1 = 29
    expect(matrix.width).toBe(29);
    expect(matrix.height).toBe(7);
  });

  it('HELLO 的落豆总数为 73', () => {
    expect(countMatrixPixels(renderTextToMatrix('HELLO', PIXEL_FONT_5X7))).toBe(73);
  });

  it('支持换行，行间距插入空行', () => {
    const matrix = renderTextToMatrix('A\nA', PIXEL_FONT_5X7);
    expect(matrix.height).toBe(7 + 1 + 7);
    // 中间的空行不应有任何落豆
    const middle = matrix.bits[7];
    expect(middle.every((bit) => bit === false)).toBe(true);
  });

  it('忽略行尾空白，不产生多余的空白列', () => {
    const withSpace = renderTextToMatrix('A ', PIXEL_FONT_5X7);
    const without = renderTextToMatrix('A', PIXEL_FONT_5X7);
    expect(withSpace.width).toBe(without.width);
  });
});
