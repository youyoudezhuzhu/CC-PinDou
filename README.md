# CC-PinDou 拼豆图案生成器

> ## 🎮 在线演示：**https://pindou.yiling.win/**
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

### 2. 多套真实点阵字体（9 ~ 20px 尺寸阶梯）

| 字号 | 字体 | 字面 | 数据 | 覆盖 | 来源 / 授权 |
|------|------|------|------|------|-------------|
| — | Pixel 5×7（内置） | 5×7 | 0 KB | 西文·数字 | 本项目 |
| 8px | 缝合像素 8px 等宽 | 8×8 | 47.0 KB | 中文 | Fusion Pixel (OFL-1.1) |
| 9px | X11 9px 等宽 | 6×9 | 2.3 KB | 西文·数字 | X11 misc-fixed (公有领域) |
| 10px | 缝合像素 10px 等宽 | 10×10 | 66.7 KB | 中文 | Fusion Pixel (OFL-1.1) |
| 12px | 缝合像素 12px 等宽 | 12×12 | 86.4 KB | 中文 | Fusion Pixel (OFL-1.1) |
| 12px | 缝合像素 12px 比例 | 12×16 | 109.9 KB | 中文 | Fusion Pixel (OFL-1.1) |
| 12px | 文泉驿点阵宋体 12px | 12×14 | 97.9 KB | 中文 | 文泉驿 (GPL-2.0) |
| 13px | 文泉驿点阵宋体 13px | 14×14 | 121.4 KB | 中文 | 文泉驿 (GPL-2.0) |
| 14px | 文泉驿点阵宋体 14px | 15×16 | 132.5 KB | 中文 | 文泉驿 (GPL-2.0) |
| 14px | X11 14px 等宽 | 7×14 | 3.6 KB | 西文·数字 | X11 misc-fixed (公有领域) |
| 15px | 文泉驿点阵宋体 15px | 17×18 | 168.4 KB | 中文 | 文泉驿 (GPL-2.0) |
| 16px | 文泉驿点阵宋体 16px | 19×19 | 195.7 KB | 中文 | 文泉驿 (GPL-2.0) |
| 16px | Unifont 16px 等宽 | 16×16 | 141.4 KB | 中文 | GNU Unifont (OFL-1.1) |
| 18px | X11 18px 等宽 | 18×18 | 174.9 KB | 中文 | X11 misc-fixed (公有领域) |
| 20px | X11 20px 等宽 | 10×20 | 6.1 KB | 西文·数字 | X11 misc-fixed (公有领域) |

全部来自字体设计师**逐像素手工绘制**的 BDF 点阵字体，**不是**把轮廓字体缩小栅格化，
也**不是**把同一字形加粗或整数倍放大。每个字号都是针对该像素尺寸单独设计的，
笔画数与结构各不相同（测试中已断言 `16px 笔迹数 ≠ 8px 笔迹数 × 4`）。

- 中文可用尺寸：**8 / 10 / 12 / 13 / 14 / 15 / 16 / 18px**
- 9 / 14 / 20px 目前只有西文·数字（开源世界没有这三个尺寸的中文点阵字库），
  UI 中已明确标注覆盖范围
- 各字体**按需懒加载**，只有选中时才下载单个 `.bin`，首屏不受影响
- 字体面板带**字形实时预览**，选之前就能看清实际点阵

> ⚠️ **授权说明**：`pixel-*-wqy.bin` 是文泉驿点阵宋体的子集化衍生数据，
> 以 **GPL-2.0** 单独授权，**不适用**本项目的 MIT 许可，仅作聚合分发。
> 详见 `frontend/public/fonts/NOTICE.txt`，其中同时记录了已排除字体及其实测原因
> （Zpix 需付费且禁止转换、Ark Pixel 缺少高频常用字、ChillBitmap/Cubic 11 只有轮廓格式等）。

### 3. 透明色可直接绘制

颜色面板新增「透明」选项，可直接用画笔 / 直线 / 矩形 / 圆形 / 填充 / 替换
把已有拼豆覆盖为透明，不必切到橡皮擦。透明可正常参与撤销，
颜色统计天然排除透明。

### 4. 高亮配豆模式 + 逐色配豆进度

按色号把目标拼豆高亮、其余压暗，并逐色记录「已配完」，跟着图纸一颗颗配色。

入口是画布左下角的 **「配豆高亮」** 悬浮按钮（`position: fixed`，三种模式都在，不会被画布滚动推出视口）。

**高亮**

- 点色号即高亮，支持**多色号**同时高亮，实时显示每个色号命中多少颗
- **压暗程度**可调（0~95%），保留整体图案作参照，不是把其余直接抹掉
- 可选**区域外轮廓描边**：只描这一色的整体形状边界，而不是密密麻麻的逐格方框

**逐色配豆进度**

- 每个色号可标记「已配完」，面板顶部显示 `已完成 X/Y 色`、`Z/W 颗` 与百分比进度条
- 可一键**在画布上隐藏已配完的色号**，完成一色就收掉一色，剩下要配的越看越清楚
- 「隐藏已配完」可独立生效，**不需要同时开启高亮**
- 一键重置进度；画板改动后自动清理已不存在的色号

