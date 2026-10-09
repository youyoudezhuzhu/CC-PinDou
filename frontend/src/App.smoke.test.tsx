/**
 * App 整体渲染冒烟测试
 *
 * 这个文件是一次真实事故的产物：田字格按钮被误插进已有的
 * <TooltipTrigger asChild> 里，导致 Trigger 有两个子元素，
 * Radix 的 Slot 抛 "React.Children.only expected to receive a single React element child"，
 * Toolbar 在三种模式下都渲染，于是转换/像素/绘制**全部白屏只剩背景**。
 *
 * 单元测试当时全绿 —— 因为它们只渲染单个组件，没人整体渲染 App。
 * 所以这里专门做整体渲染，把「组件树能不能挂起来」这件事锁住。
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TooltipProvider } from './components/ui/tooltip';
import App from './App';
import { DrawToolBar } from './components/DrawToolBar';
import { useConfigStore } from './store/useConfigStore';
import { useEditorStore } from './store/useEditorStore';

function renderApp(mode: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[`/${mode}`]}>
        <Routes>
          <Route path="/:mode" element={<App />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe('App 冒烟', () => {
  beforeAll(() => {
    (globalThis as any).ResizeObserver =
      (globalThis as any).ResizeObserver ??
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    (globalThis as any).matchMedia =
      (globalThis as any).matchMedia ??
      ((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }));
  });

  afterEach(cleanup);

  for (const mode of ['normal', 'pixel', 'draw']) {
    it(`/${mode} 空状态应能整体渲染而不抛错`, () => {
      expect(() => renderApp(mode)).not.toThrow();
    });
  }

  it('三种模式的工具栏都不应出现 TooltipTrigger 多子元素崩溃', () => {
    // Radix 的 asChild 只接受一个子元素；一旦哪里塞了两个或塞了 null，
    // 这里会直接以 React.Children.only 报错的形式暴露出来。
    for (const mode of ['normal', 'pixel', 'draw']) {
      expect(() => renderApp(mode), `${mode} 模式渲染失败`).not.toThrow();
      cleanup();
    }
  });

  it('绘制模式：画板已创建但还没有配色时也不应崩溃', () => {
    // 这是 HighlightToggleButton 曾经踩过的坑：
    // 它在无配色时 return null，被放进 <TooltipTrigger asChild> 同样会崩。
    useEditorStore.getState().createBlankGrid(16);
    expect(useEditorStore.getState().colorList).toEqual([]);
    expect(() => renderApp('draw')).not.toThrow();
  });

  it('绘制工具栏单独渲染（无配色）也不应崩溃', () => {
    useEditorStore.setState({ colorList: [], gridData: null });
    expect(() =>
      render(
        <TooltipProvider>
          <MemoryRouter>
            <DrawToolBar />
          </MemoryRouter>
        </TooltipProvider>,
      ),
    ).not.toThrow();
  });
});

describe('旧版持久化配置兼容', () => {
  afterEach(cleanup);

  it('localStorage 里缺少新增 canvasConfig 字段时不应崩溃', () => {
    // 老用户本地存的是改动前的 canvasConfig（没有 minorInterval / gridOffsetX / gridOffsetY），
    // zustand persist 是浅合并，整个 canvasConfig 会被旧对象替换掉
    useConfigStore.setState({
      canvasConfig: {
        beadSize: 10,
        margin: 30,
        zoomLevel: 1,
        showCode: false,
        showGrid: true,
        circleMode: false,
        showMarkLines: true,
        markInterval: 5,
      } as never,
    });
    expect(() => renderApp('draw')).not.toThrow();
  });
});
