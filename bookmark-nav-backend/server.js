const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDb, database: db } = require('./database');
const { authenticateToken, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware

// 可配置的内网穿透服务 origin 后缀（逗号分隔），默认加了 vicp.fun / 6655.la / trycloudflare.com / loca.lt
// 后续换穿透服务不用改代码，只需在 plist/环境里加一项，例如：
//   CORS_ALLOWED_TUNNEL_SUFFIXES=".vicp.fun,.6655.la,.trycloudflare.com,.loca.lt,.frp.run"
const ALLOWED_TUNNEL_SUFFIXES = (process.env.CORS_ALLOWED_TUNNEL_SUFFIXES
  || '.vicp.fun,.6655.la,.trycloudflare.com,.loca.lt,.ngrok-free.app,.cpolar.io,.natapp.net')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like file://, curl, Postman)
    // or localhost origins
    // origin can be: null (file://), 'null' (string), 'http://localhost:xxx', 'https://...' etc
    // 允许的 origin：
    //   - 无 origin（同源 / file:// / curl）
    //   - 'null'
    //   - file:// ...
    //   - http://localhost / 含 'localhost'
    //   - 内网穿透服务后缀（ALLOWED_TUNNEL_SUFFIXES 中任一）
    if (
      !origin ||
      origin === 'null' ||
      origin.startsWith('file://') ||
      origin.startsWith('http://localhost') ||
      origin.includes('localhost') ||
      ALLOWED_TUNNEL_SUFFIXES.some(suffix => origin.endsWith(suffix))
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// ── 静态托管前端（与后端同源部署，端口 8080 一站式访问） ──
const FRONTEND_DIR = path.resolve(__dirname, '..', 'bookmark-nav');
app.use(express.static(FRONTEND_DIR, {
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA fallback：非 /api/* 的路径都返回 index.html
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next(err);
  });
});

// Cookie parser helper
function parseCookies(str) {
  return str.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
}

// ── Auth Routes ────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    // Validate username if provided (alphanumeric and underscore, 3-20 chars)
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({ error: '用户名只能包含字母、数字、下划线，3-20位' });
      }
      const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existingUsername) {
        return res.status(409).json({ error: '该用户名已被占用' });
      }
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: '该邮箱已注册' });
    }

    // Create user
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    db.prepare('INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)').run(
      userId,
      email.toLowerCase(),
      username || null,
      hashedPassword
    );

    const token = generateToken({ id: userId, email: email.toLowerCase(), username: username || null });

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: userId, email: email.toLowerCase(), username: username || null }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Login - supports email or username
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '用户名/邮箱和密码不能为空' });
    }

    // Find user by email or username
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE username = ?').get(email);
    }
    
    if (!user) {
      return res.status(401).json({ error: '用户名/邮箱或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '用户名/邮箱或密码错误' });
    }

    const token = generateToken({ id: user.id, email: user.email, username: user.username });

    // Set cookie
    res.cookie('bookmark_token', token, {
      httpOnly: false, // Allow frontend access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, email: user.email, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

// ── Bookmark Routes ────────────────────────────────────────

// Get all bookmarks for user
app.get('/api/bookmarks', authenticateToken, (req, res) => {
  try {
    const bookmarks = db.prepare(
      'SELECT * FROM bookmarks WHERE user_id = ? ORDER BY sort_order ASC, created_at DESC'
    ).all(req.user.id);

    // Parse tags JSON
    const parsed = bookmarks.map(b => ({
      ...b,
      tags: JSON.parse(b.tags || '[]')
    }));

    res.json({ bookmarks: parsed });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Add bookmark
app.post('/api/bookmarks', authenticateToken, (req, res) => {
  try {
    const { url, name, description, tags } = req.body;

    if (!url || !name) {
      return res.status(400).json({ error: 'URL和名称不能为空' });
    }

    // Normalize URL
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    const id = uuidv4();
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM bookmarks WHERE user_id = ?'
    ).get(req.user.id);
    const sortOrder = (maxOrder?.max_order ?? -1) + 1;

    db.prepare(`
      INSERT INTO bookmarks (id, user_id, url, name, description, tags, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, finalUrl, name.trim(), description || '', JSON.stringify(tags || []), sortOrder);

    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id);

    res.status(201).json({
      message: '添加成功',
      bookmark: { ...bookmark, tags: JSON.parse(bookmark.tags || '[]') }
    });
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Update bookmark
app.put('/api/bookmarks/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { url, name, description, tags } = req.body;

    // Check ownership
    const existing = db.prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: '书签不存在' });
    }

    let finalUrl = url ? url.trim() : existing.url;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    db.prepare(`
      UPDATE bookmarks
      SET url = ?, name = ?, description = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      finalUrl,
      name ? name.trim() : existing.name,
      description !== undefined ? description : existing.description,
      tags ? JSON.stringify(tags) : existing.tags,
      id,
      req.user.id
    );

    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id);
    res.json({
      message: '更新成功',
      bookmark: { ...bookmark, tags: JSON.parse(bookmark.tags || '[]') }
    });
  } catch (error) {
    console.error('Update bookmark error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Delete bookmark
app.delete('/api/bookmarks/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    // First check if the bookmark exists and belongs to the user
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: '书签不存在' });
    }

    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Reorder bookmarks
app.post('/api/bookmarks/reorder', authenticateToken, (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: '参数错误' });
    }

    db.transaction(() => {
      orderedIds.forEach((id, index) => {
        db.prepare('UPDATE bookmarks SET sort_order = ? WHERE id = ? AND user_id = ?').run(index, id, req.user.id);
      });
    });

    res.json({ message: '排序已保存' });
  } catch (error) {
    console.error('Reorder bookmarks error:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ── Start Server ──────────────────────────────────────────

async function start() {
  try {
    await initDb();
    console.log('✅ 数据库初始化成功');

    app.listen(PORT, () => {
      console.log(`🔖 书签导航站后端服务运行在 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  }
}

start();
