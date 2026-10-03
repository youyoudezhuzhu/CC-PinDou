/**
 * 顶栏（ModeTabs）回归测试
 *
 * 需求：删除顶栏的 CC-PinDou logo 与文字，改为一个「返回主页」图标按钮。
 * 这里锁住三点：品牌标识确实没了、返回主页按钮存在、点击后能回到首页。
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModeTabs } from './ModeTabs';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>HOME_PAGE</div>} />
        <Route path="/:mode" element={<ModeTabs />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('ModeTabs 顶栏', () => {
  it('不应再渲染 CC-PinDou 文字与 logo 图片', () => {
    const { container } = renderAt('/draw');
    expect(screen.queryByText('CC-PinDou')).not.toBeInTheDocument();
    // 顶栏里不应残留任何 img（原 logo 是 <img src="/logo.svg">）
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('应提供「返回主页」图标按钮', () => {
    renderAt('/draw');
    expect(screen.getByRole('button', { name: '返回主页' })).toBeInTheDocument();
  });

  it('点击「返回主页」应导航到首页', async () => {
    renderAt('/draw');
    fireEvent.click(screen.getByRole('button', { name: '返回主页' }));
    expect(await screen.findByText('HOME_PAGE')).toBeInTheDocument();
  });

  it('三个模式按钮应保持可用（导航栏功能未被破坏）', () => {
    renderAt('/draw');
    for (const label of ['转换模式', '像素模式', '绘制模式']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
