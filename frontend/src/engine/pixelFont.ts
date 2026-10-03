/**
 * 像素点阵字体引擎（拼豆文字工具）
 *
 * 设计目标：
 *  - 文字必须是「真正的像素文字」：由点阵位图决定，绝不使用 canvas.fillText()
 *  - 位图直接对应拼豆格：'1' → 落一颗豆，'0' → 什么都不做（背景保持透明）
 *  - 分组可扩展：Latin / Number / Symbol / Chinese(预留)
 *
 * 数据格式：每个字形是 height 行、每行 width 个字符的 '0'/'1' 串，以 '/' 连接。
 * 例如 'A' = '01110/10001/10001/11111/10001/10001/10001'
 */

/** 单一字形：行优先位图 */
export interface PixelGlyph {
  width: number;
  height: number;
  /** rows[y][x] === '1' 表示该像素落豆 */
  rows: string[];
  /**
   * 步进宽度（含字形自身右侧的字距），缺省等于 width。
   * 等宽点阵字体里西文是半宽、汉字是全宽，靠它对齐。
   */
  advance?: number;
}

/** 字形分组（用于 UI 分组展示，并为中文等大字符集预留） */
export type GlyphCategory = 'latin' | 'number' | 'symbol' | 'chinese';

/** 点阵字体定义 */
export interface PixelFont {
  /** 稳定标识，会被写入 TextObject.font，需保证向后兼容 */
  id: string;
  /** UI 展示名 */
  name: string;
  /** 默认字形宽高 */
  glyphWidth: number;
  glyphHeight: number;
  /** 字符间距（额外插入的空列数） */
  letterSpacing: number;
  /** 行间距（多行文字时额外插入的空行数） */
  lineSpacing: number;
  /** 字形表 */
  glyphs: Record<string, PixelGlyph>;
  /** 缺字时使用的兜底字形 */
  fallback: PixelGlyph;
}

// =============================================================================
// 5×7 基础字形（拉丁 + 数字 + 符号）
// 每行 5 列共 7 行，'1' = 落豆
// =============================================================================

const GLYPH_5X7_SOURCE: Record<string, string> = {
  // ── 空格 ──
  ' ': '00000/00000/00000/00000/00000/00000/00000',

  // ── 大写字母 A-Z ──
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',

  // ── 小写字母 a-z ──
  a: '00000/00000/01110/00001/01111/10001/01111',
  b: '10000/10000/11110/10001/10001/10001/11110',
  c: '00000/00000/01111/10000/10000/10000/01111',
  d: '00001/00001/01111/10001/10001/10001/01111',
  e: '00000/00000/01110/10001/11111/10000/01110',
  f: '00110/01001/01000/11110/01000/01000/01000',
  g: '00000/01111/10001/10001/01111/00001/01110',
  h: '10000/10000/11110/10001/10001/10001/10001',
  i: '00100/00000/01100/00100/00100/00100/01110',
  j: '00010/00000/00110/00010/00010/10010/01100',
  k: '10000/10000/10010/10100/11000/10100/10010',
  l: '01100/00100/00100/00100/00100/00100/01110',
  m: '00000/00000/11010/10101/10101/10101/10101',
  n: '00000/00000/11110/10001/10001/10001/10001',
  o: '00000/00000/01110/10001/10001/10001/01110',
  p: '00000/11110/10001/10001/11110/10000/10000',
  q: '00000/01111/10001/10001/01111/00001/00001',
  r: '00000/00000/10110/11001/10000/10000/10000',
  s: '00000/00000/01111/10000/01110/00001/11110',
  t: '01000/01000/11110/01000/01000/01001/00110',
  u: '00000/00000/10001/10001/10001/10011/01101',
  v: '00000/00000/10001/10001/10001/01010/00100',
  w: '00000/00000/10001/10101/10101/10101/01010',
  x: '00000/00000/10001/01010/00100/01010/10001',
  y: '00000/10001/10001/10001/01111/00001/01110',
  z: '00000/00000/11111/00010/00100/01000/11111',

  // ── 数字 0-9 ──
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11111/00010/00100/00010/00001/10001/01110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '00110/01000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00010/01100',

  // ── 常用符号 ──
  '!': '00100/00100/00100/00100/00100/00000/00100',
  '"': '01010/01010/01010/00000/00000/00000/00000',
  '#': '01010/01010/11111/01010/11111/01010/01010',
  $: '00100/01111/10100/01110/00101/11110/00100',
  '%': '11000/11001/00010/00100/01000/10011/00011',
  '&': '01100/10010/10100/01000/10101/10010/01101',
  "'": '00100/00100/00100/00000/00000/00000/00000',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
  '*': '00000/00100/10101/01110/10101/00100/00000',
  '+': '00000/00100/00100/11111/00100/00100/00000',
  ',': '00000/00000/00000/00000/00110/00100/01000',
  '-': '00000/00000/00000/11111/00000/00000/00000',
  '.': '00000/00000/00000/00000/00000/00110/00110',
  '/': '00001/00010/00010/00100/01000/01000/10000',
  ':': '00000/00110/00110/00000/00110/00110/00000',
  ';': '00000/00110/00110/00000/00110/00100/01000',
  '<': '00010/00100/01000/10000/01000/00100/00010',
  '=': '00000/00000/11111/00000/11111/00000/00000',
  '>': '01000/00100/00010/00001/00010/00100/01000',
  '?': '01110/10001/00001/00010/00100/00000/00100',
  '@': '01110/10001/10111/10101/10111/10000/01110',
  '[': '01110/01000/01000/01000/01000/01000/01110',
  '\\': '10000/01000/01000/00100/00010/00010/00001',
  ']': '01110/00010/00010/00010/00010/00010/01110',
  '^': '00100/01010/10001/00000/00000/00000/00000',
  _: '00000/00000/00000/00000/00000/00000/11111',
  '`': '01000/00100/00010/00000/00000/00000/00000',
  '{': '00010/00100/00100/01000/00100/00100/00010',
  '|': '00100/00100/00100/00100/00100/00100/00100',
  '}': '01000/00100/00100/00010/00100/00100/01000',
  '~': '00000/00000/01000/10101/00010/00000/00000',
};

