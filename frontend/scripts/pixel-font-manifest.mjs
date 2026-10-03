/**
 * 像素字体清单
 *
 * 这里登记的每一个字体都是**独立设计的真实点阵字体**（BDF 位图），
 * 不是把同一个字形加粗、放大或做最近邻插值得到的 —— 那些做法在拼豆上
 * 只会让笔画糊掉，不算「另一种字体」。
 *
 * 授权要求：本项目代码是 MIT，字体数据以独立数据文件形式随软件分发。
 * 优先使用 OFL / MIT / 公有领域字体；文泉驿点阵宋体为 GPL-2.0，
 * 因为是唯一覆盖 13/14/15px 的中文点阵字体而按用户决定引入，
 * 其数据文件单独以 GPL-2.0 授权并在 NOTICE.txt 中明确区分。
 *
 * 已排除：
 *   - Zpix（最像素）：需付费商业授权，且明确禁止修改/转换/拆分
 *   - Ark Pixel 10px：GB2312 一级常用字缺 84%
 *   - Ark Pixel 12px：缺字仅 4.6%，但缺的是「热/旅/班/药/餐/紫」等高频字
 *   - Jelly Pixel 12px：缺 93%，实为拉丁字库
 *   - ChillBitmap / Cubic 11 / ZLabs RoundPix：只有轮廓格式（ttf/woff2），无点阵 BDF
 */

export const FUSION_VERSION = '2026.09.25';
export const ARK_VERSION = '2026.09.25';
export const UNIFONT_VERSION = '18.0.01';
export const X11_MISC_VERSION = '1.1.3';

const X11_MISC_TARBALL = `https://xorg.freedesktop.org/releases/individual/font/font-misc-misc-${X11_MISC_VERSION}.tar.gz`;
const WQY_TARBALL = 'https://deb.debian.org/debian/pool/main/x/xfonts-wqy/xfonts-wqy_1.0.0~rc1.orig.tar.gz';

