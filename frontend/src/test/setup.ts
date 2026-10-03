import '@testing-library/jest-dom';

// Polyfill ImageData for jsdom environment
if (typeof ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string;

    constructor(
      data: Uint8ClampedArray | number,
      width: number,
      height?: number,
      settings?: { colorSpace?: string }
    ) {
      if (typeof data === 'number') {
        this.width = width;
        this.height = height ?? width;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.width = width;
        this.height = height ?? Math.floor(data.length / (width * 4));
        this.data = data;
      }
      this.colorSpace = settings?.colorSpace ?? 'srgb';
    }
  };
}

// Polyfill ResizeObserver for jsdom
// Radix UI 的 Slider / Select 等组件依赖它，jsdom 未实现
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
