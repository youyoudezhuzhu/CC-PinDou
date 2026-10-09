/**
 * 保存弹窗与「设置 → 标识线 / 田字格」的同步回归测试
 *
 * 用户反馈：在设置里开了田字格并调了位移，保存为 PNG/JPG 时弹窗里的
 * 「标识线」却还是关的。原因是 SaveModal 只在组件首次 mount 时
 * 用 canvasConfig 初始化了一次 useState，之后设置再怎么改都不会同步。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SaveModal } from './SaveModal';
import { useConfigStore } from '../store/useConfigStore';
import { useEditorStore } from '../store/useEditorStore';
import type { GridCell } from '../types/perler';

function makeGrid(size: number): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < size; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < size; x++) {
      row.push({ x, y, color: '#FF0000', codes: { MARD: 'A01' } });
    }
    grid.push(row);
  }
  return grid;
}

function markLinesSwitch(): HTMLInputElement {
  const label = screen.getByText('标识线');
  const input = label.parentElement?.querySelector('input[type="checkbox"]');
  if (!input) throw new Error('未找到「标识线」开关');
  return input as HTMLInputElement;
}

describe('SaveModal 与设置的标识线同步', () => {
  beforeEach(() => {
    useEditorStore.setState({ gridData: makeGrid(4), colorList: [{ hex: '#FF0000', count: 16, codes: { MARD: 'A01' } }] });
    useConfigStore.setState({
      canvasConfig: {
        ...useConfigStore.getState().canvasConfig,
        showMarkLines: false,
        minorInterval: 5,
        markInterval: 10,
      },
    });
  });
  afterEach(cleanup);

  it('设置里开启田字格后，打开保存弹窗应自动显示为已开启', () => {
    useConfigStore.getState().updateCanvasConfig({ showMarkLines: true, markInterval: 12 });

    render(<SaveModal isOpen onClose={() => {}} backendAvailable={false} />);

    expect(markLinesSwitch().checked).toBe(true);
    // 格子大小已不在弹窗里配置，改为只显示跟随结果
    expect(screen.getByText(/大格 12 格/)).toBeInTheDocument();
  });

  it('设置里关闭时，弹窗也应关闭', () => {
    useConfigStore.getState().updateCanvasConfig({ showMarkLines: false });
    render(<SaveModal isOpen onClose={() => {}} backendAvailable={false} />);
    expect(markLinesSwitch().checked).toBe(false);
  });

  it('弹窗保持挂载时，重新打开也要重新同步（不是只在 mount 时同步一次）', () => {
    const { rerender } = render(<SaveModal isOpen onClose={() => {}} backendAvailable={false} />);
    expect(markLinesSwitch().checked).toBe(false);

    // 关闭弹窗 → 在设置里开启田字格 → 再次打开
    rerender(<SaveModal isOpen={false} onClose={() => {}} backendAvailable={false} />);
    useConfigStore.getState().updateCanvasConfig({ showMarkLines: true, markInterval: 20, minorInterval: 4 });
    rerender(<SaveModal isOpen onClose={() => {}} backendAvailable={false} />);

    expect(markLinesSwitch().checked).toBe(true);
    // 摘要里应带上小格/大格/线宽/位移，说明导出会带什么
    expect(screen.getByText(/小格 4 格/)).toBeInTheDocument();
    expect(screen.getByText(/大格 20 格/)).toBeInTheDocument();
    expect(screen.getByText(/跟随右侧栏「标识线 \/ 田字格」/)).toBeInTheDocument();
  });

  it('弹窗里不应再出现「格子大小」输入框（避免与标识线设置重复）', () => {
    useConfigStore.getState().updateCanvasConfig({ showMarkLines: true, markInterval: 12 });
    render(<SaveModal isOpen onClose={() => {}} backendAvailable={false} />);

    // 原来这里有一个数字输入框，现在应只保留开关 + 同步摘要
    expect(screen.queryByDisplayValue('12')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