/** 缺字兜底：空心方框 */
const FALLBACK_GLYPH_SOURCE = '11111/10001/10001/10001/10001/10001/11111';

// =============================================================================
// 解析与字体构建
// =============================================================================

/** 将 '01110/10001/...' 源串解析为 PixelGlyph */
export function parseGlyph(source: string): PixelGlyph {
  const rows = source.split('/');
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return {
    width,
    height,
    // 补齐每行长度，避免下游按列索引时出现 undefined
    rows: rows.map((row) => row.padEnd(width, '0')),
  };
}

function buildGlyphs(source: Record<string, string>): Record<string, PixelGlyph> {
  const glyphs: Record<string, PixelGlyph> = {};
  for (const [char, glyphSource] of Object.entries(source)) {
    glyphs[char] = parseGlyph(glyphSource);
  }
  return glyphs;
}

/** 5×7 基础点阵字体（拉丁 / 数字 / 符号） */
export const PIXEL_FONT_5X7: PixelFont = {
  id: 'pixel-5x7',
  name: 'Pixel 5×7',
  glyphWidth: 5,
  glyphHeight: 7,
  letterSpacing: 1,
  lineSpacing: 1,
  glyphs: buildGlyphs(GLYPH_5X7_SOURCE),
  fallback: parseGlyph(FALLBACK_GLYPH_SOURCE),
};

/** 已注册字体表：新增字体（如中文点阵）只需在此登记 */
const FONT_REGISTRY: PixelFont[] = [PIXEL_FONT_5X7];

/** 默认字体 id */
export const DEFAULT_PIXEL_FONT_ID = PIXEL_FONT_5X7.id;

/** 按 id 取字体；未知 id 回退到默认字体，保证旧工程文件仍可渲染 */
export function getPixelFont(id?: string): PixelFont {
  if (!id) return PIXEL_FONT_5X7;
  return FONT_REGISTRY.find((font) => font.id === id) ?? PIXEL_FONT_5X7;
}

/** 列出已注册字体（供 UI 下拉框使用） */
export function listPixelFonts(): PixelFont[] {
  return FONT_REGISTRY.slice();
}

/** 注册新字体（为中文字体等后续扩展预留） */
export function registerPixelFont(font: PixelFont): void {
  const index = FONT_REGISTRY.findIndex((item) => item.id === font.id);
  if (index >= 0) FONT_REGISTRY[index] = font;
  else FONT_REGISTRY.push(font);
}

/** 取字形：先精确匹配，再尝试大小写折叠，最后使用兜底字形 */
export function getGlyph(font: PixelFont, char: string): PixelGlyph {
  const direct = font.glyphs[char];
  if (direct) return direct;
  const upper = char.toUpperCase();
  const lower = char.toLowerCase();
  return font.glyphs[upper] ?? font.glyphs[lower] ?? font.fallback;
}

