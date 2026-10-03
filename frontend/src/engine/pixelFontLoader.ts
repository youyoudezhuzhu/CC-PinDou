/**
 * 像素点阵字体运行时加载器（多字体）
 *
 * 数据由 scripts/build-pixel-fonts.mjs 从各字体的 BDF 子集化生成 ——
 * 都是逐像素手工绘制的真实点阵字形，不是轮廓栅格化、
 * 也不是把同一字形加粗或整数倍放大伪造出来的。
 *
 * 每个字体单独打包、**按需加载**：只有用户真正选中某个字体时才 fetch，
 * 默认的 5×7 拉丁字体与其它字体都不会进首屏。
 */

import { normalizeFontId, registerPixelFont, type PixelFont, type PixelGlyph } from './pixelFont';

/** CPXF 二进制格式常量 */
const MAGIC = 'CPXF';
const SUPPORTED_VERSION = 1;
const HEADER_SIZE = 9;

export interface PackedFontMeta {
  /** 字体 id（写入 TextObject.font） */
  id: string;
  /** UI 展示名 */
  name: string;
  /** 分组（按像素尺寸），用于 UI 归类 */
  group: string;
  /** 一句话特点说明 */
  desc: string;
  /** 字符覆盖范围：cjk=含中文，latin=仅西文/数字/符号 */
  coverage: 'cjk' | 'latin';
  /** 数据文件路径（相对 BASE_URL） */
  url: string;
  /** 字距（等宽字体步进已含字距，通常为 0） */
  letterSpacing: number;
  lineSpacing: number;
  /** 授权说明，展示在 UI 上 */
  license: string;
}

