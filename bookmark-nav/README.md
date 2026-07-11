# 书签导航站

前后端分离项目，需要分别启动前端和后端。

## 快速启动

### 1. 启动后端
```bash
cd bookmark-nav-backend
npm install
npm start
```
后端运行在 http://localhost:3001

### 2. 启动前端
直接用浏览器打开 `index.html` 文件即可
（确保后端已启动）

或者用简单 HTTP 服务器：
```bash
# Python 3
cd bookmark-nav
python -m http.server 3000

# 或 Node.js (npx)
npx serve .
```
然后访问 http://localhost:3000

## 功能说明
- 支持邮箱登录/注册
- 支持用户名登录（注册时可设置用户名）
- 数据存储在后端数据库 `bookmarks.db`
