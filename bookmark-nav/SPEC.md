# 书签导航站 - SPEC.md

## 1. Concept & Vision

一个私人网站标签管理与导航工具，像个人版的 AMZ123 / 书签导航门户。用户可以按标签分类管理常用网站，快速搜索、一键访问。界面像一个精心设计的"网站仪表盘"——干净、有条理、访问效率极高。核心用户是有大量常用站点的用户（产品经理、跨境电商卖家等），需要快速找到并访问目标网站。

## 2. Design Language

**Aesthetic direction**: 深色工具台风格（Dark Workshop）—— 深色背景搭配亮色标签/图标，像一个专业工具箱的收纳系统。专业、高效、有点赛博朋克工具的感觉，但不过分。

**Color palette**:
- Background: `#0d0d12`
- Surface: `#16161f`
- Card: `#1e1e2a`
- Border: `#2a2a3a`
- Primary: `#7c6aff`（亮紫）
- Accent: `#00d4aa`（青绿）
- Text primary: `#e8e8f0`
- Text secondary: `#8888a0`
- Tag colors: `['#7c6aff','#00d4aa','#ff6b9d','#ffa726','#29b6f6','#66bb6a']`

**Typography**:
- Display: `"Syne", sans-serif` (bold, distinctive geometric)
- Body: `"DM Sans", sans-serif` (clean, readable)
- Mono: `"JetBrains Mono", monospace` (URLs, tags)

**Motion**:
- Cards: staggered fade-up on load (50ms delay between cards)
- Hover: scale(1.02) + border glow, 200ms ease-out
- Modal: fade + slide-up, 250ms
- Tag filter: smooth color transition 150ms

**Visual assets**:
- Lucide icons (via CDN)
- Favicon extraction via Google Favicon API
- Subtle grid pattern background
- Card glow on hover using box-shadow with primary color

## 3. Layout & Structure

```
┌─────────────────────────────────────────────────────┐
│ [☰] 🔖 书签导航站    [🔍 搜索...][+ 添加书签]        │
├─────────────────────────────────────────────────────┤
│  全部 | 🔴 选品工具 | 🟢 数据分析 | 🔵 运营 | ...   │ ← 标签过滤栏
├─────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │  🔗 Site1  │ │  🔗 Site2  │ │  🔗 Site3  │      │
│  │  描述...   │ │  描述...   │ │  描述...   │      │ ← 书签卡片网格
│  │  #标签     │ │  #标签     │ │  #标签     │      │
│  └────────────┘ └────────────┘ └────────────┘      │
│                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │  🔗 Site4  │ │  🔗 Site5  │ │  🔗 Site6  │      │
│  └────────────┘ └────────────┘ └────────────┘      │
└─────────────────────────────────────────────────────┘
```

**纵排模式**:
```
┌────────────────┬────────────────────────────────────┐
│ [☰] 🔖 导航站  │        [🔍 搜索...][+ 添加书签]    │
├────────────────┼────────────────────────────────────┤
│  全部          │                                    │
│  🔴 选品工具   │   ┌────────┐ ┌────────┐ ┌────────┐ │
│  🟢 数据分析   │   │ Site1  │ │ Site2  │ │ Site3  │ │
│  🔵 运营      │   └────────┘ └────────┘ └────────┘ │
│  ...           │                                    │
└────────────────┴────────────────────────────────────┘
```

**Responsive**:
- Desktop (>1024px): 4列网格
- Tablet (768-1024px): 3列
- Mobile (<768px): 2列 → 1列

## 4. Features & Interactions

### 书签管理
- **添加书签**: 点击按钮 → 弹出 Modal，填写 URL/名称/描述/标签
- **自动提取名称**: 输入 URL 并移出输入框后，自动通过 CORS 代理抓取网页，提取 og:title 或 <title> 作为推荐名称，点击可应用；也提供域名作为备选
- **编辑书签**: 卡片右上角编辑按钮 → 弹出预填充 Modal
- **删除书签**: 编辑 Modal 内删除按钮，带确认
- **访问书签**: 点击卡片主体区域 → 新窗口打开链接

### 标签系统
- 每个书签可添加多个标签（逗号分隔）
- 标签栏显示所有标签 + "全部"选项
- 点击标签 → 过滤显示该标签下的所有书签
- 标签显示对应颜色的圆点
- **显示方向切换**: 左上角菜单可切换标签横排/纵排显示，纵排时标签栏固定在左侧

### 搜索
- 实时搜索（debounce 200ms）
- 搜索范围：名称 + URL + 描述
- 无结果时显示空状态插画 + 提示

### 数据持久化
- localStorage 存储书签列表
- 页面加载时自动恢复数据

### 数据导入/导出
- 左上角菜单 → 导出书签（下载 JSON 文件）
- 左上角菜单 → 导入书签（上传 JSON 文件，自动跳过重复条目）

### 显示偏好持久化
- 标签显示方向（横排/纵排）保存在 localStorage，刷新后保持上次选择

### 错误/边界
- URL 格式校验（自动补全 https://）
- 空书签列表：显示引导添加的插画
- 重复 URL 提示

## 5. Component Inventory

### Header
- Logo (🔖 书签导航站)
- 右侧：搜索框 + 添加按钮
- States: default

### TagBar
- 横向滚动的标签列表
- States: selected (亮色背景), unselected (透明)

### BookmarkCard
- Favicon + 名称 + 描述 + 标签列表
- 右上角：编辑图标按钮（hover 显示）
- States: default, hover (glow + scale), 编辑中

### AddModal / EditModal
- 遮罩层（点击关闭）
- 表单：URL、名称、描述、标签
- 底部：取消 / 保存（编辑时额外显示删除）
- States: adding, editing, deleting (confirm)

### SearchBar
- 搜索图标 + 输入框
- States: empty, typing, has-results, no-results

### EmptyState
- 插画（书签emoji组合）+ 提示文字 + 添加按钮

## 6. Technical Approach

- **Framework**: 纯 HTML + CSS + Vanilla JS（单文件，便于部署）
- **存储**: localStorage
- **Favicon**: `https://www.google.com/s2/favicons?domain={url}&sz=32`
- **图标**: Lucide Icons CDN
- **字体**: Google Fonts (Syne, DM Sans, JetBrains Mono)
- **无外部依赖**: 不需要 React/Vue，直接原生实现
