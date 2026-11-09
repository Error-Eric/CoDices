# CoDices

把 CoC / TRPG 模组 Markdown 实时编译成**单个自包含 H5 文件**的在线编辑器。

左边写 Markdown，右边即时运行编译后的交互式模组页面。生成结果不依赖服务器，导出后可直接双击打开或发给玩家。语法契约见 [`syntax.md`](./syntax.md)。

## 功能

**写作端**

- Markdown 源码与 H5 实时分栏预览，可拖动分栏、双击复位，支持 `源码 / 分栏 / 预览` 三种布局
- 预览运行在沙箱 iframe 中，模组内容与编辑器、本机草稿相互隔离
- CodeMirror 6 编辑器：Markdown 高亮、TRPG 语法高亮、行号、搜索、折叠与自动换行
- 输入 `@` 时按全文已有标签自动补全；未解析引用会显示诊断和状态栏提示，点击即可跳转
- 「插入」菜单提供宣读框、守秘人提示、NPC / 怪物 / 敌人、线索、Handout、地点章节、表格等片段
- 粗体、斜体、行内代码与交叉引用快捷工具
- 明暗主题、手机宽度预览、新窗口独立预览
- 打开 / 保存 `.md`，拖放导入，导出单文件 H5
- 自动保存本机草稿；新建、载入示例或打开其他文件前自动备份，可通过顶栏「恢复」取回
- 内置语法速查与快捷键面板

**生成的 H5**

- 两遍解析的 `@tag` 交叉引用，前向引用可用，多目标支持滚轮切换
- `aloud` / `kp_notice` / NPC / Mob / 敌人卡片，折叠、复制、悬浮预览
- 行内线索、章节引用、Handout 与图片
- 自动生成 NPC / 怪物 / 线索 / 地点索引
- 顶栏按名称或类型筛选、明暗切换、阅读进度条、主题化细滚动条
- 章节侧边导航、章节折叠、交叉引用目标高亮
- 响应式移动端布局与打印样式
- 全部 CSS / JS 内联，无外部资源依赖

## 本地开发

需要 Node.js 22（或兼容的 20+ 版本）。

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址即可。开发服务器已显式绑定 IPv4，避免在 Windows / WSL 环境下只监听 IPv6 `::1` 导致浏览器无法访问；如果 `localhost` 仍打不开，请使用终端输出的 `http://127.0.0.1:5173/`。

常用命令：

```bash
npm test          # 编译器单元测试
npm run typecheck # TypeScript 类型检查
npm run build     # 类型检查 + 生产构建到 dist/
npm run preview   # 本地预览 dist/ 构建结果
```

## 使用

1. 在左侧编写 Markdown；右侧 H5 会在停止输入后自动刷新，并保留预览滚动位置。
2. 点击「插入」添加模组元素，或直接输入 TRPG 语法。
3. 在正文中用 `@tag` 引用已注册的标签；输入 `@` 会显示补全列表。
4. 点击「导出 H5」生成可直接分发的自包含 HTML；「新窗口」可先独立预览。
5. 编辑内容会自动保存到浏览器本机。`Ctrl/Cmd + S` 保存 `.md` 文件。

常用快捷键：

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl/Cmd + S` | 保存 Markdown |
| `Ctrl/Cmd + O` | 打开 Markdown |
| `Ctrl/Cmd + Shift + E` | 导出 H5 |
| `Ctrl/Cmd + /` | 语法速查 |
| `Ctrl/Cmd + B` / `I` | 粗体 / 斜体 |
| `Alt + 1` / `2` / `3` | 源码 / 分栏 / 预览 |

一个最小示例：

````markdown
---
title: "雾港的钟声"
system: Call of Cthulhu 7e
---

# 雾港的钟声

调查员推开沉重的木门，向调查员宣读 @aloud#1，并找到了 @torn_letter。

## 调查员导入

```aloud [entry_hall]
你推开沉重的橡木门，潮湿的冷风从走廊深处涌出来。
```

调查员在书桌上找到`一封被撕碎又粘好的信`[torn_letter]。
````

## 部署到 GitHub Pages

仓库已包含 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)：

1. 把项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。
3. 工作流会依次运行测试、构建并发布 `dist/`。

Vite 使用相对资源路径（`base: './'`），因此项目站点路径和自定义域名都可以直接工作，不需要修改资源前缀。

## 项目结构

```text
src/
  compiler/       Markdown → 自包含 H5 编译器与页面渲染
  editor/         CodeMirror 配置、TRPG 高亮、补全、诊断、片段
  ui/             内联 SVG 图标
  main.ts         编辑器应用状态、持久化、导入导出与交互
  styles.css      应用界面样式与响应式布局
  sample.md       内置示例模组
tests/            编译器单元测试
public/           favicon 等静态资源
syntax.md         模组语法契约
```

