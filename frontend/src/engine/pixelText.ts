/**
 * 像素文字 → 真实拼豆格
 *
 * 这是文字工具的核心：把 TextObject 展开成**真实的拼豆格坐标**。
 *
 * 关键约束：
 *  - 倍数缩放改变的是真实拼豆数量：scale=2 时每个点阵像素展开为 2×2 个格子。
 *    绝不使用 transform: scale()，也不通过放大图片模拟。
 *  - 位图中的 '0' 不产生任何格子 → 背景透明，不会覆盖已有拼豆。
 *  - 越界部分直接裁剪，不写越界坐标、不抛异常。
 */

import type { TextObject } from '../types/perler';
import { getPixelFont, renderTextToMatrix, type PixelFont, type PixelMatrix } from './pixelFont';

/** 单个拼豆格坐标（整数网格坐标） */
export interface TextCell {
  x: number;
  y: number;
}

/** 画布边界（行数 / 列数），用于裁剪 */
export interface TextBounds {
  rows: number;
  cols: number;
}

export const MIN_TEXT_SCALE = 1;
export const MAX_TEXT_SCALE = 16;

/** 规范化倍数：取整数并限制在合理区间，避免 0 或小数产生非法展开 */
export function normalizeScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_TEXT_SCALE;
  const rounded = Math.round(scale);
  return Math.max(MIN_TEXT_SCALE, Math.min(MAX_TEXT_SCALE, rounded));
}

/** 解析文字对象对应的点阵字体 */
export function resolveFont(object: Pick<TextObject, 'font'>): PixelFont {
  return getPixelFont(object.font);
}

/** 取文字的点阵矩阵（未放大） */
export function textObjectMatrix(object: Pick<TextObject, 'text' | 'font'>): PixelMatrix {
  return renderTextToMatrix(object.text, resolveFont(object));
}

/** 文字的点阵尺寸（像素个数，未放大） */
export function textObjectPixelSize(
  object: Pick<TextObject, 'text' | 'font'>,
): { width: number; height: number } {
  const matrix = textObjectMatrix(object);
  return { width: matrix.width, height: matrix.height };
}

/** 文字的拼豆格尺寸（已按倍数展开，即真实占用的格子数） */
export function textObjectSize(
  object: Pick<TextObject, 'text' | 'font' | 'scale'>,
): { width: number; height: number } {
  const matrix = textObjectMatrix(object);
  const scale = normalizeScale(object.scale);
  return { width: matrix.width * scale, height: matrix.height * scale };
}

/**
 * 将文字对象展开为真实拼豆格坐标列表。
 *
 * @param object 文字对象（x/y 会被取整，保证严格对齐网格）
 * @param bounds 画布尺寸；提供时超出部分被裁剪，不提供则不裁剪
 */
export function textObjectToCells(
  object: Pick<TextObject, 'text' | 'font' | 'scale' | 'x' | 'y'>,
  bounds?: TextBounds,
): TextCell[] {
  const matrix = textObjectMatrix(object);
  if (matrix.width === 0 || matrix.height === 0) return [];

  const scale = normalizeScale(object.scale);
  const originX = Math.round(object.x);
  const originY = Math.round(object.y);

  const minX = bounds ? 0 : -Infinity;
  const minY = bounds ? 0 : -Infinity;
  const maxX = bounds ? bounds.cols - 1 : Infinity;
  const maxY = bounds ? bounds.rows - 1 : Infinity;

  // 整块文字完全在画布外时提前返回，避免无谓遍历
  if (bounds) {
    const blockWidth = matrix.width * scale;
    const blockHeight = matrix.height * scale;
    if (originX > maxX || originY > maxY) return [];
    if (originX + blockWidth - 1 < minX || originY + blockHeight - 1 < minY) return [];
  }

  const cells: TextCell[] = [];
  for (let py = 0; py < matrix.height; py++) {
    const row = matrix.bits[py];
    for (let px = 0; px < matrix.width; px++) {
      // '0' → 什么都不做，背景保持原样
      if (!row[px]) continue;
      for (let sy = 0; sy < scale; sy++) {
        const gy = originY + py * scale + sy;
        if (gy < minY || gy > maxY) continue;
        for (let sx = 0; sx < scale; sx++) {
          const gx = originX + px * scale + sx;
          if (gx < minX || gx > maxX) continue;
          cells.push({ x: gx, y: gy });
        }
      }
    }
  }
  return cells;
}

/** 展开后落在画布内的拼豆数量（用于 UI 提示） */
export function countTextBeads(
  object: Pick<TextObject, 'text' | 'font' | 'scale' | 'x' | 'y'>,
  bounds?: TextBounds,
): number {
  return textObjectToCells(object, bounds).length;
}

/**
 * 判断文字整体是否超出画布。
 * 用于 UI 友好提示「超出部分会被裁剪」，而不是报错。
 */
export function isTextOutOfBounds(
  object: Pick<TextObject, 'text' | 'font' | 'scale' | 'x' | 'y'>,
  bounds: TextBounds,
): boolean {
  const { width, height } = textObjectSize(object);
  if (width === 0 || height === 0) return false;
  const originX = Math.round(object.x);
  const originY = Math.round(object.y);
  return (
    originX < 0 ||
    originY < 0 ||
    originX + width > bounds.cols ||
    originY + height > bounds.rows
  );
}

/** 创建一个默认文字对象 */
export function createTextObject(init: Partial<TextObject> = {}): TextObject {
  return {
    type: 'text',
    id: init.id ?? `text-${Math.random().toString(36).slice(2, 11)}`,
    text: init.text ?? 'HELLO',
    font: init.font ?? 'pixel-5x7',
    scale: normalizeScale(init.scale ?? 1),
    color: init.color ?? '#000000',
    codes: init.codes ? { ...init.codes } : {},
    x: Math.round(init.x ?? 0),
    y: Math.round(init.y ?? 0),
  };
}
