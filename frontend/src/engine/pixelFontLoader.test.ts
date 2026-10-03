import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  CJK_PIXEL_FONT_META,
  decodePackedFont,
  loadCjkPixelFont,
  isCjkFontLoaded,
  __resetCjkFontCache,
} from './pixelFontLoader';
import { getPixelFont, renderTextToMatrix, DEFAULT_PIXEL_FONT_ID } from './pixelFont';

/** 按 CPXF v1 格式手工构造一份测试数据 */
function buildPackedFont(
  glyphs: Array<{ codepoint: number; advance: number; grid: string[] }>,
  cellW = 12,
  cellH = 12,
): ArrayBuffer {
  const bitmapBytes = Math.ceil((cellW * cellH) / 8);
  const recordSize = 2 + 1 + 1 + bitmapBytes;
  const buffer = new ArrayBuffer(9 + glyphs.length * recordSize);
  const bytes = new Uint8Array(buffer);

  bytes[0] = 'C'.charCodeAt(0);
  bytes[1] = 'P'.charCodeAt(0);
  bytes[2] = 'X'.charCodeAt(0);
  bytes[3] = 'F'.charCodeAt(0);
  bytes[4] = 1;
  bytes[5] = cellW;
  bytes[6] = cellH;
  bytes[7] = glyphs.length & 0xff;
  bytes[8] = (glyphs.length >> 8) & 0xff;

  let offset = 9;
  for (const glyph of glyphs) {
    bytes[offset] = glyph.codepoint & 0xff;
    bytes[offset + 1] = (glyph.codepoint >> 8) & 0xff;
    bytes[offset + 2] = glyph.advance;
    bytes[offset + 3] = 0;
    const base = offset + 4;
    for (let y = 0; y < cellH; y++) {
      const row = glyph.grid[y] ?? '';
      for (let x = 0; x < cellW; x++) {
        if (row[x] !== '1') continue;
        const bitIndex = y * cellW + x;
        bytes[base + (bitIndex >> 3)] |= 0x80 >> (bitIndex & 7);
      }
    }
    offset += recordSize;
  }
  return buffer;
}

describe('pixelFontLoader / CPXF 解码', () => {
  it('应正确解码字形位图与步进宽度', () => {
    const grid = [
      '111111111111',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '100000000001',
      '111111111111',
    ];
    const buffer = buildPackedFont([{ codepoint: 0x56fe, advance: 12, grid }]);
    const font = decodePackedFont(buffer, CJK_PIXEL_FONT_META);

    expect(font.id).toBe(CJK_PIXEL_FONT_META.id);
    expect(font.glyphHeight).toBe(12);
    const glyph = font.glyphs['图'];
    expect(glyph).toBeDefined();
    expect(glyph.width).toBe(12);
    expect(glyph.height).toBe(12);
    expect(glyph.advance).toBe(12);
    expect(glyph.rows[0]).toBe('111111111111');
    expect(glyph.rows[1]).toBe('100000000001');
    expect(glyph.rows[11]).toBe('111111111111');
    // 0 位必须解成 '0'
    expect(glyph.rows[5]).toBe('100000000001');
  });

  it('半宽字形（西文）应只保留步进宽度内的列', () => {
    const grid = Array.from({ length: 12 }, () => '111111' + '000000');
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid }]);
    const font = decodePackedFont(buffer, CJK_PIXEL_FONT_META);
    const glyph = font.glyphs['A'];
    expect(glyph.width).toBe(6);
    expect(glyph.advance).toBe(6);
    expect(glyph.rows[0]).toBe('111111');
  });

  it('magic 不正确时应报错', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    new Uint8Array(buffer)[0] = 'X'.charCodeAt(0);
    expect(() => decodePackedFont(buffer, CJK_PIXEL_FONT_META)).toThrow(/格式不正确/);
  });

  it('数据长度不足时应报错而不是静默越界', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    const truncated = buffer.slice(0, 12);
    expect(() => decodePackedFont(truncated, CJK_PIXEL_FONT_META)).toThrow(/不完整|损坏/);
  });

  it('不支持的版本号应报错', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    new Uint8Array(buffer)[4] = 99;
    expect(() => decodePackedFont(buffer, CJK_PIXEL_FONT_META)).toThrow(/版本/);
  });

  it('缺字应回退到兜底方框字形', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    const font = decodePackedFont(buffer, CJK_PIXEL_FONT_META);
    expect(font.glyphs['𠀀']).toBeUndefined();
    expect(font.fallback.rows[0]).toBe('1'.repeat(12));
  });

  it('中文与西文混排时按各自步进宽度对齐', () => {
    const buffer = buildPackedFont([
      { codepoint: 0x41, advance: 6, grid: Array.from({ length: 12 }, () => '111111000000') },
      { codepoint: 0x56fe, advance: 12, grid: Array.from({ length: 12 }, () => '111111111111') },
    ]);
    const font = decodePackedFont(buffer, CJK_PIXEL_FONT_META);
    // 'A' 步进 6 + '图' 步进 12 = 18
    expect(renderTextToMatrix('A图', font).width).toBe(18);
  });
});

