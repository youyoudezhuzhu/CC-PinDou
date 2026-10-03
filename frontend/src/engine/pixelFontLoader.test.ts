import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  PACKED_PIXEL_FONTS,
  getPackedFontMeta,
  decodePackedFont,
  loadPixelFont,
  isPixelFontLoaded,
  __resetPackedFontCache,
} from './pixelFontLoader';

/** 测试统一使用 12px 等宽字体作为样本 */
const CJK_META = getPackedFontMeta('pixel-12-fusion-mono')!;
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
    const font = decodePackedFont(buffer, CJK_META);

    expect(font.id).toBe(CJK_META.id);
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
    const font = decodePackedFont(buffer, CJK_META);
    const glyph = font.glyphs['A'];
    expect(glyph.width).toBe(6);
    expect(glyph.advance).toBe(6);
    expect(glyph.rows[0]).toBe('111111');
  });

  it('magic 不正确时应报错', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    new Uint8Array(buffer)[0] = 'X'.charCodeAt(0);
    expect(() => decodePackedFont(buffer, CJK_META)).toThrow(/格式不正确/);
  });

  it('数据长度不足时应报错而不是静默越界', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    const truncated = buffer.slice(0, 12);
    expect(() => decodePackedFont(truncated, CJK_META)).toThrow(/不完整|损坏/);
  });

  it('不支持的版本号应报错', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    new Uint8Array(buffer)[4] = 99;
    expect(() => decodePackedFont(buffer, CJK_META)).toThrow(/版本/);
  });

  it('缺字应回退到兜底方框字形', () => {
    const buffer = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    const font = decodePackedFont(buffer, CJK_META);
    expect(font.glyphs['𠀀']).toBeUndefined();
    expect(font.fallback.rows[0]).toBe('1'.repeat(12));
  });

  it('中文与西文混排时按各自步进宽度对齐', () => {
    const buffer = buildPackedFont([
      { codepoint: 0x41, advance: 6, grid: Array.from({ length: 12 }, () => '111111000000') },
      { codepoint: 0x56fe, advance: 12, grid: Array.from({ length: 12 }, () => '111111111111') },
    ]);
    const font = decodePackedFont(buffer, CJK_META);
    // 'A' 步进 6 + '图' 步进 12 = 18
    expect(renderTextToMatrix('A图', font).width).toBe(18);
  });
});

