/**
 * 子路径部署安全检查
 *
 * 背景：本项目部署在 GitHub Pages 的子路径 /CC-PinDou/ 下。
 * Vite 只会重写 index.html 里的资源路径，**不会**重写 TSX/TS 里手写的字符串。
 * 因此在组件里写 <img src="/logo.svg"> 会解析到域名根目录
 * （https://<user>.github.io/logo.svg），而不是 /CC-PinDou/logo.svg，直接 404 裂图。
 *
 * 这个 bug 真实发生过一次（首页顶部 logo 裂图），所以加一条静态扫描防止复发。
 * 正确写法是拼上 import.meta.env.BASE_URL，交给 vite 处理。
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(__dirname);

/** 资源类扩展名：命中这些才认为是「资源引用」，避免误报路由链接（如 href="/"） */
const ASSET_EXT = /\.(svg|png|jpe?g|gif|webp|ico|bmp|css|js|mjs|woff2?|otf|ttf|eot|json|bin|txt|mp3|mp4)$/i;

/** 匹配 JSX/字符串里的 src="/..." 与 href="/..." */
const ROOT_ABSOLUTE_ASSET = /(?:src|href)\s*[:=]\s*["'`](\/[^"'`]+)["'`]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉注释后再扫描：注释里写反例说明不应被误报 */
function stripComments(text: string): string {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX 注释 {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '')            // 块注释 /* ... */
    .replace(/^\s*\/\/.*$/gm, '');               // 整行注释 //
}

describe('子路径部署安全', () => {
  it('源码中不得出现指向根目录的资源路径（会导致 /CC-PinDou/ 部署下 404）', () => {
    const violations: string[] = [];

    for (const file of walk(SRC_DIR)) {
      const text = stripComments(readFileSync(file, 'utf8'));

      ROOT_ABSOLUTE_ASSET.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ROOT_ABSOLUTE_ASSET.exec(text)) !== null) {
        const target = match[1];
        if (!ASSET_EXT.test(target)) continue;
        // 已经通过 BASE_URL 拼接的写法是安全的
        if (match[0].includes('BASE_URL')) continue;
        violations.push(`${path.relative(SRC_DIR, file)}: ${target}`);
      }
    }

    expect(
      violations,
      `发现根绝对路径资源引用，子路径部署会 404。请改用 import.meta.env.BASE_URL 拼接：\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('字体数据的 URL 解析应基于 BASE_URL（而不是写死根路径）', () => {
    const loader = readFileSync(path.join(SRC_DIR, 'engine', 'pixelFontLoader.ts'), 'utf8');
    expect(loader).toContain('BASE_URL');
    // 字体元信息里存的应是相对路径（不带前导 /），由 resolveFontUrl 拼接
    const metas = loader.match(/url:\s*'([^']+)'/g) ?? [];
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      expect(meta).not.toMatch(/url:\s*'\//);
    }
  });
});