/** 该字体是否能渲染某个字符（用于 UI 提示缺字） */
export function hasGlyph(font: PixelFont, char: string): boolean {
  if (char === '\n' || char === '\r' || char === '\t') return true;
  if (font.glyphs[char]) return true;
  return Boolean(font.glyphs[char.toUpperCase()] ?? font.glyphs[char.toLowerCase()]);
}

// =============================================================================
// 文字 → 像素矩阵
// =============================================================================

/** 像素位图矩阵（尚未放大） */
export interface PixelMatrix {
  width: number;
  height: number;
  /** bits[y][x] === true 表示落豆 */
  bits: boolean[][];
}

export interface TextMatrixOptions {
  /** 覆盖字体的字间距 */
  letterSpacing?: number;
  /** 覆盖字体的行间距 */
  lineSpacing?: number;
}

function emptyMatrix(width: number, height: number): PixelMatrix {
  const bits: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    bits.push(new Array<boolean>(width).fill(false));
  }
  return { width, height, bits };
}

/** 将一行文字排版为位图行（宽度自适应，不含行首尾多余空白列） */
function layoutLine(line: string, font: PixelFont, letterSpacing: number): boolean[][] {
  const rows: boolean[][] = [];
  let cursor = 0;
  let usedWidth = 0;

  for (const char of line) {
    if (char === '\t') {
      // Tab 当作 4 个空格处理，避免出现不可见字符导致的排版歧义
      cursor += (font.glyphWidth + letterSpacing) * 4;
      continue;
    }
    const glyph = getGlyph(font, char);
    for (let gy = 0; gy < glyph.height; gy++) {
      if (!rows[gy]) rows[gy] = [];
      const glyphRow = glyph.rows[gy];
      for (let gx = 0; gx < glyph.width; gx++) {
        if (glyphRow[gx] === '1') {
          rows[gy][cursor + gx] = true;
          // 宽度只由真正落豆的像素决定：
          // 这样行尾空格不会撑出多余空白列，而行内空格依然被保留
          usedWidth = Math.max(usedWidth, cursor + gx + 1);
        }
      }
    }
    cursor += (glyph.advance ?? glyph.width) + letterSpacing;
  }

  const height = Math.max(font.glyphHeight, rows.length);
  const normalized: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const source = rows[y] ?? [];
    const row = new Array<boolean>(usedWidth).fill(false);
    for (let x = 0; x < Math.min(usedWidth, source.length); x++) {
      if (source[x]) row[x] = true;
    }
    normalized.push(row);
  }
  return normalized;
}

/**
 * 将文字渲染为像素矩阵。
 * 支持 '\n' 换行；空字符串返回 0×0 矩阵。
 */
export function renderTextToMatrix(
  text: string,
  font: PixelFont,
  options: TextMatrixOptions = {},
): PixelMatrix {
  const letterSpacing = options.letterSpacing ?? font.letterSpacing;
  const lineSpacing = options.lineSpacing ?? font.lineSpacing;

  const normalized = (text ?? '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const laidOut: boolean[][][] = [];
  let maxWidth = 0;
  for (const line of lines) {
    const rows = layoutLine(line, font, letterSpacing);
    const width = rows[0]?.length ?? 0;
    maxWidth = Math.max(maxWidth, width);
    laidOut.push(rows);
  }

  if (maxWidth === 0) {
    // 全是空白（或空串）：保留高度信息，方便 UI 显示占位
    const height = lines.length * font.glyphHeight + Math.max(0, lines.length - 1) * lineSpacing;
    return emptyMatrix(0, height);
  }

  const bits: boolean[][] = [];
  for (let i = 0; i < laidOut.length; i++) {
    const rows = laidOut[i];
    for (let y = 0; y < rows.length; y++) {
      const row = new Array<boolean>(maxWidth).fill(false);
      const source = rows[y];
      for (let x = 0; x < source.length; x++) {
        if (source[x]) row[x] = true;
      }
      bits.push(row);
    }
    if (i < laidOut.length - 1) {
      for (let s = 0; s < lineSpacing; s++) {
        bits.push(new Array<boolean>(maxWidth).fill(false));
      }
    }
  }

  return { width: maxWidth, height: bits.length, bits };
}

/** 统计矩阵中落豆的像素总数（用于 UI 提示） */
export function countMatrixPixels(matrix: PixelMatrix): number {
  let count = 0;
  for (const row of matrix.bits) {
    for (const bit of row) {
      if (bit) count++;
    }
  }
  return count;
}