describe('pixelFontLoader / 按需加载', () => {
  beforeEach(() => {
    __resetPackedFontCache();
  });

  it('默认字体不依赖任何点阵数据（首屏保持轻量）', () => {
    expect(getPixelFont(undefined).id).toBe(DEFAULT_PIXEL_FONT_ID);
    expect(PACKED_PIXEL_FONTS.every((meta) => !isPixelFontLoaded(meta.id))).toBe(true);
  });

  it('清单里的每个字体都应存在对应的数据文件且能真实解码', () => {
    for (const meta of PACKED_PIXEL_FONTS) {
      const binPath = path.resolve(__dirname, `../../public/fonts/${meta.id}.bin`);
      expect(existsSync(binPath), `缺少字体数据 ${meta.id}.bin（请先运行 npm run build:fonts）`).toBe(true);

      const raw = readFileSync(binPath);
      const font = decodePackedFont(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
        meta,
      );
      expect(font.id).toBe(meta.id);

      // 常用字必须有
      for (const char of ['拼', '豆', '图', '纸', 'A', '1']) {
        expect(font.glyphs[char], `${meta.id} 缺少字形 ${char}`).toBeDefined();
      }
      // 汉字笔迹必须是有设计的点阵，而不是空白或糊成一团
      const dou = font.glyphs['豆'];
      const ink = dou.rows.join('').split('1').length - 1;
      expect(ink, `${meta.id} 的「豆」笔迹过少`).toBeGreaterThan(10);
      expect(ink, `${meta.id} 的「豆」笔迹异常`).toBeLessThan(font.glyphWidth * font.glyphHeight);
    }
  });

  it('不同字号必须是各自独立设计的字形，而不是同一字形的放大', () => {
    // 8px 与 16px 的「豆」在笔画数量上必须有明显差异：
    // 若是简单整数倍放大，8px 的点阵放大 2 倍后笔迹数会恰好等于 16px 的 4 倍关系。
    const load = (id: string) => {
      const meta = getPackedFontMeta(id)!;
      const binPath = path.resolve(__dirname, `../../public/fonts/${meta.id}.bin`);
      const raw = readFileSync(binPath);
      return decodePackedFont(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
        meta,
      );
    };
    const f8 = load('pixel-8-fusion-mono');
    const f16 = load('pixel-16-unifont');
    expect(f8.glyphWidth).toBe(8);
    expect(f16.glyphWidth).toBe(16);

    const ink = (font: ReturnType<typeof load>, char: string) =>
      font.glyphs[char].rows.join('').split('1').length - 1;

    const ink8 = ink(f8, '豆');
    const ink16 = ink(f16, '豆');
    // 16px 的笔迹数与 8px×4（放大的预期值）不相等 => 不是放大得来的
    expect(ink16).not.toBe(ink8 * 4);
    // 16px 用了更多的像素去刻画同一个字，笔画更细致
    expect(ink16).toBeGreaterThan(ink8);
  });

  it('比例字体的字距应真正随字形变化（与等宽不同）', () => {
    const mono = getPackedFontMeta('pixel-12-fusion-mono')!;
    const prop = getPackedFontMeta('pixel-12-fusion-prop')!;
    const load = (meta: typeof mono) => {
      const raw = readFileSync(path.resolve(__dirname, `../../public/fonts/${meta.id}.bin`));
      return decodePackedFont(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
        meta,
      );
    };
    const monoFont = load(mono);
    const propFont = load(prop);
    // 等宽：拉丁字符步进固定为字宽的一半
    expect(monoFont.glyphs['i'].advance).toBe(6);
    expect(monoFont.glyphs['W'].advance).toBe(6);
    // 比例：不同字形步进不同
    const propAdvances = new Set(
      ['i', 'W', 'm', 'A'].map((ch) => propFont.glyphs[ch]?.advance).filter(Boolean),
    );
    expect(propAdvances.size).toBeGreaterThan(1);
  });

  it('重复调用 loadPixelFont 应复用同一个 Promise（不重复下载）', async () => {
    const fake = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return { ok: true, status: 200, arrayBuffer: async () => fake } as unknown as Response;
    }) as typeof fetch;

    try {
      const [a, b] = await Promise.all([
        loadPixelFont(CJK_META.id),
        loadPixelFont(CJK_META.id),
      ]);
      expect(calls).toBe(1);
      expect(a).toBe(b);
      expect(isPixelFontLoaded(CJK_META.id)).toBe(true);
      expect(getPixelFont(CJK_META.id).id).toBe(CJK_META.id);

      await loadPixelFont(CJK_META.id);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('不同字体各自独立加载，互不影响', async () => {
    const asked: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      asked.push(String(url));
      const fake = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
      return { ok: true, status: 200, arrayBuffer: async () => fake } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      await loadPixelFont('pixel-8-fusion-mono');
      await loadPixelFont('pixel-16-unifont');
      expect(asked).toHaveLength(2);
      expect(asked[0]).toContain('pixel-8-fusion-mono.bin');
      expect(asked[1]).toContain('pixel-16-unifont.bin');
      expect(isPixelFontLoaded('pixel-8-fusion-mono')).toBe(true);
      expect(isPixelFontLoaded('pixel-10-fusion-mono')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('未知字体 id 应直接报错，不发起请求', async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }) as typeof fetch;
    try {
      await expect(loadPixelFont('not-a-real-font')).rejects.toThrow(/未知字体/);
      expect(called).toBe(false);
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
      await expect(loadPixelFont(CJK_META.id)).rejects.toThrow(/404/);
      await expect(loadPixelFont(CJK_META.id)).resolves.toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('pixelFontLoader / 历史 id 兼容', () => {
  beforeEach(() => {
    __resetPackedFontCache();
  });

  it('旧工程的 pixel-12-zh-hans 应解析到当前的 12px 字体', () => {
    const legacy = getPackedFontMeta('pixel-12-zh-hans');
    expect(legacy).toBeDefined();
    expect(legacy!.id).toBe('pixel-12-fusion-mono');
  });

  it('旧 id 与当前 id 共享同一份加载缓存（不会重复下载）', async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      const fake = buildPackedFont([{ codepoint: 0x41, advance: 6, grid: [] }]);
      return { ok: true, status: 200, arrayBuffer: async () => fake } as unknown as Response;
    }) as typeof fetch;
    try {
      await loadPixelFont('pixel-12-zh-hans');
      expect(isPixelFontLoaded('pixel-12-fusion-mono')).toBe(true);
      await loadPixelFont('pixel-12-fusion-mono');
      expect(calls).toBe(1);
      // getPixelFont 也要能通过旧 id 找到已注册的字体
      expect(getPixelFont('pixel-12-zh-hans').id).toBe('pixel-12-fusion-mono');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
