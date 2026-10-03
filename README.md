# CC-PinDou 拼豆图案生成器

> ## 🎮 在线演示：**https://youyoudezhuzhu.github.io/CC-PinDou/**
>
> 纯静态部署，无需后端即可使用绘图模式与像素文字工具。

本仓库是 [ccooooool/CC-PinDou](https://github.com/ccooooool/CC-PinDou) 的 **Fork**，
在保留原项目全部功能的基础上，新增了**拼豆像素文字工具**与**多套真实点阵字体**。

---

## 本 Fork 新增

### 1. 像素文字工具（绘制模式 → `T`）

```
用户输入文字 → 点阵字体 → 像素矩阵 → 真实拼豆 Grid → 现有绘图系统
```

文字落盘后就是普通的 `GridCell`，与手绘拼豆**完全同构**，
因此颜色统计 / PNG 导出 / 图纸导出 / 保存 / 加载 / Undo / Redo 全部自动兼容，
不存在「文字一套数据、拼豆另一套数据」。

- 面板包含：文字、字体、倍率、颜色、位置、放置、删除，并带**字形实时预览**
- **倍率是真实拼豆数量缩放**：`2×` 时每个点阵像素展开为 2×2 颗豆，`3×` 为 3×3 颗。
  不使用 `transform: scale()`，也不通过放大图片模拟
- 点阵中的 `0` 不写不擦 → **背景透明**，不会覆盖已有拼豆
- 文字超出画布只做裁剪，不产生越界坐标、不报错
- **一段文字只占一步撤销**；若目标格已被手绘覆盖会自动脱钩，绝不覆盖手绘内容
- 画布上可直接点击定位、拖动移动，严格吸附整数网格坐标

### 2. 多套真实点阵字体

| 字体 | 字面 | 数据 | 「豆」的拼豆数 | 特点 |
|------|------|------|----------------|------|
| Pixel 5×7 | 5×7 | 内置 | — | 拉丁/数字/符号，零加载 |
| 缝合像素 8px 等宽 | 8×8 | 47 KB | 56 | 最紧凑，适合小图纸 |
| 缝合像素 10px 等宽 | 10×10 | 67 KB | 78 | 紧凑，笔画更清晰 |
| 缝合像素 12px 等宽 | 12×12 | 86 KB | 98 | 标准选择，严格对齐 |
| 缝合像素 12px 比例 | 12×16 | 110 KB | 98 | 比例字距，排版自然 |
| Unifont 16px 等宽 | 16×16 | 141 KB | 130 | 字面最大，复杂字最清晰 |

全部来自字体设计师**逐像素手工绘制**的 BDF 点阵字体，**不是**把轮廓字体缩小栅格化，
也**不是**把同一字形加粗或整数倍放大。每个字号都是针对该像素尺寸单独设计的，
笔画数与结构各不相同（测试中已断言 `16px 笔迹数 ≠ 8px 笔迹数 × 4`）。

各字体按需懒加载，选中时才下载单个 `.bin`（47–141 KB），首屏不受影响。

---

## 静态部署

```bash
cd frontend
npm install
npm run build:fonts        # 可选：重新生成点阵字体数据（需联网下载 BDF）
GH_TOKEN=xxx ./scripts/deploy-pages.sh   # 发布到 GitHub Pages
```

`vite.config.ts` 的 `base` 由 `VITE_BASE` 注入，`BrowserRouter` 使用相同的 basename，
并自动生成 `404.html`（SPA 回退）与 `.nojekyll`。

---

# 以下为原项目文档

> 版本：v1.0.0（完整版，前后端分离）

将任意图片转换为拼豆（Perler Beads）制作图纸的 Web 工具，支持普通照片转换、像素图识别、自由绘制三种模式。内置 5 个国内拼豆品牌色号映射，采用 OKLab 颜色空间匹配，可导出高清图纸和材料清单。

**本分支为完整前后端分离版本**，Python 后端提供 AI 背景移除（rembg）、线条增强、高清导出等重型任务。

---

## 三种工作模式

| 模式 | 适用场景 | 核心能力 |
|------|----------|----------|
| **普通图片** | 照片、插画 | AI 背景移除（rembg）→ 颜色简化 → OKLab 色号匹配 → 拼豆网格 |
| **像素图** | 游戏素材、像素插画 | 自动像素块检测 + 对齐偏移微调 → 精确像素网格（上限 128×128） |
| **自由绘制** | 从零原创 | 多图层画板 + 8 种工具 + 6 种对称 + 批量颜色替换 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.13 + Flask + waitress |
| 图像处理 | Pillow、NumPy、scipy、rembg、onnxruntime |
| 前端 | Vite 5 + React 18 + TypeScript 5 + Tailwind CSS 3 + shadcn/ui |
| 状态管理 | Zustand（Editor / UI / Config 三 Store）|
| 颜色匹配 | OKLab 感知均匀空间 |
| UI 设计 | NookUI（Animal Crossing 马卡龙风格）|
| Toast | Sonner + NookUI 自定义样式 |
| 测试 | Vitest（前端）+ pytest（后端）|

---

## 项目结构

```
CC-PinDou/
├── server/                     # Flask 后端
│   ├── app.py                  # 路由入口
│   ├── image_processing.py     # AI 背景移除、线条增强
│   ├── pixel_processing.py     # 像素图自动检测
│   ├── export_generator.py     # 高清图纸导出
│   ├── colors.py               # 色号数据库（SQLite + cKDTree）
│   ├── models_manager.py       # rembg ONNX 模型管理
│   ├── tests/                  # pytest 测试套件
│   └── uploads/                # 临时上传目录
│
├── frontend/
│   ├── public/                 # 静态资源
│   ├── src/
│   │   ├── components/         # React 组件
│   │   │   ├── CanvasEditor.tsx, Toolbar.tsx, ParamPanel.tsx, PixelPanel.tsx
│   │   │   ├── DrawToolBar.tsx, EditPanel.tsx, LayerPanel.tsx, BeadLayerPanel.tsx
│   │   │   ├── ImageLayerPanel.tsx, LegendBar.tsx, FloatingZoom.tsx
│   │   │   ├── ExportModal.tsx, SaveModal.tsx, ImageCropModal.tsx, PixelAlignModal.tsx
│   │   │   ├── RemoveBgButton.tsx, ModeTabs.tsx, ImageUploader.tsx
│   │   │   ├── BgRemovePanel.tsx, SettingsPanel.tsx, ModeBackground.tsx
│   │   │   ├── ColorPickerPopover.tsx, GridLineColorPicker.tsx, ToolPropertiesPopover.tsx
│   │   │   └── ui/             # shadcn/ui 基础组件
│   │   ├── api/                # API 客户端（fetch 封装）
│   │   ├── engine/             # OKLab 颜色匹配 + 网格生成 + BFS 连通合并
│   │   ├── hooks/              # 自定义 Hooks（含后端健康检测 useBackendHealth）
│   │   ├── pages/              # 页面组件（EntryPage）
│   │   ├── store/              # Zustand 状态管理
│   │   ├── styles/             # 全局样式 + NookUI 设计令牌
│   │   ├── types/              # TypeScript 类型定义
│   │   ├── utils/              # 工具函数（含 pixelPreview.ts）
│   │   ├── workers/            # Web Worker
│   │   └── App.tsx, Router.tsx, main.tsx
│   ├── package.json            # npm 依赖（版本 1.0.0）
│   ├── vite.config.ts          # Vite 配置（代理 /api 和 /export 到后端）
│   └── vitest.config.ts        # Vitest 配置
│
├── data/
│   ├── colors.db               # SQLite 色号数据库（运行时自动生成）
│   └── colorSystemMapping.json # 5 品牌色号映射源数据
│
├── models/                     # ONNX 模型文件（rembg 使用，首次运行自动下载）
├── scripts/                    # 调试脚本
├── run.py                      # 生产启动入口（waitress，端口 5678）
├── build.py                    # 前后端联合构建脚本
└── requirements.txt            # Python 依赖
```

---

## 快速开始

### 克隆仓库

```bash
git clone https://gitee.com/ccoooool/CC-PinDou.git
# 或
git clone https://github.com/ccooooool/CC-PinDou.git

cd CC-PinDou
```

### 后端（Python >= 3.13）

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
python run.py                  # 端口 5678
```

> `rembg` 首次使用会自动下载 ONNX 模型到 `models/` 目录。

### 前端（Node.js >= 18）

```bash
cd frontend
npm install
npm run dev                    # 端口 6789，自动代理 /api 到 localhost:5678
```

### 生产构建

```bash
python build.py                # 联合构建（含环境检查、测试、前端构建）
# 或
python build.py --skip-tests   # 跳过测试快速构建
```

---

## 测试

```bash
# 前端
cd frontend
npm test

# 后端
cd server
python -m pytest tests/ -v
```

---

## 分支说明

| 分支 | 说明 |
|------|------|
| **`full-stack`**（默认） | 完整前后端分离版本，Python 后端提供 AI 背景移除、高清导出 |
| **`frontend-only`** | 纯前端静态部署版本，无后端依赖 |

---

## 致谢与引用

本项目引用了以下开源资源与项目：

| 资源 | 来源项目 | 链接 |
|------|----------|------|
| 字体（文源圆体） | WenYuanFonts | [GitHub](https://github.com/takushun-wu/WenYuanFonts) |
| 像素模式图标 | NES.css | [GitHub](https://github.com/nostalgic-css/NES.css) |
| UI 设计系统 | NookUI | [Gitee](https://gitee.com/ccoooool/NookUI) |
| 灵感来源与参考 | perler-beads | [GitHub](https://github.com/Zippland/perler-beads) |

> ⚠️ **版权声明**：像素模式图标中的角色形象版权归 Nintendo 所有。  
> Nintendo owns the copyright of these characters. Please comply with the Nintendo guidelines and laws of the applicable jurisdiction.

---

## 支持项目

如果觉得本项目对你有帮助，欢迎打赏支持！

> 打赏前请务必仔细检查付款账户（支付宝：粥叉叉 / 微信：淡定从容）。上述账户为唯一正式受捐账户。若发现账户信息与二维码不符，请立刻举报。打赏款项一经转账恕不退还，请慎重考虑。（未成年人请取得法定监护人许可后方可捐助）

<p align="center">
  <img src="打赏收款码/微信收款码.png" width="200" alt="微信收款码" />
  <img src="打赏收款码/支付宝收款码.jpg" width="200" alt="支付宝收款码" />
</p>

---

## License

MIT License
