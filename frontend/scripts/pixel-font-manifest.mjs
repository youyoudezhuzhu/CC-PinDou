/**
 * 像素字体清单
 *
 * 这里登记的每一个字体都是**独立设计的真实点阵字体**（BDF 位图），
 * 不是把同一个字形加粗、放大或做最近邻插值得到的 —— 那些做法在拼豆上
 * 只会让笔画糊掉，不算「另一种字体」。
 *
 * 授权要求：本项目是 MIT，字体数据以数据文件形式随软件分发，
 * 因此只接受 OFL-1.1 / MIT / 公有领域等允许改造与再分发的字体。
 * 已排除：Zpix（最像素）—— 需付费商业授权且明确禁止修改/转换/拆分。
 */

export const FUSION_VERSION = '2026.09.25';
export const ARK_VERSION = '2026.09.25';
export const UNIFONT_VERSION = '18.0.01';

export const SOURCES = {
  fusion: {
    name: 'Fusion Pixel Font（缝合像素字体）',
    homepage: 'https://github.com/TakWolf/fusion-pixel-font',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2022, TakWolf (https://takwolf.com)',
    zipUrl: (size, mode) =>
      `https://github.com/TakWolf/fusion-pixel-font/releases/download/${FUSION_VERSION}/` +
      `fusion-pixel-font-${size}-${mode}-bdf-v${FUSION_VERSION}.zip`,
    member: (size, mode) => `fusion-pixel-${size}-${mode}-zh_hans.bdf`,
  },
  ark: {
    name: 'Ark Pixel Font（方舟像素字体）',
    homepage: 'https://github.com/TakWolf/ark-pixel-font',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2022, TakWolf (https://takwolf.com)',
    zipUrl: (size, mode) =>
      `https://github.com/TakWolf/ark-pixel-font/releases/download/${ARK_VERSION}/` +
      `ark-pixel-font-${size}-${mode}-bdf-v${ARK_VERSION}.zip`,
    member: (size, mode) => `ark-pixel-${size}-${mode}-zh_hans.bdf`,
    /**
     * 实测：ark 10px 仅有 4074 个字形，GB2312 一级常用字 3755 个里缺 3153 个（约 84%）。
     * 官方 README 也说明该字体仍在开发中、缺字严重，10/12px 建议改用缝合像素字体。
     * 因此这里保留登记信息但默认不构建（可用 --only pixel-10-ark-mono 强制尝试）。
     */
    disabled: true,
    disabledReason: 'GB2312 一级常用字缺字约 84%，不适合作为中文选项',
  },
  unifont: {
    name: 'GNU Unifont',
    homepage: 'https://unifoundry.com/unifont/',
    license: 'SIL Open Font License 1.1（同时提供 GPLv2+ 与字体嵌入例外，此处按 OFL-1.1 使用）',
    copyright: 'Copyright (C) 1998-2025 Roman Czyborra, Paul Hardy, et al.',
    plainUrl: `https://unifoundry.com/pub/unifont/unifont-${UNIFONT_VERSION}/font-builds/unifont-${UNIFONT_VERSION}.bdf.gz`,
    member: () => `unifont-${UNIFONT_VERSION}.bdf`,
  },
};

/**
 * 字体清单（顺序即 UI 展示顺序）
 *
 * width 为全角字宽（汉字占用的格数），用于 UI 提示；
 * 实际以 BDF 的字身框为准，构建时会自动读取并校验。
 */
export const PIXEL_FONTS = [
  {
    id: 'pixel-8-fusion-mono',
    name: '缝合像素 8px 等宽',
    group: '8 像素',
    desc: '最紧凑，适合小图纸与长文本',
    source: 'fusion',
    size: '8px',
    mode: 'monospaced',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
  },
  {
    id: 'pixel-10-fusion-mono',
    name: '缝合像素 10px 等宽',
    group: '10 像素',
    desc: '紧凑，笔画比 8px 清晰',
    source: 'fusion',
    size: '10px',
    mode: 'monospaced',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
  },
  {
    id: 'pixel-10-ark-mono',
    name: '方舟像素 10px 等宽',
    group: '10 像素',
    desc: '另一套字形设计（缺字严重，默认不构建）',
    source: 'ark',
    size: '10px',
    mode: 'monospaced',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
    disabled: true,
  },
  {
    id: 'pixel-12-fusion-mono',
    name: '缝合像素 12px 等宽',
    group: '12 像素',
    desc: '标准选择，汉字清晰、严格对齐',
    source: 'fusion',
    size: '12px',
    mode: 'monospaced',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
  },
  {
    id: 'pixel-12-fusion-prop',
    name: '缝合像素 12px 比例',
    group: '12 像素',
    desc: '按字形实际宽度分配字距，排版更自然',
    source: 'fusion',
    size: '12px',
    mode: 'proportional',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
  },
  {
    id: 'pixel-16-unifont',
    name: 'Unifont 16px 等宽',
    group: '16 像素',
    desc: '字面最大，复杂汉字笔画最清晰',
    source: 'unifont',
    letterSpacing: 0,
    lineSpacing: 1,
    subset: 'gb2312-1',
  },
];

export function getFontSpec(id) {
  const spec = PIXEL_FONTS.find((font) => font.id === id);
  if (!spec) throw new Error(`未知字体 id: ${id}`);
  return spec;
}
