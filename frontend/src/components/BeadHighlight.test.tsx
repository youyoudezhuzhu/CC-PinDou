/**
 * 高亮配豆 UI 回归测试
 *
 * 重点锁住一个真实踩过的坑：
 * 入口按钮原先用 `absolute` 放在 `overflow-auto` 的滚动容器里，
 * 会定位到「滚动内容底部」而不是视口底部，画布一大按钮就被推出可视区，
 * 用户根本找不到入口。这里断言它必须用 fixed 定位。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BeadHighlightTrigger } from './BeadHighlightTrigger';
import { BeadHighlightPanel } from './BeadHighlightPanel';
import { useEditorStore } from '../store/useEditorStore';
import { useHighlightStore } from '../store/useHighlightStore';
import type { GridCell, ColorInfo } from '../types/perler';

const RED = '#FF0000';
const BLUE = '#0000FF';

function makeGrid(rows: number, cols: number): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < cols; x++) {
      const isRed = x < cols / 2;
      row.push({ x, y, color: isRed ? RED : BLUE, codes: { MARD: isRed ? 'A01' : 'A02' } });
    }
    grid.push(row);
  }
  return grid;
}

const COLOR_LIST: ColorInfo[] = [
  { hex: RED, count: 8, codes: { MARD: 'A01' } },
  { hex: BLUE, count: 8, codes: { MARD: 'A02' } },
];

function seed() {
  useHighlightStore.getState().reset();
  useEditorStore.setState({
    layers: [],
    activeLayerId: 'layer-1',
    gridData: makeGrid(4, 4),
    colorList: COLOR_LIST,
    selectedColor: null,
    historyStack: [],
    redoStack: [],
    selectedCells: [],
    isolatedCells: [],
    unstableCells: [],
  });
}

describe('BeadHighlightTrigger', () => {
  beforeEach(seed);
  afterEach(cleanup);

  it('必须用 fixed 定位，不能被画布滚动容器推出视口', () => {
    render(<BeadHighlightTrigger />);
    const btn = screen.getByRole('button', { name: '高亮配豆' });
    // 关键回归点：absolute 放在 overflow-auto 容器里会跑到滚动内容底部
    expect(btn.className).toContain('fixed');
    expect(btn.className).not.toContain('absolute');
  });

  it('没有配色时不应渲染入口', () => {
    useEditorStore.setState({ colorList: [] });
    const { container } = render(<BeadHighlightTrigger />);
    expect(container).toBeEmptyDOMElement();
  });

  it('点击入口应打开面板', () => {
    render(<BeadHighlightTrigger />);
    expect(useHighlightStore.getState().panelOpen).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '高亮配豆' }));
    expect(useHighlightStore.getState().panelOpen).toBe(true);
  });

  it('已选色号时应在入口显示色号数，已配完时显示完成数', () => {
    useHighlightStore.getState().setHexes([RED]);
    useHighlightStore.getState().setDoneHexes([RED]);
    render(<BeadHighlightTrigger />);
    expect(screen.getByText('1 色')).toBeInTheDocument();
    expect(screen.getByText(/已配完 1/)).toBeInTheDocument();
  });
});

describe('BeadHighlightPanel', () => {
  beforeEach(() => {
    seed();
    useHighlightStore.getState().setPanelOpen(true);
  });
  afterEach(cleanup);

  it('未打开时不应渲染', () => {
    useHighlightStore.getState().setPanelOpen(false);
    const { container } = render(<BeadHighlightPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('面板也必须是 fixed 定位', () => {
    render(<BeadHighlightPanel />);
    const dialog = screen.getByRole('dialog', { name: '高亮配豆面板' });
    expect(dialog.className).toContain('fixed');
  });

  it('应显示配豆进度与每个色号', () => {
    render(<BeadHighlightPanel />);
    expect(screen.getByText(/配豆进度 0\/2 色/)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/已完成 0 \/ 16 颗/)).toBeInTheDocument();
    expect(screen.getByText('A01')).toBeInTheDocument();
    expect(screen.getByText('A02')).toBeInTheDocument();
  });

  it('点击色号应切换高亮，并实时更新命中数', () => {
    render(<BeadHighlightPanel />);
    // A01 共 8 颗
    fireEvent.click(screen.getByText('A01'));
    expect(useHighlightStore.getState().hexes).toEqual([RED]);
    expect(useHighlightStore.getState().enabled).toBe(true);
    expect(screen.getByText('8 颗')).toBeInTheDocument();
  });

  it('点击「配完」应记录进度并刷新百分比', () => {
    render(<BeadHighlightPanel />);
    const doneButtons = screen.getAllByRole('button', { name: /配完/ });
    fireEvent.click(doneButtons[0]);

    expect(useHighlightStore.getState().doneHexes).toEqual([RED]);
    expect(screen.getByText(/配豆进度 1\/2 色/)).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/已完成 8 \/ 16 颗/)).toBeInTheDocument();
    // 按钮文案切换为「已配完」
    expect(screen.getByText('已配完')).toBeInTheDocument();
  });

  it('重置进度应清空已配完的色号', () => {
    useHighlightStore.getState().setDoneHexes([RED, BLUE]);
    render(<BeadHighlightPanel />);
    fireEvent.click(screen.getByRole('button', { name: /重置进度/ }));
    expect(useHighlightStore.getState().doneHexes).toEqual([]);
  });

  it('全部配完后进度应为 100%', () => {
    useHighlightStore.getState().setDoneHexes([RED, BLUE]);
    render(<BeadHighlightPanel />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(/配豆进度 2\/2 色/)).toBeInTheDocument();
    expect(screen.getByText(/已完成 16 \/ 16 颗/)).toBeInTheDocument();
  });
});
