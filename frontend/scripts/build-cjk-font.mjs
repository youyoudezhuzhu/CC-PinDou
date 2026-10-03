#!/usr/bin/env node
/**
 * 构建中文/泛 CJK 点阵字体数据
 *
 * 为什么需要这个脚本？
 *   汉字的笔画极其密集，**绝不能**用「把轮廓字体（ttf/otf）缩小到 12px 再二值化」的方式
 *   得到拼豆点阵 —— 那样笔画会糊成一团、根本认不出字。
 *   必须使用字体设计师**逐像素手工绘制**的点阵字体（BDF / bitmap）。
 *
 * 数据来源（默认）：
 *   Fusion Pixel Font（缝合像素字体）12px 等宽 / zh_Hans
 *   https://github.com/TakWolf/fusion-pixel-font
 *   版权 (c) 2022 TakWolf，字形部分以 SIL Open Font License 1.1 授权。
 *   选择它的原因：
 *     - 是真正的点阵字体（BDF 每个字形就是一张位图），不存在轮廓栅格化糊字问题
 *     - OFL-1.1 允许改造与随软件分发，与本项目的 MIT 许可兼容
 *     - 12px 等宽：一个汉字正好 12×12、西文半宽 6，天然对齐拼豆网格
 *   注意：同为中文点阵字体的 Zpix（最像素）**不可使用** ——
 *   它要求商业授权，且明确禁止修改/转换/拆分。
 *
 * 用法：
 *   node scripts/build-cjk-font.mjs                    # 默认 gb2312-1 子集
 *   node scripts/build-cjk-font.mjs --subset gb2312    # 一二级常用字（6763）
 *   node scripts/build-cjk-font.mjs --subset all       # 全字库（体积很大）
 *   node scripts/build-cjk-font.mjs --bdf ./local.bdf  # 使用本地 BDF，不走网络
 *
 * 产物：
 *   public/fonts/pixel-12-zh-hans.bin   紧凑位图数据（运行时按需 lazy load）
 *   public/fonts/NOTICE.txt             字体授权与出处
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(FRONTEND_DIR, 'public', 'fonts');

const RELEASE_TAG = '2026.09.25';
const BDF_ASSET = `fusion-pixel-font-12px-monospaced-bdf-v${RELEASE_TAG}.zip`;
const BDF_URL = `https://github.com/TakWolf/fusion-pixel-font/releases/download/${RELEASE_TAG}/${BDF_ASSET}`;
const BDF_MEMBER = 'fusion-pixel-12px-monospaced-zh_hans.bdf';

const MAGIC = 'CPXF';
const FORMAT_VERSION = 1;

// ---------------------------------------------------------------- 参数解析

function parseArgs(argv) {
  const options = { subset: 'gb2312-1', bdf: null, out: null, tag: 'pixel-12-zh-hans' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--subset') options.subset = argv[++i];
    else if (arg === '--bdf') options.bdf = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--tag') options.tag = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/build-cjk-font.mjs [--subset gb2312-1|gb2312|all|<字符>] [--bdf 本地路径] [--out 输出路径]');
      process.exit(0);
    }
  }
  return options;
}

// ---------------------------------------------------------------- 字符集

/** GB2312 一级汉字（3755 个，按拼音序），覆盖约 99.5% 的日常用字 */
function gb2312Level1() {
  const chars = [];
  for (let hi = 0xb0; hi <= 0xd7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      try {
        chars.push(new TextDecoder('gb2312').decode(new Uint8Array([hi, lo])));
      } catch {
        /* 非法区位码，跳过 */
      }
    }
  }
  return chars;
}

/** GB2312 二级汉字（3008 个） */
function gb2312Level2() {
  const chars = [];
  for (let hi = 0xd8; hi <= 0xf7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      try {
        chars.push(new TextDecoder('gb2312').decode(new Uint8Array([hi, lo])));
      } catch {
        /* 非法区位码，跳过 */
      }
    }
  }
  return chars;
}

/** ASCII 可见字符 + 常用中日韩标点 + 全角形式 */
function punctuationAndAscii() {
  const chars = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) chars.push(String.fromCodePoint(cp));
  for (let cp = 0x3000; cp <= 0x303f; cp++) chars.push(String.fromCodePoint(cp));
  for (let cp = 0xff01; cp <= 0xff5e; cp++) chars.push(String.fromCodePoint(cp));
  for (let cp = 0xffe0; cp <= 0xffe5; cp++) chars.push(String.fromCodePoint(cp));
  chars.push(String.fromCodePoint(0x2018), String.fromCodePoint(0x2019));
  chars.push(String.fromCodePoint(0x201c), String.fromCodePoint(0x201d));
  chars.push(String.fromCodePoint(0x2026), String.fromCodePoint(0x2014));
  return chars;
}

