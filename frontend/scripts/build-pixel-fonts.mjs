#!/usr/bin/env node
/**
 * 构建像素点阵字体数据（多字体）
 *
 * 为什么必须是 BDF？
 *   汉字的笔画极其密集，把轮廓字体（ttf/otf）缩小到 8~16px 再二值化会糊成一团、
 *   根本认不出字。必须使用字体设计师**逐像素手工绘制**的点阵字体。
 *   BDF 的每个字形本身就是一张位图，不存在轮廓栅格化问题。
 *
 * 同理，也不接受「把同一字形加粗 / 整数倍放大」来伪造新字体 ——
 * 本清单里的每个字体都是独立设计的不同尺寸/不同字面，笔画细节各不相同。
 *
 * 用法：
 *   node scripts/build-pixel-fonts.mjs                    # 构建全部启用字体
 *   node scripts/build-pixel-fonts.mjs --list             # 只列出清单
 *   node scripts/build-pixel-fonts.mjs --only pixel-8-fusion-mono
 *   node scripts/build-pixel-fonts.mjs --bdf pixel-8-fusion-mono=/path/to.bdf
 *
 * 产物：
 *   public/fonts/<id>.bin    紧凑位图数据（运行时按需 lazy load）
 *   public/fonts/NOTICE.txt  全部字体的授权与出处
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PIXEL_FONTS, SOURCES, getFontSpec } from './pixel-font-manifest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(FRONTEND_DIR, 'public', 'fonts');
const CACHE_DIR = path.join(FRONTEND_DIR, '.font-cache');

const MAGIC = 'CPXF';
const FORMAT_VERSION = 1;
/** 字身框上限：决定位图打包字节数，放宽到 32 以容纳未来的大字面字体 */
const MAX_CELL = 32;

// ---------------------------------------------------------------- 参数解析

function parseArgs(argv) {
  const options = { only: [], list: false, localBdf: new Map(), subsetOverride: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--only') options.only.push(argv[++i]);
    else if (arg === '--subset') options.subsetOverride = argv[++i];
    else if (arg === '--bdf') {
      const [id, file] = String(argv[++i]).split('=');
      if (!id || !file) throw new Error('--bdf 需要 <id>=<path> 形式');
      options.localBdf.set(id, file);
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/build-pixel-fonts.mjs [--list] [--only <id>]... [--subset <名称>] [--bdf <id>=<path>]');
      process.exit(0);
    }
  }
  return options;
}

// ---------------------------------------------------------------- 字符集

/** GB2312 一级汉字（3755 个，按拼音序），覆盖约 99.5% 的日常用字 */
function gb2312Level1() {
  const decoder = new TextDecoder('gb2312');
  const chars = [];
  for (let hi = 0xb0; hi <= 0xd7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      try {
        chars.push(decoder.decode(new Uint8Array([hi, lo])));
      } catch {
        /* 非法区位码，跳过 */
      }
    }
  }
  return chars;
}

