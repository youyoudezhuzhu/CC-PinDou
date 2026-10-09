/**
 * 拼豆图案核心类型定义
 * 对应原 app.js 中的全局数据结构，升级为类型安全的 TS 接口
 */

/** 单个拼豆格子 */
export interface GridCell {
  x: number;
  y: number;
  color: string; // hex 如 '#FAF4C8' 或 'transparent'
  codes: Record<string, string>; // { MARD: 'A01', COCO: 'E02' }
}

// =============================================================================
// 像素文字对象（绘制模式「文字工具」）
// =============================================================================

/**
 * 像素文字对象。
 *
 * 注意：它不是一份独立的绘图数据 —— 它只是文字工具的编辑态。
 * 落盘时会被展开成真实的 GridCell 写入 gridData，
 * 因此颜色统计 / 导出 / 保存 / Undo 全部与手绘拼豆完全同构。
 */
export interface TextObject {
  type: 'text';
  id: string;
  /** 用户输入的文字，支持 '\n' 换行 */
  text: string;
  /** 点阵字体 id，见 engine/pixelFont.ts */
  font: string;
  /** 倍数：1× 时 1 个点阵像素 = 1 颗拼豆，2× = 2×2 颗，以此类推 */
  scale: number;
  /** 文字颜色（拼豆 hex），对应 GridCell.color */
  color: string;
  /** 各品牌色号，对应 GridCell.codes */
  codes: Record<string, string>;
  /** 锚点（文字左上角）网格坐标，必须为整数 */
  x: number;
  y: number;
}

/** 颜色统计信息 */
export interface ColorInfo {
  hex: string;
  count: number;
  codes: Record<string, string>;
}

/** 历史操作类型 */
export type HistoryAction =
  | {
      type: 'paint';
      layerId: string;
      x: number;
      y: number;
      oldColor: string;
      oldCodes: Record<string, string>;
      newColor: string;
      newCodes: Record<string, string>;
    }
  | {
      type: 'batch_paint';
      layerId: string;
      tool?: string;
      /**
       * 活动对象标识（像素文字工具等）。
       * 同一对象反复编辑时用它在历史栈中定位并替换自己的记录，
       * 从而保证「一段文字 = 一步撤销」。
       */
      placementId?: string;
      positions: Array<{
        x: number;
        y: number;
        oldColor: string;
        oldCodes: Record<string, string>;
        newColor: string;
        newCodes: Record<string, string>;
      }>;
    }
  | {
      type: 'delete_color';
      layerId: string;
      color: string;
      positions: Array<{
        x: number;
        y: number;
        oldColor: string;
        oldCodes: Record<string, string>;
      }>;
    }
  | {
      type: 'layer_op';
      layerId: string;
      op: 'move' | 'flip_h' | 'flip_v' | 'rotate_cw' | 'rotate_ccw';
      oldGrid: GridCell[][];
      newGrid: GridCell[][];
    }
  | {
      type: 'layer_transform';
      layerId: string;
      oldTransform: {
        x: number;
        y: number;
        scale: number;
        rotation: number;
      };
      newTransform: {
        x: number;
        y: number;
        scale: number;
        rotation: number;
      };
    };

// =============================================================================
// 图层系统（Phase 1: 绘制模式 Photoshop 化重构）
// =============================================================================

/** 图层基础属性 */
export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-100
  zIndex: number;
}

/** 拼豆绘制图层 */
export interface BeadLayer extends LayerBase {
  type: 'bead';
  gridData: GridCell[][];
  colorList: ColorInfo[];
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
}

/** 背景图片图层 */
export interface ImageLayer extends LayerBase {
  type: 'image';
  imageUrl: string;
  width: number;
  height: number;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  scaleLocked: boolean;
}

/** 图层联合类型 */
export type PerlerLayer = BeadLayer | ImageLayer;

/** 工程文件 v3.0 格式 */
export interface ProjectV3 {
  version: '3.0';
  layers: PerlerLayer[];
  activeLayerId: string | null;
  brand: Brand;
  colorMode: 'full' | '221';
  mode: 'normal' | 'pixel' | 'draw';
  canvasConfig: CanvasConfig;
  drawTool?: string;
  symmetryMode?: string;
  brushSize?: number;
}

/** 画布渲染配置 */
export interface CanvasConfig {
  beadSize: number;
  margin: number;
  zoomLevel: number;
  showCode: boolean;
  showGrid: boolean;
  circleMode: boolean;
  /** 是否显示田字格辅助线 */
  showMarkLines: boolean;
  /** 大格间隔（粗线），默认 10 */
  markInterval: number;
  /** 小格间隔（细线），默认 5 */
  minorInterval: number;
  /**
   * 田字格在 X / Y 方向的位移（单位：格，可为负）。
   * 相当于把「无限延伸的田字格」整体平移若干格，方便让分组线对齐自己的图案。
   */
  gridOffsetX: number;
  gridOffsetY: number;
}

/** 导出选项 */
export interface ExportOptions {
  fileName: string;
  format: 'png' | 'jpg';
  showCode: boolean;
  showLegend: boolean;
  circleMode: boolean;
  showMarkLines: boolean;
  markInterval: number;
}

/** 生成参数（普通图片模式） */
export interface GenerateParams {
  gridSize: number;
  removeBg: boolean;
  colorSimplify: number;
  removeBgThreshold: number;
  enhanceLinesStrength: number;
  bgModel: string | null;
  colorMode: 'full' | '221';
}

/** 像素图生成参数 */
export interface PixelGenerateParams {
  pixelSize: number;
  pixelSizeW?: number;
  pixelSizeH?: number;
  offsetX: number;
  offsetY: number;
  boardSize: number;
  samplingMode: 'center' | 'mode' | 'average';
  removeBg: boolean;
  bgThreshold: number;
  colorQuantize: number;
  colorMode: 'full' | '221';
}

/** 色号映射 JSON 结构 */
export type ColorMapping = Record<string, Record<string, string>>;

/** 品牌列表 */
export const BRANDS = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'] as const;
export type Brand = (typeof BRANDS)[number];
