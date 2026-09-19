# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-09-19

### Changed — full platform migration to Cloudflare

BookMark 离开本地 Express + sqlite + 花生壳穿透，搬到 Cloudflare
Workers + D1。所有 API 路径、请求体、响应体保持兼容（前端代码零改动）。

| Layer | v1.x (removed) | v2.0.0 |
|---|---|---|
| Runtime | Node.js + Express (`bookmark-nav-backend/server.js`) | Cloudflare Workers + Hono |
| Database | 本地 `bookmarks.db` (sql.js, 文件持久化) | Cloudflare D1 (边缘 SQLite) |
| Password hash | `bcryptjs` (Node native bcrypt in JS) | Web Crypto `PBKDF2-HMAC-SHA256`，100k 迭代、16 字节 salt、32 字节派生 key |
| Token | `jsonwebtoken` (Node-only) | Web Crypto `HMAC-SHA256` 自写 HS256，零依赖 |
| Frontend hosting | Express 静态中间件，同 `:8080` | Workers Static Assets，同 Worker URL |
| External access | 花生壳 phtunnel → `*.6655.la`，LAN IP 漂移会断 | `*.workers.dev` 自带 HTTPS，零运维 |
| Process supervision | macOS LaunchAgent `com.bookmark.nav.backend.plist` | 不需要——Workers 自带 99.99% SLA |

### Added

- `worker/` — 完整 Cloudflare Worker 项目
  - `src/auth.ts` — PBKDF2 + HS256 JWT（Web Crypto，无第三方依赖）
  - `src/db.ts` — D1 查询层（prepared statements + batch 事务）
  - `src/index.ts` — Hono 路由 + CORS + SPA fallback
  - `schema.sql` — D1 表结构（`users` / `bookmarks` 两张表 + 索引）
  - `wrangler.toml` — `[[d1_databases]]` 绑定 + `[assets] directory = "./public"`
  - `.dev.vars.example` — 本地开发密钥样例
  - `package.json` — `npm run dev / deploy / db:create / db:init:{local,remote}`
- `scripts/export-bookmarks.mjs` — 老 `bookmarks.db` → JSON 导出工具，
  使用 Node 22.5+ 内置 `node:sqlite`，无 npm 依赖。导出文件喂给
  新前端 UI 的"导入书签"即可恢复书签（账号不迁——重注册）。

### Removed

- `bookmark-nav-backend/` — Express + sql.js + bcryptjs + jsonwebtoken 整套后端
- `bookmark-nav/` — 旧前端位置（已挪到 `worker/public/index.html`）
- `com.bookmark.nav.backend.plist` — LaunchAgent（不再需要本地进程）
- `start-backend.sh` — 应急启动脚本
- `scripts/check-tunnel.sh` — Oray 花生壳健康探测脚本（迁到 Cloudflare 后失效）
- `docs/PR_DESCRIPTION_v1.1.0.md` — 历史 PR 描述
- `README.md` 里的花生壳章节、`com.bookmark.nav.backend.plist` 安装步骤

### Security

- 密码哈希从 bcryptjs 切换到 PBKDF2-HMAC-SHA256。新格式存在 D1
  的三个列：`password_hash`、`salt`、`iterations`——迭代次数入库，
  未来升级只需加"老迭代次数重新派生"逻辑。
- JWT 从 `jsonwebtoken` 切换到 Web Crypto 手写 HS256。算法、字段名、
  默认 7 天 TTL 与 v1.x 完全一致，所以老前端无需改动即可继续验证
  旧 token（前提是 `JWT_SECRET` 相同；本次部署是新密钥）。
- `JWT_SECRET` 走 `wrangler secret put`，**不进 wrangler.toml**、**不进 git**。
  `.dev.vars` 已 gitignore。
- `.gitignore` 增补 `.dev.vars*`、`.wrangler/`、`dist/`、`bookmarks-export.json`。

### Known limitations

- **老用户密码不能复用**——bcrypt hash 不能在 Workers 里直接 verify
  （即使能跑也吃满 CPU 预算），且 PBKDF2 输出格式不同。所有用户必须
  在新部署上重新注册。书签可通过 `scripts/export-bookmarks.mjs` → JSON →
  前端 bulk import 批量恢复。
- D1 是 SQLite，不强制外键约束；删除用户不会级联删除其书签。当前没
  有删除用户接口，影响为零。

---

## [1.1.1] - 2026-07-24

### Fixed