/** 可用的打包字体清单（与 scripts/pixel-font-manifest.mjs 保持一致） */
export const PACKED_PIXEL_FONTS: PackedFontMeta[] = [
  // ── 中文 · 黑体风格（OFL-1.1）──
  {
    id: 'pixel-8-fusion-mono',
    name: '缝合像素 8px 等宽',
    group: '8 像素',
    desc: '最紧凑，适合小图纸与长文本（笔画为 8px 专门简化）',
    url: 'fonts/pixel-8-fusion-mono.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'Fusion Pixel Font (OFL-1.1) © TakWolf',
  },
  {
    id: 'pixel-10-fusion-mono',
    name: '缝合像素 10px 等宽',
    group: '10 像素',
    desc: '紧凑，笔画比 8px 更清晰',
    url: 'fonts/pixel-10-fusion-mono.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'Fusion Pixel Font (OFL-1.1) © TakWolf',
  },
  {
    id: 'pixel-12-fusion-mono',
    name: '缝合像素 12px 等宽',
    group: '12 像素',
    desc: '标准选择，汉字清晰、严格对齐网格',
    url: 'fonts/pixel-12-fusion-mono.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'Fusion Pixel Font (OFL-1.1) © TakWolf',
  },
  {
    id: 'pixel-12-fusion-prop',
    name: '缝合像素 12px 比例',
    group: '12 像素',
    desc: '按字形实际宽度分配字距，行高更宽松，排版更自然',
    url: 'fonts/pixel-12-fusion-prop.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'Fusion Pixel Font (OFL-1.1) © TakWolf',
  },
  // ── 中文 · 宋体风格（文泉驿，GPL-2.0，数据文件单独授权）──
  {
    id: 'pixel-12-wqy',
    name: '文泉驿点阵宋体 12px',
    group: '12 像素',
    desc: '宋体风格，横细竖粗带衬线，与黑体观感明显不同',
    url: 'fonts/pixel-12-wqy.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'WenQuanYi Bitmap Song (GPL-2.0) © WenQuanYi Board',
  },
  {
    id: 'pixel-13-wqy',
    name: '文泉驿点阵宋体 13px',
    group: '13 像素',
    desc: '宋体风格，13px 专门设计',
    url: 'fonts/pixel-13-wqy.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'WenQuanYi Bitmap Song (GPL-2.0) © WenQuanYi Board',
  },
  {
    id: 'pixel-14-wqy',
    name: '文泉驿点阵宋体 14px',
    group: '14 像素',
    desc: '宋体风格，14px 中文笔画更宽松',
    url: 'fonts/pixel-14-wqy.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'WenQuanYi Bitmap Song (GPL-2.0) © WenQuanYi Board',
  },
  {
    id: 'pixel-15-wqy',
    name: '文泉驿点阵宋体 15px',
    group: '15 像素',
    desc: '宋体风格，笔画更舒展',
    url: 'fonts/pixel-15-wqy.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'WenQuanYi Bitmap Song (GPL-2.0) © WenQuanYi Board',
  },
  {
    id: 'pixel-16-wqy',
    name: '文泉驿点阵宋体 16px',
    group: '16 像素',
    desc: '宋体风格，中文细节最完整',
    url: 'fonts/pixel-16-wqy.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'WenQuanYi Bitmap Song (GPL-2.0) © WenQuanYi Board',
  },
  // ── 中文 · 16px 等宽（OFL-1.1）──
  {
    id: 'pixel-16-unifont',
    name: 'Unifont 16px 等宽',
    group: '16 像素',
    desc: '字面大，复杂汉字笔画最清晰，占豆也最多',
    url: 'fonts/pixel-16-unifont.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'GNU Unifont (OFL-1.1) © Roman Czyborra, Paul Hardy',
  },
  // ── 中文 · 18px（公有领域）──
  {
    id: 'pixel-18-x11',
    name: 'X11 18px 等宽',
    group: '18 像素',
    desc: '18px 中文，公有领域位图，字形为简体写法',
    url: 'fonts/pixel-18-x11.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'cjk',
    license: 'X11 misc-fixed (Public domain)',
  },
  // ── 西文 / 数字 / 符号（公有领域，不含中文）──
  {
    id: 'pixel-9-x11',
    name: 'X11 9px 等宽',
    group: '9 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    url: 'fonts/pixel-9-x11.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'latin',
    license: 'X11 misc-fixed (Public domain)',
  },
  {
    id: 'pixel-14-x11',
    name: 'X11 14px 等宽',
    group: '14 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    url: 'fonts/pixel-14-x11.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'latin',
    license: 'X11 misc-fixed (Public domain)',
  },
  {
    id: 'pixel-20-x11',
    name: 'X11 20px 等宽',
    group: '20 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    url: 'fonts/pixel-20-x11.bin',
    letterSpacing: 0,
    lineSpacing: 1,
    coverage: 'latin',
    license: 'X11 misc-fixed (Public domain)',
  },
];

/**
 * 字体 id 别名：早期版本只提供过一个中文点阵字体 id `pixel-12-zh-hans`，
 * 现已细分为多个字号/字面。别名表在 pixelFont.ts 中统一维护（getPixelFont 也用它），
 * 这里复用同一份实现，避免两处不一致。
 */

/** 按 id 取字体元信息（自动解析历史别名） */
export function getPackedFontMeta(id: string): PackedFontMeta | undefined {
  const normalized = normalizeFontId(id);
  return PACKED_PIXEL_FONTS.find((font) => font.id === normalized);
}

/** 该 id 是否为需要按需加载的打包字体 */
export function isPackedFont(id: string): boolean {
  return getPackedFontMeta(id) !== undefined;
}

/** 已加载的字体缓存：同一字体只解析一次 */
const loadedFonts = new Map<string, PixelFont>();
const pendingLoads = new Map<string, Promise<PixelFont>>();

/** 把一个字形的比特流解析为 '0'/'1' 行字符串 */
function decodeGlyph(
  bytes: Uint8Array,
  offset: number,
  cellW: number,
  cellH: number,
  advance: number,
): PixelGlyph {
  // 必须使用**完整字身框宽度**，不能按 advance 截断：
  // 字身框左侧可能包含为负 xOffset 字形预留的补偿列，
  // 按 advance 截断会裁掉这类字形的右侧笔画（文泉驿多种字号都会踩到）。
  const width = cellW;
  const rows: string[] = [];
  for (let y = 0; y < cellH; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const bitIndex = y * cellW + x;
      const byte = bytes[offset + (bitIndex >> 3)];
      const bit = (byte >> (7 - (bitIndex & 7))) & 1;
      row += bit ? '1' : '0';
    }
    rows.push(row);
  }
  return { width, height: cellH, rows, advance };
}

