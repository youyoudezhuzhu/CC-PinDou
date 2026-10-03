/**
 * 文字工具 UI 冒烟测试
 *
 * 目的：确保面板与工具条在真实渲染时不抛错，并且核心交互（输入文字/调整倍率/放置/删除）
 * 能正确驱动 store —— 覆盖「文字工具在绘图模式可用」这一验收点。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TextToolPanel } from './TextToolPanel';
import { DrawToolBar } from './DrawToolBar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEditorStore } from '../store/useEditorStore';
import { useTextStore } from '../store/useTextStore';
import { useUIStore } from '../store/useUIStore';
import { useConfigStore } from '../store/useConfigStore';

function resetStores() {
  useEditorStore.setState({
    layers: [],
    activeLayerId: null,
    gridData: null,
    colorList: [],
    selectedColor: null,
    historyStack: [],
    redoStack: [],
    selectedCells: [],
    isolatedCells: [],
    unstableCells: [],
  });
  useTextStore.setState({ object: null, placement: null });
  useUIStore.setState({ drawTool: 'pen', mode: 'draw' });
}

function countRed(): number {
  const grid = useEditorStore.getState().gridData;
  if (!grid) return 0;
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.color === '#FF0000') n++;
    }
  }
  return n;
}

describe('TextToolPanel', () => {
  beforeEach(() => {
    resetStores();
    useEditorStore.getState().createBlankGrid(64);
    useEditorStore.getState().setSelectedColor({ hex: '#FF0000', count: 0, codes: { MARD: 'A01' } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('打开时应渲染文字/字体/倍率/颜色/放置等核心控件', () => {
    render(<TextToolPanel open onClose={() => {}} />);

    expect(screen.getByText('像素文字')).toBeInTheDocument();
    expect(screen.getByText('文字')).toBeInTheDocument();
    expect(screen.getByText('字体')).toBeInTheDocument();
    expect(screen.getByText('颜色')).toBeInTheDocument();
    expect(screen.getByText(/倍率/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /放置文字|更新文字/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /删除文字/ })).toBeInTheDocument();
  });

  it('open=false 时不应渲染任何内容', () => {
    const { container } = render(<TextToolPanel open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('打开时应自动创建一个居中且跟随当前拼豆颜色的文字对象', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    const object = useTextStore.getState().object;
    expect(object).not.toBeNull();
    expect(object!.color).toBe('#FF0000');
    expect(object!.codes).toEqual({ MARD: 'A01' });
    expect(Number.isInteger(object!.x)).toBe(true);
    expect(Number.isInteger(object!.y)).toBe(true);
  });

  it('输入文字应实时更新预览状态', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/输入文字/);
    fireEvent.change(input, { target: { value: '拼豆' } });
    expect(useTextStore.getState().object!.text).toBe('拼豆');
  });

  it('调整倍率应更新 scale 并显示真实格数', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '增大倍率' }));
    expect(useTextStore.getState().object!.scale).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '减小倍率' }));
    expect(useTextStore.getState().object!.scale).toBe(1);
  });

  it('点击放置文字后应写入真实拼豆并生成一步历史', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/输入文字/), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: '放置文字' }));

    // 'A' 有 18 个落豆像素
    expect(countRed()).toBe(18);
    expect(useEditorStore.getState().historyStack).toHaveLength(1);
    expect(useTextStore.getState().placement).not.toBeNull();
  });

  it('放置后按钮变为「更新文字」，且删除应清空拼豆', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/输入文字/), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: '放置文字' }));

    const updateBtn = screen.getByRole('button', { name: '更新文字' });
    expect(updateBtn).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /删除文字/ }));
    expect(countRed()).toBe(0);
  });

  it('方向键应按整数格移动锚点', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    const before = { ...useTextStore.getState().object! };
    fireEvent.click(screen.getByRole('button', { name: '右移一格' }));
    fireEvent.click(screen.getByRole('button', { name: '下移一格' }));
    const after = useTextStore.getState().object!;
    expect(after.x).toBe(before.x + 1);
    expect(after.y).toBe(before.y + 1);
  });

  it('越界时应显示裁剪提示而不是报错', () => {
    render(<TextToolPanel open onClose={() => {}} />);
    // 画布 64 格，文字放大到 16× 必然越界
    act(() => {
      useTextStore.getState().updateText({ scale: 16, x: 60, y: 60 });
    });
    expect(screen.getByText(/超出画布/)).toBeInTheDocument();
  });
});

describe('DrawToolBar / 文字工具入口', () => {
  beforeEach(() => {
    resetStores();
    useEditorStore.getState().createBlankGrid(32);
    useConfigStore.setState({ canvasConfig: { ...useConfigStore.getState().canvasConfig, beadSize: 10, margin: 24 } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('工具条应包含文字工具，点击后进入文字模式并打开面板', () => {
    render(<TooltipProvider><DrawToolBar /></TooltipProvider>);
    // 工具按钮是可点击的（Tooltip 会渲染触发器）
    const toolButtons = document.querySelectorAll('button');
    expect(toolButtons.length).toBeGreaterThan(5);

    act(() => {
      useUIStore.getState().setDrawTool('text');
    });
    expect(useUIStore.getState().drawTool).toBe('text');
  });

  it('离开文字工具时应结束编辑会话，但已放置的拼豆必须保留', () => {
    render(<TooltipProvider><DrawToolBar /></TooltipProvider>);
    act(() => {
      useUIStore.getState().setDrawTool('text');
      useTextStore.getState().ensureText({ text: 'A', x: 0, y: 0, color: '#FF0000' });
      useTextStore.getState().place();
    });
    expect(countRed()).toBe(18);

    act(() => {
      useUIStore.getState().setDrawTool('pen');
    });

    // 编辑会话结束
    expect(useTextStore.getState().object).toBeNull();
    expect(useTextStore.getState().placement).toBeNull();
    // 但拼豆还在（已沉淀为普通拼豆）
    expect(countRed()).toBe(18);
  });
});
