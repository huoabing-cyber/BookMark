# 书签导航站（前端模块）

## 启动说明已迁移

完整启动、部署、API 文档见项目根 [`README.md`](../README.md)（含首次启动自动建库说明）。

## 模块概要

- 单页 SPA（`index.html`），所有路由 / 视图切换都在前端完成
- 通过 fetch 调用同源 `/api/*` 完成登录和书签 CRUD
- 直接使用 Google favicon 服务（`https://www.google.com/s2/favicons?domain=...`）加载每个书签的图标；失败时 `onerror="this.style.display='none'"` 隐藏

## 数据契约

完整接口契约见 `SPEC.md`，对应后端实现见 `../bookmark-nav-backend/server.js`。

## 文件清单

```
bookmark-nav/
├── index.html        ← 单文件 SPA（HTML + CSS + JS 都在这里）
├── README.md         ← 你正在读
└── SPEC.md           ← 数据契约、状态机、UI 流程
```

## 本地调试建议

```bash
# 只需要后端进程跑起来，前端用任意静态服务器都成
cd ../bookmark-nav-backend && npm start

# 另一个终端：
cd ../bookmark-nav && python3 -m http.server 3000
# 访问 http://localhost:3000/，前端 fetch 会发到 8080 的后端
```

注意跨域已被后端的 CORS 白名单兜底（见根 `README.md` "配置" 段）。