/** 解析 CPXF 二进制数据为 PixelFont */
export function decodePackedFont(buffer: ArrayBuffer, meta: PackedFontMeta): PixelFont {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_SIZE) {
    throw new Error(`${meta.id}: 字体数据损坏（长度 ${bytes.length}）`);
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) {
    throw new Error(`${meta.id}: 字体数据格式不正确（magic=${magic}）`);
  }

  const version = bytes[4];
  if (version !== SUPPORTED_VERSION) {
    throw new Error(`${meta.id}: 不支持的字体数据版本 ${version}`);
  }

  const cellW = bytes[5];
  const cellH = bytes[6];
  const count = bytes[7] | (bytes[8] << 8);

  const bitmapBytes = Math.ceil((cellW * cellH) / 8);
  const recordSize = 2 + 1 + 1 + bitmapBytes;
  const expected = HEADER_SIZE + count * recordSize;
  if (bytes.length < expected) {
    throw new Error(`${meta.id}: 字体数据不完整（需要 ${expected} 字节，实际 ${bytes.length}）`);
  }

  const glyphs: Record<string, PixelGlyph> = {};
  let offset = HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    const codepoint = bytes[offset] | (bytes[offset + 1] << 8);
    const advance = bytes[offset + 2] || cellW;
    glyphs[String.fromCodePoint(codepoint)] = decodeGlyph(
      bytes,
      offset + 4,
      cellW,
      cellH,
      advance,
    );
    offset += recordSize;
  }

  return {
    id: meta.id,
    name: meta.name,
    glyphWidth: cellW,
    glyphHeight: cellH,
    letterSpacing: meta.letterSpacing,
    lineSpacing: meta.lineSpacing,
    glyphs,
    // 缺字兜底：空心方框
    fallback: {
      width: cellW,
      height: cellH,
      rows: [
        '1'.repeat(cellW),
        ...Array.from({ length: cellH - 2 }, () => '1' + '0'.repeat(cellW - 2) + '1'),
        '1'.repeat(cellW),
      ],
    },
  };
}

/** 解析数据文件地址（兼容 Vite 的 base 配置与 GitHub Pages 子路径部署） */
function resolveFontUrl(url: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = url.startsWith('/') ? url.slice(1) : url;
  return `${normalizedBase}${normalizedPath}`;
}

/** 某个打包字体是否已加载完成 */
export function isPixelFontLoaded(id: string): boolean {
  return loadedFonts.has(normalizeFontId(id) ?? id);
}

/** 全部已加载的打包字体 id */
export function loadedPixelFontIds(): string[] {
  return Array.from(loadedFonts.keys());
}

/**
 * 按需加载指定打包字体并注册到字体表。
 * 重复调用会复用同一个 Promise，不会重复下载。
 */
export function loadPixelFont(id: string): Promise<PixelFont> {
  const meta = getPackedFontMeta(id);
  if (!meta) return Promise.reject(new Error(`未知字体: ${id}`));

  // 统一以规范化 id 作为缓存键，别名与真名不会各存一份
  const key = meta.id;
  const cached = loadedFonts.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(key);
  if (pending) return pending;

  const task = (async () => {
    const response = await fetch(resolveFontUrl(meta.url));
    if (!response.ok) {
      throw new Error(`${meta.name} 加载失败：HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const font = decodePackedFont(buffer, meta);
    loadedFonts.set(key, font);
    registerPixelFont(font);
    pendingLoads.delete(key);
    return font;
  })().catch((error) => {
    pendingLoads.delete(key);
    throw error;
  });

  pendingLoads.set(key, task);
  return task;
}

/** 测试用：清空缓存 */
export function __resetPackedFontCache(): void {
  loadedFonts.clear();
  pendingLoads.clear();
}