/** GB2312 二级汉字（3008 个） */
function gb2312Level2() {
  const decoder = new TextDecoder('gb2312');
  const chars = [];
  for (let hi = 0xd8; hi <= 0xf7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      try {
        chars.push(decoder.decode(new Uint8Array([hi, lo])));
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
  for (const cp of [0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x2014, 0x00b7]) {
    chars.push(String.fromCodePoint(cp));
  }
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

/** 把 BDF 字形归一化到 cellW×cellH 的统一字身框（保留基线对齐） */
function normalizeGlyph(glyph, fontBox, cellW, cellH) {
  const grid = Array.from({ length: cellH }, () => new Array(cellW).fill(false));
  const { width: gw, height: gh, xOffset: gxo, yOffset: gyo } = glyph.bbx;
  const boxTopY = fontBox.yOffset + fontBox.height;

  for (let row = 0; row < Math.min(gh, glyph.bitmap.length); row++) {
    const hex = glyph.bitmap[row].padEnd(Math.ceil(gw / 4), '0');
    const bits = BigInt(`0x${hex}`).toString(2).padStart(hex.length * 4, '0');
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

// ---------------------------------------------------------------- 取 BDF

async function fetchBdf(spec, options) {
  const local = options.localBdf.get(spec.id);
  if (local) {
    console.log(`    读取本地 BDF: ${local}`);
    return readFile(local, 'utf8');
  }

  const source = SOURCES[spec.source];
  await mkdir(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, source.member(spec.size, spec.mode));
  if (existsSync(cached)) {
    console.log(`    使用缓存: ${path.relative(FRONTEND_DIR, cached)}`);
    return readFile(cached, 'utf8');
  }

  if (source.zipUrl) {
    const zipName = path.basename(new URL(source.zipUrl(spec.size, spec.mode)).pathname);
    const zipPath = path.join(CACHE_DIR, zipName);
    const member = source.member(spec.size, spec.mode);
    console.log(`    下载 ${zipName} …`);
    const res = await fetch(source.zipUrl(spec.size, spec.mode), { redirect: 'follow' });
    if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', zipPath, member, '-d', CACHE_DIR], { stdio: 'inherit' });
    return readFile(path.join(CACHE_DIR, member), 'utf8');
  }

  // 直链（可能是 .gz）
  const url = source.plainUrl;
  const gzName = path.basename(new URL(url).pathname);
  console.log(`    下载 ${gzName} …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const text = url.endsWith('.gz')
    ? gunzipSync(raw).toString('utf8')
    : raw.toString('utf8');
  const target = path.join(CACHE_DIR, source.member(spec.size, spec.mode));
  await writeFile(target, text, 'utf8');
  return text;
}

// ---------------------------------------------------------------- 打包单个字体

async function buildFont(spec, options) {
  const source = SOURCES[spec.source];
  const subset = options.subsetOverride || spec.subset;

  console.log(`\n▶ ${spec.name}  (${spec.id})`);
  const bdfText = await fetchBdf(spec, options);
  const { fontBox, glyphs } = parseBdf(bdfText);

  const cellW = fontBox.width;
  const cellH = fontBox.height;
  if (cellW > MAX_CELL || cellH > MAX_CELL) {
    throw new Error(`字身框 ${cellW}×${cellH} 超过上限 ${MAX_CELL}`);
  }
  console.log(`    字身框 ${cellW}×${cellH}，BDF 字形 ${glyphs.length} 个`);

  const byCodepoint = new Map();
  for (const glyph of glyphs) byCodepoint.set(glyph.encoding, glyph);

  const charset = resolveCharset(subset);
  const wanted = charset ?? glyphs.map((g) => String.fromCodePoint(g.encoding));

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

  if (missing.length > 0) {
    const ratio = missing.length / Math.max(1, wanted.length);
    console.log(`    ⚠ 缺字 ${missing.length} 个（${(ratio * 100).toFixed(1)}%）: ${missing.slice(0, 20).join('')}`);
    if (ratio > 0.2) {
      throw new Error(
        `缺字率 ${(ratio * 100).toFixed(1)}% 过高，该字体不适合作为中文选项（` +
          `可在 manifest 中标记 disabled 跳过）`,
      );
    }
  }

  const bitmapBytes = Math.ceil((cellW * cellH) / 8);
  const recordSize = 2 + 1 + 1 + bitmapBytes;
  const headerSize = 9;
  const buffer = Buffer.alloc(headerSize + selected.length * recordSize);

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
    buffer.writeUInt8(0, offset); offset += 1;
    Buffer.from(packBitmap(normalizeGlyph(glyph, fontBox, cellW, cellH), cellW, cellH)).copy(buffer, offset);
    offset += bitmapBytes;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${spec.id}.bin`);
  await writeFile(outPath, buffer);

  console.log(
    `    ✓ ${path.basename(outPath)}  ${(buffer.length / 1024).toFixed(1)} KB  ` +
      `${selected.length} 字形（半宽 ${halfWidth} / 全宽 ${selected.length - halfWidth}）`,
  );

  return { spec, source, cellW, cellH, count: selected.length, bytes: buffer.length, subset };
}

// ---------------------------------------------------------------- NOTICE

async function writeNotice(built) {
  const usedSources = new Map();
  for (const item of built) usedSources.set(item.spec.source, item.source);

  const lines = [
    '本目录下的字体数据由 frontend/scripts/build-pixel-fonts.mjs 生成。',
    '',
    '这些字体都是**逐像素手工绘制的点阵（bitmap）字体**，通过 BDF 转换为紧凑二进制，',
    '不是把轮廓字体缩小后栅格化的产物，也没有使用加粗或整数倍放大来伪造字形。',
    '因此在 8~16px 下汉字笔画依然清晰可辨。',
    '',
    '──────────────────────────────────────────────',
    '字体清单',
    '──────────────────────────────────────────────',
  ];
  for (const item of built) {
    lines.push(
      `  ${item.spec.id}.bin`,
      `    名称：${item.spec.name}`,
      `    字面：${item.cellW}×${item.cellH}px，字形 ${item.count} 个，子集 ${item.subset}`,
      `    来源：${item.source.name}`,
      '',
    );
  }

  lines.push('──────────────────────────────────────────────', '授权', '──────────────────────────────────────────────');
  for (const source of usedSources.values()) {
    lines.push(
      `${source.name}`,
      `  ${source.homepage}`,
      `  ${source.copyright}`,
      `  授权：${source.license}`,
      '',
    );
  }
  lines.push(
    'SIL Open Font License 1.1 全文见 https://openfontlicense.org',
    '',
    '已排除的字体：',
    '  - Zpix（最像素）：需付费商业授权，且明确禁止修改/转换/拆分。',
    '  - Ark Pixel（方舟像素）10px：GB2312 一级常用字缺字约 84%，不适合中文。',
    '  - Cubic 11：仅提供轮廓格式（ttf/woff2），无点阵 BDF，',
    '    栅格化轮廓会糊掉笔画，不符合本项目「必须使用真实点阵」的要求。',
    '',
  );

  const noticePath = path.join(OUT_DIR, 'NOTICE.txt');
  await writeFile(noticePath, lines.join('\n'), 'utf8');
  console.log(`\n写出: ${path.relative(FRONTEND_DIR, noticePath)}`);
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    console.log('可用字体：\n');
    for (const spec of PIXEL_FONTS) {
      const flag = spec.disabled ? '  [已停用]' : '';
      console.log(`  ${spec.id.padEnd(24)} ${spec.name}${flag}`);
      console.log(`  ${''.padEnd(24)} ${spec.desc}`);
    }
    console.log('\n来源：');
    for (const [key, source] of Object.entries(SOURCES)) {
      console.log(`  ${key.padEnd(10)} ${source.name} — ${source.license}`);
      if (source.disabled) console.log(`  ${''.padEnd(10)} ⚠ ${source.disabledReason}`);
    }
    return;
  }

  await mkdir(CACHE_DIR, { recursive: true });

  let specs = PIXEL_FONTS;
  if (options.only.length > 0) {
    specs = options.only.map((id) => getFontSpec(id));
    // 显式指定时允许构建已停用字体（便于复现缺字率）
    specs = specs.filter(Boolean);
  } else {
    specs = specs.filter((spec) => !spec.disabled);
  }

  console.log(`准备构建 ${specs.length} 个字体：${specs.map((s) => s.id).join(', ')}`);

  const built = [];
  for (const spec of specs) {
    built.push(await buildFont(spec, options));
  }

  await writeNotice(built);

  const total = built.reduce((sum, item) => sum + item.bytes, 0);
  console.log(
    `\n完成：${built.length} 个字体，合计 ${(total / 1024).toFixed(1)} KB ` +
      `（运行时按需单独加载，不会一次性下载）`,
  );
}

main().catch((err) => {
  console.error('\n构建失败:', err.message);
  process.exit(1);
});