describe('pixelFontLoader / 按需加载', () => {
  beforeEach(() => {
    __resetCjkFontCache();
  });

  it('默认字体不依赖中文点阵数据（首屏保持轻量）', () => {
    expect(getPixelFont(undefined).id).toBe(DEFAULT_PIXEL_FONT_ID);
    expect(isCjkFontLoaded()).toBe(false);
  });

  it('数据文件存在且能被真实解码（回归保护）', () => {
    const binPath = path.resolve(__dirname, '../../public/fonts/pixel-12-zh-hans.bin');
    if (!existsSync(binPath)) {
      // 未生成字体数据（例如未执行 build:cjk-font）时跳过，避免 CI 误报
      return;
    }
    const raw = readFileSync(binPath);
    const font = decodePackedFont(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      CJK_PIXEL_FONT_META,
    );
    // 常用字必须有
    for (const char of ['拼', '豆', '图', '纸', 'A', '1']) {
      expect(font.glyphs[char], `缺少字形 ${char}`).toBeDefined();
    }
    // 「豆」的位图不应为空白
    const dou = font.glyphs['豆'];
    expect(dou.rows.join('')).toMatch(/1/);
    // 汉字的实际笔迹必须是设计好的点阵，而不是糊成一团
    const inkCount = dou.rows.join('').split('1').length - 1;
    expect(inkCount).toBeGreaterThan(20);
    expect(inkCount).toBeLessThan(144);
  });

  it('重复调用 loadCjkPixelFont 应复用同一个 Promise（不重复下载）', async () => {
    const fake = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => fake,
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const [a, b] = await Promise.all([loadCjkPixelFont(), loadCjkPixelFont()]);
      expect(calls).toBe(1);
      expect(a).toBe(b);
      expect(isCjkFontLoaded()).toBe(true);
      // 加载后应已注册到字体表
      expect(getPixelFont(CJK_PIXEL_FONT_META.id).id).toBe(CJK_PIXEL_FONT_META.id);

      // 已经加载过：再次调用不应再发请求
      await loadCjkPixelFont();
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('加载失败时应抛出可读错误并允许重试', async () => {
    const originalFetch = globalThis.fetch;
    let attempt = 0;
    globalThis.fetch = (async () => {
      attempt++;
      if (attempt === 1) return { ok: false, status: 404 } as unknown as Response;
      const fake = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
      return { ok: true, status: 200, arrayBuffer: async () => fake } as unknown as Response;
    }) as typeof fetch;

    try {
      await expect(loadCjkPixelFont()).rejects.toThrow(/404/);
      // 失败后缓存被清理，重试应成功
      await expect(loadCjkPixelFont()).resolves.toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
