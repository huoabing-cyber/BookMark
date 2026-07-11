# BookMark — 书签导航站

一个跑在 **单一 Node.js 进程** 里的私人书签导航站：登录 + 卡片墙 + 自动拉取网站 favicon。
前后端同端口部署（默认 `8080`），不需要 Nginx / 单独静态服务器。

## ✨ 特性

- 邮箱 / 用户名登录注册（bcrypt + JWT）
- 个人书签 CRUD，拖动排序
- 自动拉取站点 favicon（前端直接走 Google favicon 服务，零后端处理）
- 本地 SQLite-via-sql.js 持久化
- 自带 macOS LaunchAgent 配置（开机自启 + 崩溃自拉活）
- CORS 白名单为内网穿透服务优化（花生壳、6655.la、Cloudflare Tunnel 等）

## 🚀 快速启动（**First Run 必读**）

```bash
# 1. 安装依赖（首次）
cd bookmark-nav-backend
npm install

# 2. 启动服务（默认端口 8080）
npm start
```

然后打开浏览器 → <http://localhost:8080/>。

### ⓘ First run 提示

仓库里 **没有** `bookmarks.db`（账号数据刻意不进 git）。首次 `npm start` 时，`database.js` → `initDb()` 会按下面这套自动建空库：

1. 检测文件不存在 (`fs.existsSync`)
2. 在内存里 `new SQL.Database()` 创建空数据库
3. 执行 `CREATE TABLE IF NOT EXISTS users / bookmarks ...` 应用 schema
4. `saveDb()` 调 `fs.writeFileSync` 写出**带 schema 的空 `bookmarks.db`**

接下来在浏览器里调 `POST /api/auth/register { email, password, username? }` 注册自己的账号即可。**没有任何种子账号** —— 不会泄漏前一个用户的任何数据。

> 想看这段逻辑的代码引用？见 `bookmark-nav-backend/database.js` 的 `initDb()` 函数。

## 🛡 隐私 / 已忽略

以下刻意 **不** 进 git（见 `.gitignore`）：

| 模式 | 内容 |
|---|---|
| `*.db` | 账号 / 书签数据 |
| `backups/` | 历史数据库备份 |
| `logs/` | 运行时日志 |
| `node_modules/` | 包目录 |
| `.env` / `*.pem` / `*.key` | 凭证 |

分享这个仓库 **不会** 泄漏任何个人数据。

## 📁 项目结构

```
BookMark/
├── bookmark-nav/                    # 前端 SPA
│   ├── index.html                   # 单页 UI（登录 + 书签墙）
│   ├── README.md                    # 模块说明
│   └── SPEC.md                      # 产品需求详档
├── bookmark-nav-backend/            # 后端
│   ├── server.js                    # 路由 + 静态托管 + SPA fallback
│   ├── auth.js                      # JWT / bcrypt 工具
│   ├── database.js                  # sql.js 持久化 + 首次启动自动建库
│   ├── package.json / package-lock.json
│   └── bookmarks.db                 # ← 首次启动后自动生成（不进 git）
├── com.bookmark.nav.backend.plist   # macOS LaunchAgent（可选）
└── start-backend.sh                 # 应急启动脚本（脱离 launchd）
```

详细规格见 [`bookmark-nav/SPEC.md`](bookmark-nav/SPEC.md)。

## ⚙️ 配置（环境变量）

| 变量 | 默认值 | 用途 |
|---|---|---|
| `PORT` | `8080` | HTTP 端口 |
| `CORS_ALLOWED_TUNNEL_SUFFIXES` | `.vicp.fun,.6655.la,.trycloudflare.com,.loca.lt,.ngrok-free.app,.cpolar.io,.natapp.net` | 逗号分隔，CORS 允许的 origin 后缀 |
| `NODE_ENV` | 未设 | 设 `production` 启用 secure cookie |

## 🔌 API 速查

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | `{ email, password, username? }` |
| `POST` | `/api/auth/login` | — | `{ email\|username, password }` → 返回 JWT |
| `GET`  | `/api/auth/me` | JWT | 当前用户 |
| `GET`  | `/api/bookmarks` | JWT | 列出当前用户书签 |
| `POST` | `/api/bookmarks` | JWT | 新建 |
| `PUT`  | `/api/bookmarks/:id` | JWT | 更新 |
| `DELETE` | `/api/bookmarks/:id` | JWT | 删除 |
| `POST` | `/api/bookmarks/reorder` | JWT | `{ orderedIds: [...] }` 拖动排序 |

## 🍎 macOS 开机自启

```bash
cp com.bookmark.nav.backend.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.bookmark.nav.backend.plist

# 停止
launchctl unload ~/Library/LaunchAgents/com.bookmark.nav.backend.plist
```

plist 使用 `KeepAlive`，进程崩溃后会自动拉起。

## 🤝 贡献者上手

仓库本身已经把"上手成本"压到最低 —— clone → `npm install` → `npm start`。不需要 seed 数据，不需要迁移，不需要环境变量即可跑起来。下一位协作者 clone 后就能直接开发。
