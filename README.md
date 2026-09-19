# BookMark — 书签导航站

一个跑在 **Cloudflare** 上的私人书签导航站：邮箱 / 用户名登录 + 卡片墙 +
拖动排序 + 自动拉取网站 favicon。**前后端同一个 Worker**（Workers Static Assets
托管前端 SPA，Hono 提供 JSON API），不需要 Nginx、不需要单独服务器、不需要内网穿透。

## ✨ 特性

- 邮箱 / 用户名登录注册（PBKDF2-HMAC-SHA256 + 自写 HS256 JWT）
- 个人书签 CRUD，拖动排序
- 自动拉取站点 favicon（前端直接走 Google favicon 服务，零后端处理）
- Cloudflare D1 持久化（边缘 SQLite）
- 离线模式（localStorage 完整保留，不依赖网络）
- CORS 白名单兼容内网穿透后缀（花生壳 / 6655.la / Cloudflare Tunnel / ngrok / localtunnel / cpolar / natapp）
- Workers Static Assets 单 Worker 部署 → 一个 URL 走完 API + 静态前端

## 🚀 部署到 Cloudflare（一次性）

需要：Cloudflare 账号 + Node 20+。

```bash
# 1. 安装依赖
npm install

# 2. 登录（首次会打开浏览器）
npx wrangler login

# 3. 创建 D1 数据库，记下输出的 ID
npm run db:create

# 4. 把上面那个 ID 粘到 wrangler.toml 的 database_id = "..."

# 5. 生成 JWT 密钥
openssl rand -base64 48

# 6. 把密钥设到 Worker（会提示粘贴）
npx wrangler secret put JWT_SECRET

# 7. 初始化远程 D1 schema
npm run db:init:remote

# 8. 部署
npm run deploy
```

部署完成后，`wrangler deploy` 会输出一个 `*.workers.dev` URL，浏览器打开即可注册账号。

### 或者：Cloudflare Dashboard 自动部署

把仓库推到 GitHub，在 Cloudflare Dashboard 里：

- **Workers 入口**（推荐）：Workers & Pages → Create application → **Import from GitHub** → 选 `huoabing-cyber/BookMark`。`wrangler.toml` 会被自动识别，按提示设 JWT_SECRET 和 D1 即可。
- **Pages 入口**（也支持）：Pages → Create → Direct Upload 或 Import from GitHub。如果走 Pages，需要在 Build settings 里把 **Build output directory** 设为 `public`、**Build command** 留空（因为没有 build 步骤）。但 Workers 入口更直接。

### 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，把 JWT_SECRET 替换成一个真实的随机串（openssl rand -base64 48）

npm run db:init:local   # 初始化本地 D1（首次）
npm run dev             # 起 Worker，默认 http://localhost:8787
```

### 从老版本（v1.x）迁移

v1.x 的本地 `bookmarks.db` 已经无法直接复用（D1 schema 不同、密码哈希换了算法）。
如果老 db 里还有书签想带走：

```bash
# 在仓库根执行（需要 Node 22.5+，使用内置 node:sqlite）
node scripts/export-bookmarks.mjs
# 会在仓库根生成 bookmarks-export.json

# 然后去新的部署站点注册账号、登录
# ⋮ 菜单 → 导入书签 → 选这个 JSON 文件
```

## 📁 项目结构

```
BookMark/
├── src/                              # Worker 源码
│   ├── index.ts                      # Hono 路由 + SPA fallback
│   ├── auth.ts                       # PBKDF2 密码哈希 + HS256 JWT
│   └── db.ts                         # D1 查询层
├── public/
│   └── index.html                    # 单文件 SPA（前端）
├── scripts/
│   └── export-bookmarks.mjs          # 老 sqlite → JSON 导出工具
├── wrangler.toml                     # Worker / D1 / Assets 配置
├── schema.sql                        # D1 表结构
├── .dev.vars.example                 # 本地密钥样例（不提交 .dev.vars）
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
└── .gitignore
```

> **注意**：`wrangler.toml`、源代码、静态目录都在仓库根。Cloudflare Pages
> dashboard 在 GitHub 集成时会自动识别根的 `wrangler.toml` 并按 Workers
> runtime 部署（不需要单独的 build 步骤）。

## ⚙️ 配置

### Secret（用 `wrangler secret put` 设置）

| 变量 | 用途 |
|---|---|
| `JWT_SECRET` | HMAC-SHA256 JWT 签名密钥。至少 32 字节随机串。 |

### Vars（`wrangler.toml` `[vars]` 段，可直接改）

| 变量 | 默认值 | 用途 |
|---|---|---|
| `CORS_ALLOWED_TUNNEL_SUFFIXES` | `.vicp.fun,.6655.la,.trycloudflare.com,.loca.lt,.ngrok-free.app,.cpolar.io,.natapp.net` | 逗号分隔，CORS 允许的 origin 后缀 |

### 本地开发（`.dev.vars`）

```ini
JWT_SECRET="paste-the-output-of-openssl-rand-base64-48-here"
```

## 🔌 API 速查

全部走 `https://<your-worker>.workers.dev/api/*`，JSON in / JSON out。
需要鉴权的接口统一要求 `Authorization: Bearer <JWT>`。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | `{ email, password, username? }` → `{ token, user }` |
| `POST` | `/api/auth/login` | — | `{ email\|username, password }` → `{ token, user }` |
| `GET`  | `/api/auth/me` | JWT | → `{ user: { id, email, username, ... } }` |
| `GET`  | `/api/bookmarks` | JWT | → `{ bookmarks: [{ id, url, name, description, tags, ... }] }` |
| `POST` | `/api/bookmarks` | JWT | `{ url, name, description?, tags? }` |
| `PUT`  | `/api/bookmarks/:id` | JWT | `{ url?, name?, description?, tags? }` |
| `DELETE` | `/api/bookmarks/:id` | JWT | — |
| `POST` | `/api/bookmarks/reorder` | JWT | `{ orderedIds: [...] }` 拖动排序 |

### 密码安全

- 算法：PBKDF2-HMAC-SHA256，**100,000 次迭代**，16 字节随机 salt，32 字节派生 key。
- Salt 每次注册独立生成；同密码两次注册 hash 结果不同。
- 验证使用常量时间比较。
- 数据库三列分开存：`password_hash`、`salt`、`iterations`——以后想升级迭代次数只需加判断逻辑。

### JWT

- 算法：HS256（HMAC-SHA256）。
- Payload：`{ id, email, iat, exp }`，默认 7 天过期。
- 通过 `Authorization: Bearer <token>` 头传递；前端存在 `localStorage`。
- 密钥 `JWT_SECRET` 走 wrangler secret，不进 wrangler.toml、不进 git。

## 🔄 故障排查

| 现象 | 检查 |
|---|---|
| 部署成功但所有 API 返回 500 | `wrangler tail` 看日志；常见是 D1 schema 没初始化：`npm run db:init:remote` |
| `JWT malformed` / `登录已过期` | 多半是 `JWT_SECRET` 在本地和远程不一致 |
| Dashboard 报 "Could not detect a directory containing static files" | 你走的是 Pages 流程。改用 Workers & Pages → **Import from GitHub** 入口；或者在 Pages 的 Build settings 里把 Build output directory 设为 `public`、Build command 留空 |
| 前端页面拿到 404 而不是 SPA 路由 | 确认 `public/index.html` 存在；wrangler.toml 里 `[assets] directory = "./public"` |
| CORS 报错 | `CORS_ALLOWED_TUNNEL_SUFFIXES` 里加新 origin 后缀，wrangler 自动 reload vars |

## 📜 License

个人项目，按需自取。