- **External access via `engine725.6655.la` restored** after a silent
  outage that started around `2026-07-13 03:57`.
  Root cause was a three-layer breakdown on the **花生壳 (phtunnel)**
  intranet-penetration side, none of which were in this repo:

  | Layer | What broke | Fix |
  |---|---|---|
  | L1 — tunnel daemon dead | `phtunnel.log` from `03:57` filled with<br>`[ERRR] [config] load config file ... failed` (legacy binary<br>choking on the sandboxed path with spaces), so the client never<br>logged into the花生壳 server, the DNS A record rolled back to<br>`0.0.0.0`, and every browser hit returned `Connection refused`. | Activated the PhDDNS GUI app (`osascript -e 'tell application<br>"PhDDNS" to activate'`); the XPC service re-spawned `phtunnel`,<br>logged in to `phsle5-std01.oray.net`, and the domain resolved<br>back to `58.217.204.239`. |
  | L2 — wrong forward port | `phtunnel.json` had `"forward":"127.0.0.1:80"`<br>but BookMark listens on `8080`. Even with L1 fixed, traffic would<br>have hit a closed port. | Edited `phtunnel.json` to `127.0.0.1:8080` (JSON-safe replace,<br>other keys untouched); the live phtunnel process picked it up on<br>next deploy cycle. Original copy backed up to<br>`backups/phtunnel/phtunnel.json.20260723-095647`. |
  | L3 — stale `servicehost` in cloud mapping | The花生壳 cloud-side mapping entry for<br>`engine725.6655.la` still pointed at the LAN IP the Mac held on<br>`2026-07-11` (`192.168.2.3`); the Mac's current LAN IP is<br>`192.168.2.2`. Every tunnel attempt in `phtunnel.log` after restart<br>logged `connecting 192.168.2.3:8080` → `disconnected ... error: 61`<br>and the cloud returned `502 Bad Gateway`. | **User action** — edit the mapping in花生壳 GUI (or web console at<br>`hsk.oray.com`) and re-set the inner host to the current LAN IP<br>`192.168.2.2`, inner port `8080`. Confirmed working:<br>`HTTP/1.1 200 OK` from `http://engine725.6655.la/`. |

- `com.bookmark.nav.backend.plist` re-confirmed healthy (PID `48362`,
  uptime 11+ days, crash-resilient `KeepAlive`).

### Added

- `scripts/check-tunnel.sh` — one-shot health probe for the whole
  access path. Exits non-zero if any layer fails; safe to wire into
  cron for early-warning before users notice. Layers checked:
  1. Local backend on `localhost:8080` returns 200.
  2. `phtunnel` (`PhtunnelService.xpc`) is alive.
  3. `engine725.6655.la` DNS resolves to a non-`0.0.0.0` IP.
  4. `curl` against `http://engine725.6655.la/` returns 200 — proves
     cloud mapping is reachable end-to-end.

### Known limitation

- **花生壳 free-tier (`*.6655.la` / `*.vicp.fun`) maps are immutable
  cloud-side**: when the Mac's LAN IP changes (DHCP renewal, router
  reboot, Wi-Fi ↔︎ Ethernet swap), the inner host goes stale again
  and external access breaks with `502`. The cloud-side field cannot
  be edited via AppleScript / terminal — only via the GUI / web
  console. `check-tunnel.sh` is the recommended early-warning
  detector. The longer-term solution is the `cloudflared-setup`
  backup (see README).

---

## [1.1.0] - 2026-07-11

### Added

- **Hold-to-reveal password toggle** on all three authentication inputs
  (login, register, confirm-password). Press and hold the eye icon to
  see a password as plain text; release — or move the cursor away —
  to revert automatically. Improves usability while keeping the
  shoulder-surfing risk low (no persistent "show password" mode).

### Changed

- `bookmark-nav/index.html`
  - **CSS**: new `.password-wrap` (relative) + `.password-reveal`
    (absolute right-anchored eye button) with hover / active states
    matching the auth modal palette.
  - **HTML**: each of three password inputs now wrapped in a
    `.password-wrap` with a sibling `<button class="password-reveal">`.
  - **JS**: new `revealPassword(btn, show)` helper bound to
    `mousedown / mouseup / mouseleave / touchstart / touchend`.

### Security

- Password field never stays in plaintext after release:
  `mouseup`, `mouseleave`, and `touchend` all restore `type=password`.
- Toggle button uses `type="button"` to prevent accidental form submit.
- `onfocus="this.blur()"` keeps the caret in the password field while
  the eye icon is being interacted with.
- Existing `.gitignore` rules (`*.db`, `*.pem`, `*.key`, `.env*`,
  `backups/`, `logs/`) verified clean via `git ls-files` —
  **no sensitive artifacts are tracked** in the v1.1.0 tree.

### Compatibility

- No backend changes, no API changes, no DB migrations required.
- 90 insertions / 3 deletions in a single file. Existing users pick
  this up automatically on next page load.

---

## [1.0.0] - Initial release

- Email / username registration & login (bcrypt + JWT).
- Bookmark CRUD with URL, name, description, tags.
- Drag-to-reorder card grid (5 / 6 columns, responsive).
- Auto favicon via Google favicon service (zero backend work).
- Local persistence via sql.js → `bookmarks.db`.
- Light / dark + horizontal / vertical layouts.
- Offline mode (bookmarks in `localStorage`, no auth).
- macOS LaunchAgent plist for crash-resilient autostart.
- CORS allowlist tuned for 花生壳 / 6655.la / Cloudflare Tunnel / ngrok
  / localtunnel / cpolar / natapp.
