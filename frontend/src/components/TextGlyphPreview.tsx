import { useEffect, useRef } from 'react';
import { textObjectMatrix } from '../engine/pixelText';

interface TextGlyphPreviewProps {
  /** 预览的文字 */
  text: string;
  /** 字体 id */
  font: string;
  /** 预览区域宽度（CSS 像素） */
  width?: number;
  /** 预览区域最大高度（CSS 像素） */
  maxHeight?: number;
  /** 颜色 */
  color?: string;
}

/**
 * 像素文字实时预览
 *
 * 直接把点阵矩阵按「1 个点阵像素 = 1 个屏幕像素」画出来，
 * 让用户在选择字体/倍率前就能看出实际字形，而不是靠猜。
 * 点阵矩阵与真正落盘的拼豆格一一对应。
 */
export function TextGlyphPreview({
  text,
  font,
  width = 226,
  maxHeight = 72,
  color = '#111827',
}: TextGlyphPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const matrix = textObjectMatrix({ text, font });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (matrix.width === 0 || matrix.height === 0) {
      canvas.width = 1;
      canvas.height = 1;
      wrapRef.current?.setAttribute('data-empty', 'true');
      return;
    }
    wrapRef.current?.removeAttribute('data-empty');

    // 1 点阵像素 = 1 屏幕像素；超出预览框时等比取整缩小（不插值，保持像素锐利）
    let dot = 1;
    while (
      (matrix.width * dot > width || matrix.height * dot > maxHeight) &&
      dot > 1
    ) {
      dot -= 1;
    }
    if (matrix.width > width || matrix.height > maxHeight) {
      dot = Math.max(
        1,
        Math.floor(Math.min(width / matrix.width, maxHeight / matrix.height)),
      );
    }

    canvas.width = matrix.width * dot;
    canvas.height = matrix.height * dot;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = color;

    for (let y = 0; y < matrix.height; y++) {
      for (let x = 0; x < matrix.width; x++) {
        if (!matrix.bits[y][x]) continue;
        ctx.fillRect(x * dot, y * dot, dot, dot);
      }
    }
  }, [text, font, width, maxHeight, color]);

  return (
    <div
      ref={wrapRef}
      data-empty="true"
      className="w-full min-h-[36px] max-h-[76px] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] flex items-center justify-center p-1.5"
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}
