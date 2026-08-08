# 实践手账（高铁版）

一个面向社会实践团队的本地优先记录平台：用**可行驶的高铁线路**呈现活动时间线，用可翻页的双页手账沉淀照片、日记、成员故事和写给未来的信。

本项目基于 [lionlnuc/social-practice-journey](https://github.com/lionlnuc/social-practice-journey) 改造，已完成两项主题替换：

- **背景**：原项目的公路/田野风景 → **铁路背景**（`public/ui-assets/rail-bg.webp`）；
- **交通工具**：公路上行驶的小巴 → **高铁动车组侧视图**（`public/ui-assets/train-side.webp`，透明背景）。

其余功能（翻页手账、页内编辑器、IndexedDB 本地草稿、JSON/ZIP 导入导出、发布前校验等）继承自原项目，保持本地优先、开箱即用。

## 功能

- **高铁线路时间线**：活动按日期从左向右排列，动车组随滚动进度沿线行驶并根据线路走向转向；支持章节跳转、逐站按钮、键盘、滚轮和拖拽。
- **翻页手账**：桌面双页手账包含章节目录、日记、照片、天气、心情、BGM、成员墙和未来信箱；长正文与成员墙自动续页，照片支持无干扰放大查看。
- **页面内编辑**：在右侧编辑器中维护项目、章节、活动、成员、媒体和未来信，无需手工修改 JSON。
- **本地优先草稿**：结构数据和媒体保存在当前浏览器，公开发布版与本地草稿可独立预览。
- **完整导入导出**：支持轻量 JSON 备份和携带图片、录音的 ZIP 发布包，替换数据前展示导入摘要。
- **发布前校验**：使用 Zod 检查字段、排序、资源引用、MIME 类型和字节数。
- **可访问交互**：主要控件具备可访问名称，支持键盘操作、焦点恢复和 `prefers-reduced-motion`。

> 当前正式支持桌面端，建议浏览器宽度至少 1080px。原项目的 Django 后端不在本次改造范围内。

## 技术栈

| 范围 | 技术 |
| --- | --- |
| 应用 | React 19、TypeScript、Vite |
| 路由与交互 | React Router、react-pageflip、Motion、Lucide React |
| 本地数据 | IndexedDB、idb、Zod |
| 导入导出 | JSZip、浏览器 File/Blob API |
| 测试 | Vitest、Testing Library |
| 质量检查 | ESLint、TypeScript |

## 素材说明

正式素材位于 `public/ui-assets/`：

| 文件 | 用途 |
| --- | --- |
| `train-side.webp` | 动车组侧视图（透明背景，车头朝右），随线路转动 |
| `rail-bg.webp` | 铁路背景，铺满整个线路世界 |

原始图片与旧素材归档在 `reference/`：

- `reference/列车替换图2.jpg`：当前使用的动车组侧视图原始图片（白底，已程序化抠成透明素材）；
- `reference/列车替换图.png`：上一版动车侧视图（备用）；
- `reference/动车1.png`：上一版动车侧视图（备用）；
- `reference/背景照片.png`：铁路背景原始照片；
- `reference/原项目素材/`：原项目的 `cartoon-bus.png`、`field-panorama.webp` 等旧素材备份。

## 代码改造点

| 文件 | 改造内容 |
| --- | --- |
| `src/features/journey/RoadTimeline.tsx` | 素材常量指向动车组与铁路背景；公路 SVG 改为无砟铁路（混凝土底座/双轨/接触网），站点处增加接触网支柱、腕臂、承力索与接触线 |
| `src/features/journey/roadGeometry.ts` | 保留原有线路几何（可继续微调振幅/间距） |
| `src/features/journey/journey.css` | 公路视觉改为无砟铁路视觉（混凝土底座 + 锈钢色钢轨 + 接触网）；动车组精灵图宽度调整为 240px |
| 文案（导航、编辑器、示例数据） | “公路 / 小巴”统一替换为“高铁线路 / 动车组” |

## 快速开始

需要 Node.js 22 或更高版本和 npm：

```bash
npm install
npm run dev
```

开发服务器启动后，终端会显示本地访问地址。生产构建：

```bash
npm run build
npm run preview
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 执行 TypeScript 检查并生成 `dist/` |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行单元与组件测试 |

## 内容编辑与发布

- 点击页面右上角的铅笔按钮打开内容编辑器。
- 首次编辑时，当前发布快照会克隆为浏览器本地草稿。
- 使用顶部“草稿 / 发布版”开关比较内容。
- 日常备份可导出 JSON；跨设备迁移或正式发布应导出 ZIP。
- 将 ZIP 安装到站点的 `public/content` 目录后重新构建。

## 数据与隐私

- 草稿、上传图片和录音默认只保存在当前浏览器；清除站点数据可能导致草稿丢失。
- JSON 不包含媒体二进制；只有 ZIP 是完整备份。
- “致未来的自己”是纪念性定时展示，不提供加密或保密能力，请勿填写敏感信息。
- 麦克风仅在用户主动录音时请求权限，音频不会自动播放。

## 许可证与致谢

- 本项目基于 [lionlnuc/social-practice-journey](https://github.com/lionlnuc/social-practice-journey) 改造，原项目采用 ISC License，本项目沿用该许可证并保留署名。
- 仓库中的项目内容与图片均为演示素材；正式发布前请确认所用图片的版权与授权。
