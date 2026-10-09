/**
 * 田字格定位测试
 *
 * 核心是分组线的判定函数 isGuideLine：
 * 编辑器和导出（exportImageFrontend）共用同一份实现，
 * 所以只要它是对的，两边画出来的田字格就必然一致。
 * 位移支持负数，等价于「把无限大的田字格整体平移」。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isGuideLine } from '../hooks/useCanvasRenderer';
import { GridGuidePanel } from './GridGuidePanel';
import { useConfigStore } from '../store/useConfigStore';

describe('isGuideLine / 分组线判定', () => {
  it('位移为 0 时应落在 0、interval、2×interval…', () => {
    expect(isGuideLine(0, 5, 0)).toBe(true);
    expect(isGuideLine(5, 5, 0)).toBe(true);
    expect(isGuideLine(10, 5, 0)).toBe(true);
    expect(isGuideLine(1, 5, 0)).toBe(false);
    expect(isGuideLine(4, 5, 0)).toBe(false);
    expect(isGuideLine(6, 5, 0)).toBe(false);
  });

  it('正位移应把分组线整体后移', () => {
    // 位移 3、间隔 5 → 落在 3、8、13
    expect(isGuideLine(3, 5, 3)).toBe(true);
    expect(isGuideLine(8, 5, 3)).toBe(true);
    expect(isGuideLine(13, 5, 3)).toBe(true);
    expect(isGuideLine(0, 5, 3)).toBe(false);
    expect(isGuideLine(5, 5, 3)).toBe(false);
  });

  it('负位移也要正确处理（无限大田字格向左上推移）', () => {
    // 位移 -2、间隔 5 → 落在 3、8、13（因为 -2 与 3 同余）
    expect(isGuideLine(3, 5, -2)).toBe(true);
    expect(isGuideLine(8, 5, -2)).toBe(true);
    expect(isGuideLine(0, 5, -2)).toBe(false);
    // 位移 -5 与 0 等价
    expect(isGuideLine(5, 5, -5)).toBe(true);
    expect(isGuideLine(10, 5, -5)).toBe(true);
  });

  it('位移超过一个间隔时应等价于取模', () => {
    for (const i of [2, 7, 12, 17]) {
      expect(isGuideLine(i, 5, 12)).toBe(true); // 12 % 5 === 2
    }
    expect(isGuideLine(0, 5, 12)).toBe(false);
  });

  it('非法间隔应一律返回 false，避免除零画出满屏线', () => {
    expect(isGuideLine(0, 0, 0)).toBe(false);
    expect(isGuideLine(5, -3, 0)).toBe(false);
    expect(isGuideLine(5, NaN, 0)).toBe(false);
  });

  it('小格与大格可同时命中：大格优先由调用方处理', () => {
    // 10 既是 5 的倍数也是 10 的倍数
    expect(isGuideLine(10, 5, 0)).toBe(true);
    expect(isGuideLine(10, 10, 0)).toBe(true);
    // 5 只命中 5，不命中 10
    expect(isGuideLine(5, 5, 0)).toBe(true);
    expect(isGuideLine(5, 10, 0)).toBe(false);
  });
});

describe('编辑器与导出共用同一份判定逻辑', () => {
  it('exportImageFrontend 必须复用 isGuideLine，不能各写一套', () => {
    const algorithms = readFileSync(
      path.resolve(__dirname, '../engine/frontendAlgorithms.ts'),
      'utf8',
    );
    // 导入自 useCanvasRenderer
    expect(algorithms).toMatch(/import\s*\{[^}]*isGuideLine[^}]*\}\s*from\s*'\.\.\/hooks\/useCanvasRenderer'/);
    // 并且确实在网格线绘制里调用了它
    const gridSection = algorithms.slice(algorithms.indexOf('田字格辅助线'));
    expect(gridSection).toContain('isGuideLine');
  });

  it('后端 export_generator.py 也必须是同一套两级 + 位移逻辑', () => {
    const py = readFileSync(
      path.resolve(__dirname, '../../../server/export_generator.py'),
      'utf8',
    );
    expect(py).toContain('_is_guide_line');
    expect(py).toContain('minor_interval');
    expect(py).toContain('grid_offset_x');
    expect(py).toContain('grid_offset_y');
  });
});

describe('GridGuidePanel（右侧栏卡片）', () => {
  // 忠实模拟 App：右侧栏卡片直接订阅 store，改动实时写回
  function renderPanel() {
    return render(<GridGuidePanel />);
  }

  /** 按标签文字定位开关，避免依赖 checkbox 排列顺序 */
  function switchFor(labelText: string) {
    const label = screen.getByText(labelText);
    const input = label.parentElement?.querySelector('input[type="checkbox"]');
    if (!input) throw new Error(`未找到「${labelText}」对应的开关`);
    return input as HTMLInputElement;
  }

  beforeEach(() => {
    useConfigStore.setState({
      canvasConfig: {
        ...useConfigStore.getState().canvasConfig,
        showMarkLines: false,
        minorInterval: 5,
        markInterval: 10,
        minorLineWidth: 2,
        majorLineWidth: 4,
        gridOffsetX: 0,
        gridOffsetY: 0,
      },
    });
  });
  afterEach(cleanup);

  it('开关必须实时生效（不走草稿确认）', () => {
    renderPanel();
    expect(useConfigStore.getState().canvasConfig.showMarkLines).toBe(false);
    fireEvent.click(switchFor('显示田字格'));
    expect(useConfigStore.getState().canvasConfig.showMarkLines).toBe(true);
  });

  it('开启后应展示全部设置项（含线宽）', () => {
    useConfigStore.setState({
      canvasConfig: { ...useConfigStore.getState().canvasConfig, showMarkLines: true },
    });
    renderPanel();
    expect(screen.getByText('小格 · 细线')).toBeInTheDocument();
    expect(screen.getByText('大格 · 粗线')).toBeInTheDocument();
    expect(screen.getByText('细线粗细')).toBeInTheDocument();
    expect(screen.getByText('粗线粗细')).toBeInTheDocument();
    expect(screen.getByText('位移（格）')).toBeInTheDocument();
  });

  it('方向键应逐格移动田字格（实时写入 canvasConfig，可连续累加）', () => {
    useConfigStore.setState({
      canvasConfig: { ...useConfigStore.getState().canvasConfig, showMarkLines: true },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '田字格右移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetX).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '田字格右移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetX).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '田字格左移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetX).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '田字格下移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetY).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '田字格上移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetY).toBe(0);
  });

  it('位移可以为负数（无限大田字格向左上推移）', () => {
    useConfigStore.setState({
      canvasConfig: { ...useConfigStore.getState().canvasConfig, showMarkLines: true },
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '田字格左移一格' }));
    fireEvent.click(screen.getByRole('button', { name: '田字格上移一格' }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetX).toBe(-1);
    expect(useConfigStore.getState().canvasConfig.gridOffsetY).toBe(-1);
  });

  it('归零应把 X / Y 位移都复位', () => {
    useConfigStore.setState({
      canvasConfig: {
        ...useConfigStore.getState().canvasConfig,
        showMarkLines: true,
        gridOffsetX: 7,
        gridOffsetY: -3,
      },
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /归零/ }));
    expect(useConfigStore.getState().canvasConfig.gridOffsetX).toBe(0);
    expect(useConfigStore.getState().canvasConfig.gridOffsetY).toBe(0);
  });

  it('应显示当前间隔、线宽与位移数值', () => {
    useConfigStore.setState({
      canvasConfig: {
        ...useConfigStore.getState().canvasConfig,
        showMarkLines: true,
        minorInterval: 5,
        markInterval: 10,
        minorLineWidth: 3,
        majorLineWidth: 6,
        gridOffsetX: 2,
        gridOffsetY: -1,
      },
    });
    renderPanel();
    expect(screen.getByText('5 格')).toBeInTheDocument();
    expect(screen.getByText('10 格')).toBeInTheDocument();
    expect(screen.getByText('3px')).toBeInTheDocument();
    expect(screen.getByText('6px')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('必须挂在右侧栏（App 里位于背景图层面板下方），且不是模态弹窗', () => {
    const app = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    const imgIdx = app.indexOf('<ImageLayerPanel />');
    const guideIdx = app.indexOf('<GridGuidePanel />');
    expect(imgIdx).toBeGreaterThan(-1);
    expect(guideIdx).toBeGreaterThan(imgIdx);
    // 不应再出现在设置弹窗里（不能再有绑定 showMarkLines 的控件）
    const settings = readFileSync(path.resolve(__dirname, 'SettingsPanel.tsx'), 'utf8');
    expect(settings).not.toContain('showMarkLines');
    expect(settings).not.toContain('gridOffsetX');
  });
});
