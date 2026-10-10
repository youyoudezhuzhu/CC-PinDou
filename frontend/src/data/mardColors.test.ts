/**
 * MARD 色值数据完整性测试
 *
 * 背景：项目里的 MARD 色值原本只有 43% 与 MARD 官方色卡一致
 * （色号本身 100% 对得上，但色值大面积偏差，例如 Q05 从浅蓝变成墨绿灰）。
 * 现已全量同步到 data/mard-chart/mard-2026-rev.json。
 *
 * 这个测试保证：将来谁再手工改色值、或只改其中一份数据文件，都会被立刻发现。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import mappingJson from './colorSystemMapping.json';

const ROOT = path.resolve(__dirname, '../../..');
const CHART_PATH = path.join(ROOT, 'data/mard-chart/mard-2026-rev.json');

/**
 * 已知例外：权威色卡里 Q04 与 R11 是同一个色值 #FFEBFA，
 * 但本项目数据结构以 hex 为 key，同一 hex 无法承载两个 MARD 色号，
 * 直接同步会把 291 色并成 290 色。local Q04 已等于权威值，
 * 故保留 R11 的独立值。详见 scripts/sync-mard-colors.py 的 EXCEPTIONS。
 */
const EXCEPTIONS: Record<string, string> = { R11: '#FFEBFB' };

function normCode(code: string): string {
  const m = /^([A-Za-z]+)0*(\d+)$/.exec(String(code).trim());
  return m ? `${m[1].toUpperCase()}${String(Number(m[2])).padStart(2, '0')}` : String(code).toUpperCase();
}

function loadChart(): Record<string, string> {
  const raw = JSON.parse(readFileSync(CHART_PATH, 'utf8'));
  const out: Record<string, string> = {};
  for (const [code, hex] of Object.entries(raw.colors as Record<string, string>)) {
    out[normCode(code)] = hex.toUpperCase();
  }
  return out;
}

describe('MARD 色值权威数据', () => {
  const chart = loadChart();
  const mapping = mappingJson as unknown as Record<string, Record<string, string>>;

  it('权威色卡快照应为 291 色', () => {
    expect(Object.keys(chart)).toHaveLength(291);
  });

  it('colorSystemMapping.json 应为 291 条，且 MARD 色号与权威完全一致', () => {
    expect(Object.keys(mapping)).toHaveLength(291);
    const codes = Object.values(mapping)
      .map((c) => c.MARD)
      .filter(Boolean)
      .map(normCode);
    expect(codes).toHaveLength(291);
    expect(new Set(codes)).toHaveLength(291);
    expect([...codes].sort()).toEqual([...Object.keys(chart)].sort());
  });

  it('每个 MARD 色值都必须等于权威色卡（例外除外）', () => {
    const mismatched: Array<[string, string, string]> = [];
    for (const [hex, codes] of Object.entries(mapping)) {
      const code = codes.MARD && normCode(codes.MARD);
      if (!code || code in EXCEPTIONS) continue;
      if (chart[code] !== hex.toUpperCase()) {
        mismatched.push([code, hex.toUpperCase(), chart[code]]);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('例外项必须仍然是显式登记的，不能悄悄失效', () => {
    for (const [code, expected] of Object.entries(EXCEPTIONS)) {
      const hit = Object.entries(mapping).find(([, c]) => c.MARD && normCode(c.MARD) === code);
      expect(hit, `例外色号 ${code} 应仍存在`).toBeDefined();
      expect(hit![0].toUpperCase()).toBe(expected);
    }
  });

  it('两份 colorSystemMapping.json 必须保持一致（避免只改一份）', () => {
    const backend = readFileSync(path.join(ROOT, 'data/colorSystemMapping.json'), 'utf8');
    const frontend = readFileSync(path.join(__dirname, 'colorSystemMapping.json'), 'utf8');
    expect(backend).toBe(frontend);
  });

  it('其他品牌的字段不能被误改', () => {
    for (const codes of Object.values(mapping)) {
      for (const brand of ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']) {
        expect(codes[brand], `${brand} 字段缺失`).toBeTruthy();
      }
    }
  });
});
