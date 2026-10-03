/**
 * 透明色作为可选颜色的行为测试
 *
 * 需求：颜色面板里可以直接选中「透明」，用画笔 / 形状 / 填充 / 替换把已有拼豆
 * 覆盖成透明（等于擦除），而不是只能用橡皮擦。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorStore } from './useEditorStore';
import { useUIStore } from './useUIStore';
import { useDrawingTools } from '../hooks/useDrawingTools';
import type { ColorInfo } from '../types/perler';

const RED: ColorInfo = { hex: '#FF0000', count: 0, codes: { MARD: 'A01' } };
const TRANSPARENT: ColorInfo = { hex: 'transparent', count: 0, codes: {} };

function cellAt(x: number, y: number) {
  return useEditorStore.getState().gridData![y][x];
}

describe('透明色绘制', () => {
  beforeEach(() => {
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
    useEditorStore.getState().createBlankGrid(8);
    useUIStore.setState({ mode: 'draw', drawTool: 'pen', brushSize: 1, symmetryMode: 'none' });
  });

  it('选中透明色后，画笔应把已有拼豆覆盖为透明', () => {
    const { result } = renderHook(() => useDrawingTools());

    // 先用红色画一格（包在 act 里，确保 hook 拿到最新 store 状态）
    act(() => { useEditorStore.getState().setSelectedColor(RED); });
    const painted = result.current.paintCell(1, 1);
    expect(painted).not.toBeNull();
    expect(cellAt(1, 1).color).toBe('#FF0000');

    // 切到透明色再画同一格 → 应变为透明
    act(() => { useEditorStore.getState().setSelectedColor(TRANSPARENT); });
    const erased = result.current.paintCell(1, 1);
    expect(erased).not.toBeNull();
    expect(erased!.oldColor).toBe('#FF0000');
    expect(erased!.newColor).toBe('transparent');
    expect(cellAt(1, 1).color).toBe('transparent');
    expect(cellAt(1, 1).codes).toEqual({});
  });

  it('对本来就透明的格子使用透明色应是空操作（不产生历史记录）', () => {
    const { result } = renderHook(() => useDrawingTools());
    act(() => { useEditorStore.getState().setSelectedColor(TRANSPARENT); });
    expect(result.current.paintCell(3, 3)).toBeNull();
  });

  it('透明色擦除后可以撤销回原颜色', () => {
    const { result } = renderHook(() => useDrawingTools());

    act(() => { useEditorStore.getState().setSelectedColor(RED); });
    const record = result.current.paintCell(2, 2)!;
    useEditorStore
      .getState()
      .pushHistory({ type: 'paint', layerId: useEditorStore.getState().activeLayerId!, ...record });

    act(() => { useEditorStore.getState().setSelectedColor(TRANSPARENT); });
    const erase = result.current.paintCell(2, 2)!;
    useEditorStore
      .getState()
      .pushHistory({ type: 'paint', layerId: useEditorStore.getState().activeLayerId!, ...erase });
    expect(cellAt(2, 2).color).toBe('transparent');

    useEditorStore.getState().undo();
    expect(cellAt(2, 2).color).toBe('#FF0000');
    useEditorStore.getState().undo();
    expect(cellAt(2, 2).color).toBe('transparent');
  });

  it('透明色应能通过批量写入擦除一片区域（形状 / 填充走同一条路径）', () => {
    useEditorStore.getState().setSelectedColor(RED);

    const writes: Array<{ x: number; y: number; color: string; codes: Record<string, string> }> = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        writes.push({ x, y, color: RED.hex, codes: { ...RED.codes } });
      }
    }
    useEditorStore.getState().writeCellsAsHistory(writes, 'rect');
    expect(useEditorStore.getState().colorList.find((c) => c.hex === RED.hex)?.count).toBe(9);

    // 用透明覆盖同一片区域
    const eraseWrites = writes.map((w) => ({ x: w.x, y: w.y, color: 'transparent', codes: {} }));
    useEditorStore.getState().writeCellsAsHistory(eraseWrites, 'rect');

    expect(useEditorStore.getState().colorList.find((c) => c.hex === RED.hex)).toBeUndefined();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(cellAt(x, y).color).toBe('transparent');
      }
    }
  });

  it('颜色统计不应把透明色计入', () => {
    useEditorStore.getState().setSelectedColor(TRANSPARENT);
    // 透明写入不会新增颜色项
    const writes = [{ x: 4, y: 4, color: 'transparent', codes: {} }];
    useEditorStore.getState().writeCellsAsHistory(writes, 'pen');
    expect(useEditorStore.getState().colorList).toEqual([]);
  });
});