export const SOURCES = {
  fusion: {
    name: 'Fusion Pixel Font（缝合像素字体）',
    homepage: 'https://github.com/TakWolf/fusion-pixel-font',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2022, TakWolf (https://takwolf.com)',
    archive: 'zip',
    archiveUrl: (size, mode) =>
      `https://github.com/TakWolf/fusion-pixel-font/releases/download/${FUSION_VERSION}/` +
      `fusion-pixel-font-${size}-${mode}-bdf-v${FUSION_VERSION}.zip`,
    member: (size, mode) => `fusion-pixel-${size}-${mode}-zh_hans.bdf`,
  },
  ark: {
    name: 'Ark Pixel Font（方舟像素字体）',
    homepage: 'https://github.com/TakWolf/ark-pixel-font',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2022, TakWolf (https://takwolf.com)',
    archive: 'zip',
    archiveUrl: (size, mode) =>
      `https://github.com/TakWolf/ark-pixel-font/releases/download/${ARK_VERSION}/` +
      `ark-pixel-font-${size}-${mode}-bdf-v${ARK_VERSION}.zip`,
    member: (size, mode) => `ark-pixel-${size}-${mode}-zh_hans.bdf`,
    /**
     * 实测（2026.09.25 版）：
     *   ark 10px：GB2312 一级常用字 3755 个里缺 3153 个（84%），基本不可用
     *   ark 12px：缺 172 个（4.6%），但缺的偏偏是「热 然 旅 班 药 餐 紫 聚 警 辨
     *             遥 避 酸 鉴 骤 恋 恐 悠 慈 执 拖 拳 搬 摇」这类高频常用字，
     *             用户输入日常中文几乎必然踩到缺字方框，因此同样不采用。
     * 官方 README 也说明该字体仍在开发中、缺字严重。
     */
    disabled: true,
    disabledReason: '12px 缺字虽仅 4.6%，但缺失的是高频常用字（热/旅/班/药/餐/紫…），日常中文会踩到缺字',
  },
  unifont: {
    name: 'GNU Unifont',
    homepage: 'https://unifoundry.com/unifont/',
    license: 'SIL Open Font License 1.1（同时提供 GPLv2+ 与字体嵌入例外，此处按 OFL-1.1 使用）',
    copyright: 'Copyright (C) 1998-2025 Roman Czyborra, Paul Hardy, et al.',
    archive: 'gz',
    archiveUrl: () =>
      `https://unifoundry.com/pub/unifont/unifont-${UNIFONT_VERSION}/font-builds/unifont-${UNIFONT_VERSION}.bdf.gz`,
    member: () => `unifont-${UNIFONT_VERSION}.bdf`,
  },
  x11: {
    name: 'X11 misc-fixed（Xorg 经典位图字体）',
    homepage: 'https://gitlab.freedesktop.org/xorg/font/misc-misc',
    license: 'Public domain',
    copyright: 'Public domain font. Share and enjoy.',
    archive: 'tar.gz',
    archiveUrl: () => X11_MISC_TARBALL,
    member: (size) => `${size}.bdf`,
    /**
     * 说明：18x18ja 虽然文件名带 ja，但实测其 ISO10646-1 映射包含完整简体字形，
     * GB2312 一级常用字 3755 个一个不缺，「图 门 车 见 直 者 每 海 骨 画 真」
     * 均为正确的简体写法，因此可作 18px 中文字体使用。
     */
  },
  wqy: {
    name: '文泉驿点阵宋体（WenQuanYi Bitmap Song）',
    homepage: 'http://wenq.org/',
    license: 'GNU GPL v2.0（含字体嵌入例外）',
    copyright: "Copyright (C) 2004-2007, WenQuanYi's Board of Trustees and Qianqian Fang",
    archive: 'tar.gz',
    archiveUrl: () => WQY_TARBALL,
    /** 文件名的 pt 与实际像素尺寸并不一致，按实测全角步进宽度命名（见 fonts 中的 size 映射） */
    member: (size) => `${size}.bdf`,
    gpl: true,
  },
};

/**
 * 字体清单（顺序即 UI 展示顺序）
 *
 * size 是「来源内的 BDF 文件名主干」，实际像素尺寸由构建时读取字身框与
 * 全角步进宽度得到，并写入 NOTICE，避免被上下游的命名误导。
 */
export const PIXEL_FONTS = [
  // ── 中文 · 黑体风格（OFL-1.1）──
  {
    id: 'pixel-8-fusion-mono',
    name: '缝合像素 8px 等宽',
    group: '8 像素',
    desc: '最紧凑，适合小图纸与长文本（笔画为 8px 专门简化）',
    source: 'fusion',
    size: '8px',
    mode: 'monospaced',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-10-fusion-mono',
    name: '缝合像素 10px 等宽',
    group: '10 像素',
    desc: '紧凑，笔画比 8px 更清晰',
    source: 'fusion',
    size: '10px',
    mode: 'monospaced',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-12-fusion-mono',
    name: '缝合像素 12px 等宽',
    group: '12 像素',
    desc: '标准选择，汉字清晰、严格对齐网格',
    source: 'fusion',
    size: '12px',
    mode: 'monospaced',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-12-fusion-prop',
    name: '缝合像素 12px 比例',
    group: '12 像素',
    desc: '按字形实际宽度分配字距，行高更宽松，排版更自然',
    source: 'fusion',
    size: '12px',
    mode: 'proportional',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },

  // ── 中文 · 宋体风格（文泉驿，GPL-2.0）──
  {
    id: 'pixel-12-wqy',
    name: '文泉驿点阵宋体 12px',
    group: '12 像素',
    desc: '宋体风格，横细竖粗带衬线，与黑体观感明显不同',
    source: 'wqy',
    size: 'wenquanyi_9pt',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-13-wqy',
    name: '文泉驿点阵宋体 13px',
    group: '13 像素',
    desc: '宋体风格，13px 专门设计',
    source: 'wqy',
    size: 'wenquanyi_10pt',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-14-wqy',
    name: '文泉驿点阵宋体 14px',
    group: '14 像素',
    desc: '宋体风格，14px 中文笔画更宽松',
    source: 'wqy',
    size: 'wenquanyi_13px',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-15-wqy',
    name: '文泉驿点阵宋体 15px',
    group: '15 像素',
    desc: '宋体风格，笔画更舒展',
    source: 'wqy',
    size: 'wenquanyi_11pt',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },
  {
    id: 'pixel-16-wqy',
    name: '文泉驿点阵宋体 16px',
    group: '16 像素',
    desc: '宋体风格，中文细节最完整',
    source: 'wqy',
    size: 'wenquanyi_12pt',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },

  // ── 中文 · 16px 等宽（OFL-1.1）──
  {
    id: 'pixel-16-unifont',
    name: 'Unifont 16px 等宽',
    group: '16 像素',
    desc: '字面大，复杂汉字笔画最清晰，占豆也最多',
    source: 'unifont',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },

  // ── 中文 · 18px（公有领域）──
  {
    id: 'pixel-18-x11',
    name: 'X11 18px 等宽',
    group: '18 像素',
    desc: '18px 中文，公有领域位图，字形为简体写法',
    source: 'x11',
    size: '18x18ja',
    subset: 'gb2312-1',
    coverage: 'cjk',
  },

  // ── 西文 / 数字 / 符号（公有领域，无中文）──
  {
    id: 'pixel-9-x11',
    name: 'X11 9px 等宽',
    group: '9 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    source: 'x11',
    size: '6x9',
    subset: 'latin',
    coverage: 'latin',
  },
  {
    id: 'pixel-14-x11',
    name: 'X11 14px 等宽',
    group: '14 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    source: 'x11',
    size: '7x14',
    subset: 'latin',
    coverage: 'latin',
  },
  {
    id: 'pixel-20-x11',
    name: 'X11 20px 等宽',
    group: '20 像素',
    desc: '西文 / 数字 / 符号（不含中文）',
    source: 'x11',
    size: '10x20',
    subset: 'latin',
    coverage: 'latin',
  },
];

export function getFontSpec(id) {
  const spec = PIXEL_FONTS.find((font) => font.id === id);
  if (!spec) throw new Error(`未知字体 id: ${id}`);
  return spec;
}
