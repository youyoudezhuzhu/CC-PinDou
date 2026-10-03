/**
 * 中文点阵字体运行时加载器
 *
 * 数据由 scripts/build-cjk-font.mjs 从 Fusion Pixel Font（缝合像素字体）
 * 的 BDF 字库子集化生成 —— 是真正逐像素手绘的点阵字形，
 * 不是把轮廓字体缩小后栅格化的产物，因此 12px 下汉字笔画依然清晰。
 *
 * 体积较大（约 86 KB / 4000 字），因此**按需加载**：
 * 只有用户主动选择中文点阵字体时才 fetch，默认的 5×7 拉丁字体不受影响。
 */

import { registerPixelFont, type PixelFont, type PixelGlyph } from './pixelFont';

/** CPXF 二进制格式常量 */
const MAGIC = 'CPXF';
const SUPPORTED_VERSION = 1;
const HEADER_SIZE = 9;

export interface PackedFontMeta {
  /** 字体 id（写入 TextObject.font） */
  id: string;
  /** UI 展示名 */
  name: string;
  /** 数据文件路径（相对 BASE_URL） */
  url: string;
  /** 字距（等宽字体步进已含字距，通常为 0） */
  letterSpacing: number;
  lineSpacing: number;
  /** 授权说明，展示在 UI 上 */
  license: string;
}

/** 中文点阵字体元信息 */
export const CJK_PIXEL_FONT_META: PackedFontMeta = {
  id: 'pixel-12-zh-hans',
  name: 'Pixel 12×12 中文',
  url: 'fonts/pixel-12-zh-hans.bin',
  letterSpacing: 0,
  lineSpacing: 1,
  license: 'Fusion Pixel Font (OFL-1.1) © TakWolf',
};

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
  // 只保留步进宽度内的列：等宽字体里字形不会超出自己的步进
  const width = Math.min(advance, cellW);
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
    const bitmapOffset = offset + 4;
    glyphs[String.fromCodePoint(codepoint)] = decodeGlyph(
      bytes,
      bitmapOffset,
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

/** 该中文字体是否已经加载完成 */
export function isCjkFontLoaded(): boolean {
  return loadedFonts.has(CJK_PIXEL_FONT_META.id);
}

/**
 * 按需加载中文点阵字体并注册到字体表。
 * 重复调用会复用同一个 Promise，不会重复下载。
 */
export function loadCjkPixelFont(meta: PackedFontMeta = CJK_PIXEL_FONT_META): Promise<PixelFont> {
  const cached = loadedFonts.get(meta.id);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(meta.id);
  if (pending) return pending;

  const task = (async () => {
    const response = await fetch(resolveFontUrl(meta.url));
    if (!response.ok) {
      throw new Error(`${meta.name} 加载失败：HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const font = decodePackedFont(buffer, meta);
    loadedFonts.set(meta.id, font);
    registerPixelFont(font);
    pendingLoads.delete(meta.id);
    return font;
  })().catch((error) => {
    pendingLoads.delete(meta.id);
    throw error;
  });

  pendingLoads.set(meta.id, task);
  return task;
}

/** 测试用：清空缓存 */
export function __resetCjkFontCache(): void {
  loadedFonts.clear();
  pendingLoads.clear();
}