function resolveCharset(subset) {
  const base = punctuationAndAscii();
  switch (subset) {
    case 'gb2312-1':
      return [...base, ...gb2312Level1()];
    case 'gb2312':
      return [...base, ...gb2312Level1(), ...gb2312Level2()];
    case 'all':
      return null; // 使用 BDF 中的全部字形
    default:
      return [...base, ...Array.from(subset)];
  }
}

// ---------------------------------------------------------------- BDF 解析

/**
 * 解析 BDF 文本，返回字形记录。
 * BBX 的 (xOffset, yOffset) 用于把字形放回统一的字身框，
 * 这样西文（半宽、坐上基线）与汉字（全宽、含降部）才能正确对齐。
 */
function parseBdf(text) {
  const lines = text.split('\n');
  const glyphs = [];
  let fontBox = { width: 12, height: 12, xOffset: 0, yOffset: -2 };

  let current = null;
  let inBitmap = false;
  let bitmapRows = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('FONTBOUNDINGBOX')) {
      const [, w, h, xo, yo] = line.split(/\s+/);
      fontBox = { width: +w, height: +h, xOffset: +xo, yOffset: +yo };
    } else if (line.startsWith('STARTCHAR')) {
      current = { name: line.slice(10).trim(), encoding: -1, dwidth: 0, bbx: null };
      bitmapRows = [];
      inBitmap = false;
    } else if (line.startsWith('ENCODING')) {
      if (current) current.encoding = parseInt(line.split(/\s+/)[1], 10);
    } else if (line.startsWith('DWIDTH')) {
      if (current) current.dwidth = parseInt(line.split(/\s+/)[1], 10);
    } else if (line.startsWith('BBX')) {
      if (current) {
        const [, w, h, xo, yo] = line.split(/\s+/);
        current.bbx = { width: +w, height: +h, xOffset: +xo, yOffset: +yo };
      }
    } else if (line.startsWith('BITMAP')) {
      inBitmap = true;
    } else if (line.startsWith('ENDCHAR')) {
      if (current && current.bbx && current.encoding >= 0) {
        current.bitmap = bitmapRows;
        glyphs.push(current);
      }
      current = null;
      inBitmap = false;
    } else if (inBitmap && /^[0-9A-Fa-f]+$/.test(line)) {
      bitmapRows.push(line);
    }
  }

  return { fontBox, glyphs };
}

/** 把 BDF 字形规范化为 cellW×cellH 的位图（行优先，true = 落豆） */
function normalizeGlyph(glyph, fontBox, cellW, cellH) {
  const grid = Array.from({ length: cellH }, () => new Array(cellW).fill(false));
  const { width: gw, height: gh, xOffset: gxo, yOffset: gyo } = glyph.bbx;
  // 字身框顶行的 y 坐标（y 轴向上）
  const boxTopY = fontBox.yOffset + fontBox.height;

  for (let row = 0; row < Math.min(gh, glyph.bitmap.length); row++) {
    const hex = glyph.bitmap[row].padEnd(Math.ceil(gw / 4), '0');
    const bits = BigInt(`0x${hex}`).toString(2).padStart(hex.length * 4, '0');
    // BDF 位图第一行是字形的最高行
    const y = gyo + gh - 1 - row;
    const cellRow = boxTopY - 1 - y;
    if (cellRow < 0 || cellRow >= cellH) continue;
    for (let col = 0; col < gw; col++) {
      if (bits[col] !== '1') continue;
      const cellCol = gxo + col;
      if (cellCol < 0 || cellCol >= cellW) continue;
      grid[cellRow][cellCol] = true;
    }
  }
  return grid;
}

/** 位图打包为连续比特（行优先，每行 cellW 位，MSB first） */
function packBitmap(grid, cellW, cellH) {
  const byteLength = Math.ceil((cellW * cellH) / 8);
  const bytes = new Uint8Array(byteLength);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      if (!grid[y][x]) continue;
      const bitIndex = y * cellW + x;
      bytes[bitIndex >> 3] |= 0x80 >> (bitIndex & 7);
    }
  }
  return bytes;
}

// ---------------------------------------------------------------- 主流程

