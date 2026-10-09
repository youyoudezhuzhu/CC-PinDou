import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasConfig, Brand } from '../types/perler';

const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  beadSize: 28,
  margin: 45,
  zoomLevel: 1,
  showCode: false,
  showGrid: true,
  circleMode: false,
  showMarkLines: false,
  // 大格 10 + 小格 5 是拼豆图纸最常用的分组（10 颗一组便于数豆）
  markInterval: 10,
  minorInterval: 5,
  // 线宽默认比原来的 1/2 粗一档，田字格更醒目；用户可在设置里自由调整
  minorLineWidth: 2,
  majorLineWidth: 4,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

interface ConfigState {
  // ========== 品牌与色数 ==========
  brand: Brand;
  colorMode: 'full' | '221';
  paletteBrand: Brand;

  // ========== 普通图片参数 ==========
  gridSize: number;
  removeBg: boolean;
  bgModel: string;
  colorSimplify: number;
  enhanceLines: number;
  removeBgThreshold: number;
  generateAlgorithm: 'frontend' | 'backend';

  // ========== 像素图参数 ==========
  pixelSize: number;
  pixelOffsetX: number;
  pixelOffsetY: number;
  pixelSampleMethod: 'center' | 'mode' | 'mean';
  pixelGridColor: string;
  pixelImageUrl: string | null;
  pixelCols: number;
  pixelRows: number;

  // ========== 画布配置 ==========
  canvasConfig: CanvasConfig;

  // ========== Actions ==========
  setBrand: (brand: Brand) => void;
  setColorMode: (mode: 'full' | '221') => void;
  setPaletteBrand: (brand: Brand) => void;

  setGridSize: (size: number) => void;
  setRemoveBg: (v: boolean) => void;
  setBgModel: (m: string) => void;
  setColorSimplify: (v: number) => void;
  setEnhanceLines: (v: number) => void;
  setRemoveBgThreshold: (v: number) => void;
  setGenerateAlgorithm: (v: 'frontend' | 'backend') => void;

  setPixelSize: (v: number) => void;
  setPixelOffsetX: (v: number) => void;
  setPixelOffsetY: (v: number) => void;
  setPixelSampleMethod: (v: 'center' | 'mode' | 'mean') => void;
  setPixelGridColor: (v: string) => void;
  setPixelImageUrl: (url: string | null) => void;
  setPixelCols: (v: number) => void;
  setPixelRows: (v: number) => void;

  updateCanvasConfig: (patch: Partial<CanvasConfig>) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      brand: 'MARD',
      colorMode: 'full',
      paletteBrand: 'MARD',

      gridSize: 52,
      removeBg: true,
      bgModel: 'u2net',
      colorSimplify: 0,
      enhanceLines: 0,
      removeBgThreshold: 30,
      generateAlgorithm: 'backend',

      pixelSize: 16,
      pixelOffsetX: 0,
      pixelOffsetY: 0,
      pixelSampleMethod: 'mode',
      pixelGridColor: '#ff0000',
      pixelImageUrl: null,
      pixelCols: 0,
      pixelRows: 0,

      canvasConfig: { ...DEFAULT_CANVAS_CONFIG },

      setBrand: (brand) => set({ brand }),
      setColorMode: (mode) => set({ colorMode: mode }),
      setPaletteBrand: (brand) => set({ paletteBrand: brand }),

      setGridSize: (size) => set({ gridSize: size }),
      setRemoveBg: (v) => set({ removeBg: v }),
      setBgModel: (m) => set({ bgModel: m }),
      setColorSimplify: (v) => set({ colorSimplify: v }),
      setEnhanceLines: (v) => set({ enhanceLines: v }),
      setRemoveBgThreshold: (v) => set({ removeBgThreshold: v }),
      setGenerateAlgorithm: (v) => set({ generateAlgorithm: v }),

      setPixelSize: (v) => set({ pixelSize: v }),
      setPixelOffsetX: (v) => set({ pixelOffsetX: v }),
      setPixelOffsetY: (v) => set({ pixelOffsetY: v }),
      setPixelSampleMethod: (v) => set({ pixelSampleMethod: v }),
      setPixelGridColor: (v) => set({ pixelGridColor: v }),
      setPixelImageUrl: (url) => set({ pixelImageUrl: url }),
      setPixelCols: (v) => set({ pixelCols: v }),
      setPixelRows: (v) => set({ pixelRows: v }),

      updateCanvasConfig: (patch) =>
        set((state) => ({
          canvasConfig: { ...state.canvasConfig, ...patch },
        })),
    }),
    {
      name: 'pindou-config',
      partialize: (state) => ({
        brand: state.brand,
        colorMode: state.colorMode,
        paletteBrand: state.paletteBrand,
        gridSize: state.gridSize,
        removeBg: state.removeBg,
        bgModel: state.bgModel,
        colorSimplify: state.colorSimplify,
        enhanceLines: state.enhanceLines,
        removeBgThreshold: state.removeBgThreshold,
        generateAlgorithm: state.generateAlgorithm,
        pixelSize: state.pixelSize,
        pixelOffsetX: state.pixelOffsetX,
        pixelOffsetY: state.pixelOffsetY,
        pixelSampleMethod: state.pixelSampleMethod,
        pixelGridColor: state.pixelGridColor,
        canvasConfig: state.canvasConfig,
      }),
    }
  )
);