> 功能定位参考了 [fusuguo/ddny（豆豆你呀）](https://github.com/fusuguo/ddny) 的高亮配豆思路，
> 但**实现完全独立**（对方是 AGPL-3.0，本项目是 MIT，不能复用其代码）。
> 并且做法更简单也更准确：对方处理的是图纸**图片**，需要逐像素算颜色距离 + 阈值匹配，
> 还得靠形态学闭运算/填洞/去噪来补救误匹配；
> 而 CC-PinDou 的 `gridData` 里直接存着每格的**精确 hex**，
> 只需精确比对字符串即可，命中率 100%、零误判，也不需要阈值与形态学处理。

### 5. 标识线 / 田字格定位（右侧栏卡片）

图纸一大就很难快速报出「第几行第几列」。用两级辅助线做定位参考：

- **每 5 格一条细线**（小格）、**每 10 格一条粗线**（大格），
  每个大格被细线四等分，形成「田」字形
- **线宽可自由调节**：细线 1~8px、粗线 1~12px（默认 2 / 4，比最初的一档更醒目）
- 所有数值都用**箭头步进 + 可直接输入**的方式调整（间隔、线宽、X/Y 位移），
  比滑块更容易精确落在想要的数值上
- **整块田字格可上下左右平移若干格** —— 相当于一张无限延伸的格子纸，
  移动的是格子而不是图案；把分组线对齐到图案边界后，报坐标会容易很多
  - 箭头逐格微调、中间数值可直接输入，支持负位移，一键归零
- 入口在**右侧栏「背景图层」下方的「标识线 / 田字格」卡片**里（绘制模式）。
  刻意不放在设置弹窗：设置是模态弹窗，打开后背景会模糊，
  根本看不清田字格偏移了多少格，没法「边看边调」
- 所有改动**实时生效**，画布始终可见

导出/保存的图纸**包含同一套田字格**：

- 前端导出 `exportImageFrontend` 与编辑器**共用**判定函数 `isGuideLine`，
  线宽也走同一份配置
- Python 后端 `export_generator.py` 实现同一套两级 + 位移 + 线宽逻辑
- 保存弹窗里的「标识线」开关**每次打开都会从右侧栏设置重新同步**，
  不会出现「设置里开了、导出弹窗里却是关的」
- 保存弹窗里**不再重复提供「格子大小」输入**（与右侧栏设置重复且易冲突），
  只保留开关，并显示本次导出会采用的完整参数摘要

---

## 数据来源与致谢

**MARD 色卡数据**（色号、色值）同步自
[pixel-beads.com — MARD 拼豆色号大全（2026 重新修订版）](https://www.pixel-beads.com/zh/mard-bead-color-chart)，
授权 **CC BY 4.0**，版权归 **PixelBeads** 所有。

- 权威数据快照：`data/mard-chart/mard-2026-rev.json`（291 色）
- 同步脚本：`python3 scripts/sync-mard-colors.py`（`--check` 只检查不写入）
  会统一更新 `frontend/src/data/colorSystemMapping.json`、
  `data/colorSystemMapping.json` 与 `data/colors.db` 三处，避免手工维护分叉
- 仅更新 MARD 色值；其他品牌（COCO / 漫漫 / 盼盼 / 咪小窝）与色号一律不动
- `frontend/src/data/mardColors.test.ts` 会校验数据未再漂移

> 说明：权威色卡中 Q04 与 R11 为同一色值 `#FFEBFA`，而本项目数据结构以 hex 为 key，
> 无法承载两个 MARD 色号。为不丢失颜色，R11 保留独立值 `#FFEBFB`，
> 该例外在同步脚本与测试中均已显式登记。


## 静态部署

```bash
cd frontend
npm install
npm run build:fonts        # 可选：重新生成点阵字体数据（需联网下载 BDF）

# 部署到子路径 https://<user>.github.io/CC-PinDou/
GH_TOKEN=xxx ./scripts/deploy-pages.sh --base /CC-PinDou/

# 部署到自定义域名 https://pindou.yiling.win/（base 自动改为 /，并写入 CNAME）
GH_TOKEN=xxx ./scripts/deploy-pages.sh --cname pindou.yiling.win
```

`vite.config.ts` 的 `base` 由 `VITE_BASE` 注入，`BrowserRouter` 使用相同的 basename，
并自动生成 `404.html`（SPA 回退）与 `.nojekyll`。

> ⚠️ 绑定自定义域名后站点会从「子路径」变成「域名根目录」，
> `base` 必须由 `/CC-PinDou/` 改为 `/`，否则所有资源仍指向子路径而 404。
> 传 `--cname` 会自动处理，并写好 GitHub Pages 需要的 `CNAME` 文件。

自定义域名 DNS 记录（在 Cloudflare 等 DNS 服务商添加）：

| 类型 | 名称 | 目标 | 代理 |
|------|------|------|------|
| CNAME | `pindou` | `youyoudezhuzhu.github.io` | **DNS only（灰云）** |

> 开橙云代理会让 GitHub 的 Let's Encrypt 校验失败，无法自动签发 HTTPS 证书。

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
git clone https://github.com/youyoudezhuzhu/CC-PinDou.git
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
| UI 设计系统 | NookUI | — |
| 灵感来源与参考 | perler-beads | [GitHub](https://github.com/Zippland/perler-beads) |

> ⚠️ **版权声明**：像素模式图标中的角色形象版权归 Nintendo 所有。  
> Nintendo owns the copyright of these characters. Please comply with the Nintendo guidelines and laws of the applicable jurisdiction.

---

## License

MIT License