async function loadBdf(options) {
  if (options.bdf) {
    console.log(`读取本地 BDF: ${options.bdf}`);
    return readFile(options.bdf, 'utf8');
  }

  const cachePath = path.join(FRONTEND_DIR, '.font-cache', BDF_MEMBER);
  if (existsSync(cachePath)) {
    console.log(`使用缓存 BDF: ${cachePath}`);
    return readFile(cachePath, 'utf8');
  }

  console.log(`下载 ${BDF_ASSET} …（约 35 MB，仅首次需要）`);
  const res = await fetch(BDF_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const zipBuffer = Buffer.from(await res.arrayBuffer());

  console.log('解压 …');
  const { execFileSync } = await import('node:child_process');
  const tmpDir = path.join(FRONTEND_DIR, '.font-cache');
  await mkdir(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, BDF_ASSET);
  await writeFile(zipPath, zipBuffer);
  execFileSync('unzip', ['-o', '-q', zipPath, BDF_MEMBER, '-d', tmpDir], { stdio: 'inherit' });
  console.log(`解压完成: ${cachePath}`);
  return readFile(cachePath, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bdfText = await loadBdf(options);
  const { fontBox, glyphs } = parseBdf(bdfText);
  console.log(`BDF 解析完成：字形 ${glyphs.length} 个，字身框 ${fontBox.width}×${fontBox.height}`);

  const cellW = fontBox.width;
  const cellH = fontBox.height;
  if (cellW > 16 || cellH > 16) {
    throw new Error(`暂不支持超过 16×16 的字身框（当前 ${cellW}×${cellH}）`);
  }

  const byCodepoint = new Map();
  for (const glyph of glyphs) byCodepoint.set(glyph.encoding, glyph);

  const charset = resolveCharset(options.subset);
  let wanted;
  if (charset === null) {
    wanted = glyphs.map((g) => String.fromCodePoint(g.encoding));
  } else {
    wanted = charset;
  }

  const selected = [];
  const missing = [];
  const seen = new Set();
  for (const char of wanted) {
    const cp = char.codePointAt(0);
    if (cp === undefined || seen.has(cp)) continue;
    seen.add(cp);
    const glyph = byCodepoint.get(cp);
    if (!glyph) {
      missing.push(char);
      continue;
    }
    selected.push({ cp, glyph });
  }
  selected.sort((a, b) => a.cp - b.cp);

  console.log(`选中字形 ${selected.length} 个（缺字 ${missing.length} 个）`);
  if (missing.length) {
    console.log(`  缺字示例: ${missing.slice(0, 40).join('')}`);
  }

  const bitmapBytes = Math.ceil((cellW * cellH) / 8);
  const recordSize = 2 + 1 + 1 + bitmapBytes;
  const headerSize = 4 + 1 + 1 + 1 + 2;
  const total = headerSize + selected.length * recordSize;
  const buffer = Buffer.alloc(total);

  let offset = 0;
  buffer.write(MAGIC, offset, 'ascii'); offset += 4;
  buffer.writeUInt8(FORMAT_VERSION, offset); offset += 1;
  buffer.writeUInt8(cellW, offset); offset += 1;
  buffer.writeUInt8(cellH, offset); offset += 1;
  buffer.writeUInt16LE(selected.length, offset); offset += 2;

  let halfWidth = 0;
  for (const { cp, glyph } of selected) {
    buffer.writeUInt16LE(cp, offset); offset += 2;
    const advance = Math.max(1, Math.min(255, glyph.dwidth || glyph.bbx.width));
    if (advance <= cellW / 2) halfWidth++;
    buffer.writeUInt8(advance, offset); offset += 1;
    buffer.writeUInt8(0, offset); offset += 1; // flags：保留
    const packed = packBitmap(normalizeGlyph(glyph, fontBox, cellW, cellH), cellW, cellH);
    Buffer.from(packed).copy(buffer, offset); offset += bitmapBytes;
  }

  const outPath = options.out
    ? path.resolve(options.out)
    : path.join(OUT_DIR, `${options.tag}.bin`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);

  const sizeKb = (buffer.length / 1024).toFixed(1);
  console.log(`\n写出: ${outPath}`);
  console.log(`  格式 CPXF v${FORMAT_VERSION}，字身框 ${cellW}×${cellH}px`);
  console.log(`  字形 ${selected.length} 个（半宽 ${halfWidth} / 全宽 ${selected.length - halfWidth}）`);
  console.log(`  体积 ${sizeKb} KB（每字形 ${recordSize} 字节）`);

  const notice = `本目录下的 ${path.basename(outPath)} 由脚本 scripts/build-cjk-font.mjs 生成。

字形来源：Fusion Pixel Font（缝合像素字体）12px 等宽 zh_Hans
  https://github.com/TakWolf/fusion-pixel-font
  Copyright (c) 2022, TakWolf (https://takwolf.com)
  字形部分以 SIL Open Font License 1.1 授权（见 LICENSE-OFL）。
  本数据是该项目字形的子集化二进制转换，同样遵循 OFL-1.1。

该字体是真正的点阵（bitmap）字体：每个字形由设计师逐像素手工绘制，
而非把轮廓字体缩小后栅格化，因此在 12px 下汉字笔画依然清晰可辨。

生成参数：subset=${options.subset}，字形 ${selected.length} 个，${cellW}×${cellH}px。

SIL Open Font License 1.1 全文见 https://openfontlicense.org
`;
  await writeFile(path.join(path.dirname(outPath), 'NOTICE.txt'), notice, 'utf8');
  console.log(`写出: ${path.join(path.dirname(outPath), 'NOTICE.txt')}`);
}

main().catch((err) => {
  console.error('构建失败:', err.message);
  process.exit(1);
});
