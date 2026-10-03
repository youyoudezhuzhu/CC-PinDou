#!/usr/bin/env node
/**
 * 构建像素点阵字体数据（多字体）
 *
 * 为什么必须是 BDF？
 *   汉字的笔画极其密集，把轮廓字体（ttf/otf）缩小到 9~20px 再二值化会糊成一团、
 *   根本认不出字。必须使用字体设计师**逐像素手工绘制**的点阵字体。
 *   BDF 的每个字形本身就是一张位图，不存在轮廓栅格化问题。
 *
 * 同理，也不接受「把同一字形加粗 / 整数倍放大」来伪造新字体 ——
 * 本清单里的每个字体都是独立设计的，笔画细节各不相同。
 *
 * 用法：
 *   node scripts/build-pixel-fonts.mjs                    # 构建全部启用字体
 *   node scripts/build-pixel-fonts.mjs --list             # 只列出清单
 *   node scripts/build-pixel-fonts.mjs --only pixel-9-x11
 *   node scripts/build-pixel-fonts.mjs --bdf pixel-9-x11=/path/to.bdf
 *
 * 产物：
 *   public/fonts/<id>.bin    紧凑位图数据（运行时按需 lazy load）
 *   public/fonts/NOTICE.txt  全部字体的授权与出处（GPL 部分单独区分）
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
/** 字身框上限：决定位图打包字节数 */
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

function gb2312Range(hiFrom, hiTo) {
  const decoder = new TextDecoder('gb2312');
  const chars = [];
  for (let hi = hiFrom; hi <= hiTo; hi++) {
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

/** GB2312 一级汉字（3755 个，按拼音序），覆盖约 99.5% 的日常用字 */
const gb2312Level1 = () => gb2312Range(0xb0, 0xd7);
/** GB2312 二级汉字（3008 个） */
const gb2312Level2 = () => gb2312Range(0xd8, 0xf7);

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

/** 仅西文：ASCII + Latin-1 补充 + 常用排版符号（用于不含中文的显示字体） */
function latinCharset() {
  const chars = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) chars.push(String.fromCodePoint(cp));
  for (let cp = 0xa0; cp <= 0xff; cp++) chars.push(String.fromCodePoint(cp));
  for (const cp of [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2020, 0x2021, 0x2022,
    0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2212, 0x2260, 0x2264,
    0x2265, 0x25a0, 0x25b2, 0x25bc, 0x25c6, 0x2605,
  ]) {
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
    case 'latin':
      return latinCharset();
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

/**
 * 计算统一字身框。
 * 不能直接照抄 FONTBOUNDINGBOX：部分字体（如文泉驿 11pt）的字身框 xOffset 为负，
 * 或个别字形超出字身框，照抄会裁掉笔画最左/最右一列。这里按所有字形的实际
 * 包围盒取并集，保证任何字形都不会被裁。
 */
/**
 * 计算统一字身框。
 *
 * 直接照抄 FONTBOUNDINGBOX 会裁笔画：设计字身框并不总是覆盖所有字形，
 * 例如文泉驿 13px 的「中」比声明的字身框还高 1px。
 *
 * 但若直接对所有字形取并集，个别离群字形又会把整个框撑爆：
 * 例如缝合像素 10px 的竖排假名重复符 U+3031/U+3032 高 18px，
 * 会让字身框从 10px 变成 18px，数据体积翻倍、每行还多出大片空白。
 *
 * 因此以**设计字身框为核心、允许 tolerance 像素外扩**：
 * 容差内的字形参与并集（保住「中」这类常用字），
 * 超出容差的离群字形直接弃用（丢掉 〱〲 这类对中文拼豆无意义的标记）。
 */
const CORE_TOLERANCE = 2;

function computeCellMetrics(fontBox, glyphs, tolerance = CORE_TOLERANCE) {
  const withinTolerance = (glyph) => {
    const b = glyph.bbx;
    if (!b) return false;
    return (
      b.xOffset >= fontBox.xOffset - tolerance &&
      b.xOffset + b.width <= fontBox.xOffset + fontBox.width + tolerance &&
      b.yOffset >= fontBox.yOffset - tolerance &&
      b.yOffset + b.height <= fontBox.yOffset + fontBox.height + tolerance
    );
  };

  const kept = [];
  const dropped = [];
  for (const glyph of glyphs) {
    (withinTolerance(glyph) ? kept : dropped).push(glyph);
  }

  let minX = fontBox.xOffset;
  let maxX = fontBox.xOffset + fontBox.width;
  let minY = fontBox.yOffset;
  let maxY = fontBox.yOffset + fontBox.height;
  for (const glyph of kept) {
    minX = Math.min(minX, glyph.bbx.xOffset);
    maxX = Math.max(maxX, glyph.bbx.xOffset + glyph.bbx.width);
    minY = Math.min(minY, glyph.bbx.yOffset);
    maxY = Math.max(maxY, glyph.bbx.yOffset + glyph.bbx.height);
  }

  const leftShift = Math.max(0, -minX);
  return {
    // 并集保证每个保留下来的字形都完整落在框内，不需要再做裁剪
    cellW: maxX + leftShift,
    cellH: maxY - minY,
    leftShift,
    topY: maxY,
    kept,
    dropped,
  };
}

/** 把 BDF 字形归一化到统一字身框（保留基线对齐；并集保证不会裁笔画） */
function normalizeGlyph(glyph, metrics) {
  const { cellW, cellH, leftShift, topY } = metrics;
  const grid = Array.from({ length: cellH }, () => new Array(cellW).fill(false));
  const { width: gw, height: gh, xOffset: gxo, yOffset: gyo } = glyph.bbx;

  for (let row = 0; row < Math.min(gh, glyph.bitmap.length); row++) {
    const hex = glyph.bitmap[row].padEnd(Math.ceil(gw / 4), '0');
    const bits = BigInt(`0x${hex}`).toString(2).padStart(hex.length * 4, '0');
    const y = gyo + gh - 1 - row;
    const cellRow = topY - 1 - y;
    if (cellRow < 0 || cellRow >= cellH) continue;
    for (let col = 0; col < gw; col++) {
      if (bits[col] !== '1') continue;
      const cellCol = gxo + leftShift + col;
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

async function findFile(root, name) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

async function download(url, target) {
  console.log(`    下载 ${path.basename(target)} …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buffer);
  return buffer;
}

async function fetchBdf(spec, options) {
  const local = options.localBdf.get(spec.id);
  if (local) {
    console.log(`    读取本地 BDF: ${local}`);
    return readFile(local, 'utf8');
  }

  const source = SOURCES[spec.source];
  await mkdir(CACHE_DIR, { recursive: true });
  const member = source.member(spec.size, spec.mode);

  // 单文件直链（可能是 .gz）
  if (source.archive === 'gz') {
    const target = path.join(CACHE_DIR, member);
    if (existsSync(target)) {
      console.log(`    使用缓存: ${path.relative(FRONTEND_DIR, target)}`);
      return readFile(target, 'utf8');
    }
    const raw = await download(source.archiveUrl(), target);
    const text = gunzipSync(raw).toString('utf8');
    await writeFile(target, text, 'utf8');
    return text;
  }

  // 压缩包：整包解压到按来源分的目录，再按文件名查找
  const srcDir = path.join(CACHE_DIR, `src-${spec.source}`);
  const existing = await findFile(srcDir, member);
  if (existing) {
    console.log(`    使用缓存: ${path.relative(FRONTEND_DIR, existing)}`);
    return readFile(existing, 'utf8');
  }

  const url = source.archiveUrl(spec.size, spec.mode);
  const archivePath = path.join(CACHE_DIR, path.basename(new URL(url).pathname));
  if (!existsSync(archivePath)) await download(url, archivePath);
  await mkdir(srcDir, { recursive: true });

  if (source.archive === 'zip') {
    execFileSync('unzip', ['-o', '-q', archivePath, '-d', srcDir], { stdio: 'inherit' });
  } else {
    execFileSync('tar', ['xzf', archivePath, '-C', srcDir], { stdio: 'inherit' });
  }

  const found = await findFile(srcDir, member);
  if (!found) throw new Error(`压缩包 ${path.basename(archivePath)} 中找不到 ${member}`);
  return readFile(found, 'utf8');
}

// ---------------------------------------------------------------- 打包单个字体

async function buildFont(spec, options) {
  const source = SOURCES[spec.source];
  const subset = options.subsetOverride || spec.subset;

  console.log(`\n▶ ${spec.name}  (${spec.id})`);
  const bdfText = await fetchBdf(spec, options);
  const { fontBox, glyphs } = parseBdf(bdfText);

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

  // 字身框只按**实际选中的字形**计算（见 computeCellMetrics 的容差说明）
  const metrics = computeCellMetrics(fontBox, selected.map((item) => item.glyph));
  const { cellW, cellH } = metrics;
  const droppedSet = new Set(metrics.dropped);
  const usable = selected.filter((item) => !droppedSet.has(item.glyph));
  const overflow = selected.filter((item) => droppedSet.has(item.glyph));

  if (cellW > MAX_CELL || cellH > MAX_CELL) {
    throw new Error(`字身框 ${cellW}×${cellH} 超过上限 ${MAX_CELL}`);
  }
  console.log(
    `    选中 ${usable.length} 字形，字身框 ${fontBox.width}×${fontBox.height} → ${cellW}×${cellH}` +
      `${metrics.leftShift ? `（左移补偿 ${metrics.leftShift}px）` : ''}` +
      `${overflow.length ? `，弃用离群字形 ${overflow.length} 个: ${overflow.map((i) => String.fromCodePoint(i.cp)).slice(0, 12).join('')}` : ''}`,
  );

  const effectiveSubset = charset === null ? 'all' : subset;
  if (missing.length > 0) {
    const ratio = missing.length / Math.max(1, wanted.length);
    console.log(`    ⚠ 缺字 ${missing.length} 个（${(ratio * 100).toFixed(1)}%）: ${missing.slice(0, 24).join('')}`);
    if (ratio > 0.2) {
      throw new Error(
        `缺字率 ${(ratio * 100).toFixed(1)}% 过高，该字体不适合作为「${effectiveSubset}」选项`,
      );
    }
  }

  const bitmapBytes = Math.ceil((cellW * cellH) / 8);
  const recordSize = 2 + 1 + 1 + bitmapBytes;
  const headerSize = 9;
  const buffer = Buffer.alloc(headerSize + usable.length * recordSize);

  let offset = 0;
  buffer.write(MAGIC, offset, 'ascii'); offset += 4;
  buffer.writeUInt8(FORMAT_VERSION, offset); offset += 1;
  buffer.writeUInt8(cellW, offset); offset += 1;
  buffer.writeUInt8(cellH, offset); offset += 1;
  buffer.writeUInt16LE(usable.length, offset); offset += 2;

  // 全角步进宽度：取汉字「豆」的 DWIDTH，作为该字体的实际像素尺寸
  const fullWidthAdvance = byCodepoint.get(0x8c46)?.dwidth ?? cellW;

  let halfWidth = 0;
  for (const { cp, glyph } of usable) {
    buffer.writeUInt16LE(cp, offset); offset += 2;
    const advance = Math.max(1, Math.min(255, glyph.dwidth || glyph.bbx.width));
    if (advance <= cellW / 2) halfWidth++;
    buffer.writeUInt8(advance, offset); offset += 1;
    buffer.writeUInt8(0, offset); offset += 1;
    Buffer.from(packBitmap(normalizeGlyph(glyph, metrics), cellW, cellH)).copy(buffer, offset);
    offset += bitmapBytes;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${spec.id}.bin`);
  await writeFile(outPath, buffer);

  console.log(
    `    ✓ ${path.basename(outPath)}  ${(buffer.length / 1024).toFixed(1)} KB  ` +
      `${usable.length} 字形（半宽 ${halfWidth} / 全宽 ${usable.length - halfWidth}）` +
      `  全角步进 ${fullWidthAdvance}px`,
  );

  return {
    spec,
    source,
    cellW,
    cellH,
    fullWidthAdvance,
    count: usable.length,
    bytes: buffer.length,
    subset: effectiveSubset,
    missing: missing.length,
    overflow: overflow.length,
  };
}

// ---------------------------------------------------------------- NOTICE

async function writeNotice(built) {
  const permissive = built.filter((item) => !item.source.gpl);
  const gpl = built.filter((item) => item.source.gpl);

  const describe = (item) =>
    `  ${item.spec.id}.bin\n` +
    `    名称：${item.spec.name}\n` +
    `    字面：${item.cellW}×${item.cellH}px，全角步进 ${item.fullWidthAdvance}px，` +
    `字形 ${item.count} 个，子集 ${item.subset}` +
    `${item.missing ? `（缺字 ${item.missing} 个）` : '（无缺字）'}` +
    `${item.overflow ? `（弃用超框字形 ${item.overflow} 个）` : ''}\n` +
    `    来源：${item.source.name}\n` +
    `    授权：${item.source.license}\n`;

  const usedSources = new Map();
  for (const item of built) usedSources.set(item.spec.source, item.source);

  const lines = [
    '本目录下的字体数据由 frontend/scripts/build-pixel-fonts.mjs 生成。',
    '',
    '这些字体都是**逐像素手工绘制的点阵（bitmap）字体**，通过 BDF 转换为紧凑二进制，',
    '不是把轮廓字体缩小后栅格化的产物，也没有使用加粗或整数倍放大来伪造字形，',
    '因此在 9~20px 下笔画依然清晰可辨。每个字号都是针对该像素尺寸单独设计的。',
    '',
    '══════════════════════════════════════════════',
    '一、宽松授权字体（OFL-1.1 / MIT / 公有领域）',
    '══════════════════════════════════════════════',
    '',
    ...permissive.map(describe),
    '──────────────────────────────────────────────',
    '宽松授权来源',
    '──────────────────────────────────────────────',
  ];

  for (const [, source] of usedSources) {
    if (source.gpl) continue;
    lines.push(`${source.name}`, `  ${source.homepage}`, `  ${source.copyright}`, `  授权：${source.license}`, '');
  }

  if (gpl.length > 0) {
    lines.push(
      '══════════════════════════════════════════════',
      '二、GPL-2.0 字体（与本项目 MIT 代码分开授权）',
      '══════════════════════════════════════════════',
      '',
      '以下字体数据文件是文泉驿点阵宋体的子集化二进制转换，属于 GPL-2.0 的衍生作品，',
      '因此**这些 .bin 文件本身以 GPL-2.0 授权**，不适用本项目的 MIT 许可。',
      '它们与 MIT 代码仅作聚合分发，不影响其余代码的 MIT 授权。',
      '重新分发时请保留本说明并提供对应源码：',
      '  https://deb.debian.org/debian/pool/main/x/xfonts-wqy/xfonts-wqy_1.0.0~rc1.orig.tar.gz',
      '',
      ...gpl.map(describe),
      '──────────────────────────────────────────────',
      'GPL 来源',
      '──────────────────────────────────────────────',
    );
    for (const [, source] of usedSources) {
      if (!source.gpl) continue;
      lines.push(`${source.name}`, `  ${source.homepage}`, `  ${source.copyright}`, `  授权：${source.license}`, '');
    }
    lines.push('GNU GPL v2.0 全文见 https://www.gnu.org/licenses/old-licenses/gpl-2.0.html', '');
  }

  lines.push(
    '══════════════════════════════════════════════',
    '三、已排除的字体（附实测原因）',
    '══════════════════════════════════════════════',
    '',
    '  Zpix（最像素）',
    '    需付费商业授权，且明确禁止修改 / 转换 / 拆分，与本项目的分发方式冲突。',
    '',
    '  Ark Pixel 10px / 12px',
    '    10px：GB2312 一级常用字 3755 个缺 3153 个（84%）。',
    '    12px：仅缺 172 个（4.6%），但缺的是「热 然 旅 班 药 餐 紫 聚 警 辨 遥 避 酸」',
    '          这类高频常用字，日常中文几乎必然踩到缺字方框。',
    '',
    '  Jelly Pixel（果冻像素）12px',
    '    GB2312 一级常用字缺 3502 个（93%），实为拉丁字库，无法作为中文选项。',
    '',
    '  ChillBitmap（寒蝉点阵体）/ Cubic 11 / ZLabs RoundPix',
    '    仅提供轮廓格式（ttf / woff2），没有点阵 BDF。',
    '    栅格化轮廓会糊掉笔画，不符合本项目「必须使用真实点阵」的要求。',
    '',
    '  u8g2_wqy',
    '    仓库自称 MIT，但源本正是文泉驿点阵宋体（GPL-2.0），',
    '    不能通过重新标注许可洗掉原始授权，因此不采用。',
    '',
    '  M+ BITMAP FONTS / k14 / 12x13ja',
    '    日文位图字体，GB2312 一级常用字缺 37%~79%，中文覆盖率不足。',
    '',
    'SIL Open Font License 1.1 全文见 https://openfontlicense.org',
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
      const cov = spec.coverage === 'latin' ? '西文' : '中文';
      console.log(`  ${spec.id.padEnd(22)} ${spec.name.padEnd(24)} [${cov}]${flag}`);
      console.log(`  ${''.padEnd(22)} ${spec.desc}`);
    }
    console.log('\n来源：');
    for (const [key, source] of Object.entries(SOURCES)) {
      console.log(`  ${key.padEnd(10)} ${source.name} — ${source.license}`);
      if (source.disabled) console.log(`  ${''.padEnd(10)} ⚠ ${source.disabledReason}`);
    }
    return;
  }

  await mkdir(CACHE_DIR, { recursive: true });

  const specs = options.only.length > 0
    ? options.only.map((id) => getFontSpec(id))
    : PIXEL_FONTS.filter((spec) => !spec.disabled);

  console.log(`准备构建 ${specs.length} 个字体`);

  const built = [];
  for (const spec of specs) {
    built.push(await buildFont(spec, options));
  }

  await writeNotice(built);

  const permissiveBytes = built.filter((i) => !i.source.gpl).reduce((s, i) => s + i.bytes, 0);
  const gplBytes = built.filter((i) => i.source.gpl).reduce((s, i) => s + i.bytes, 0);
  console.log(
    `\n完成：${built.length} 个字体，合计 ${((permissiveBytes + gplBytes) / 1024).toFixed(1)} KB` +
      `（宽松授权 ${(permissiveBytes / 1024).toFixed(1)} KB / GPL ${(gplBytes / 1024).toFixed(1)} KB）` +
      `\n运行时按需单独加载，不会一次性下载`,
  );
}

main().catch((err) => {
  console.error('\n构建失败:', err.message);
  process.exit(1);
});
