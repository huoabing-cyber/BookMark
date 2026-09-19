// Hono app — Cloudflare Workers entry point.
//
//   - /api/* routes are handled here (JSON in / JSON out).
//   - Every other GET falls through to the SPA: index.html is returned
//     so the frontend's client-side router can take over.
//   - Static assets (index.html itself) are served directly by Wrangler
//     from ./public via the [assets] binding in wrangler.toml.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono/types';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  type JwtPayload,
} from './auth';
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  getUserById,
  listBookmarks,
  getBookmark,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
  getMaxSortOrder,
  newId,
  projectBookmark,
  type Env,
} from './db';

type Variables = { user: JwtPayload };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── CORS ────────────────────────────────────────────────────────────
//
// Mirrors the original Express server's allowlist:
//   - no Origin (same-origin, file://, curl, Postman)
//   - 'null' (sandboxed iframes)
//   - file://
//   - any localhost
//   - any CORS_ALLOWED_TUNNEL_SUFFIXES entry
//
// When using Workers Static Assets in a single Worker (the default deploy),
// the API and frontend share an origin so CORS rarely matters — but we
// keep the allowlist for the case where someone splits the frontend onto
// Pages or another host.

const DEFAULT_TUNNEL_SUFFIXES =
  '.vicp.fun,.6655.la,.trycloudflare.com,.loca.lt,.ngrok-free.app,.cpolar.io,.natapp.net';

function tunnelSuffixes(env: Env): string[] {
  const raw = env.CORS_ALLOWED_TUNNEL_SUFFIXES || DEFAULT_TUNNEL_SUFFIXES;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      // No Origin header — same-origin / file:// / curl / Postman.
      if (!origin) return origin;
      // Sandboxed iframe (Origin: "null").
      if (origin === 'null') return origin;
      // Local files / dev servers.
      if (origin.startsWith('file://')) return origin;
      if (origin.includes('localhost')) return origin;
      // Tunnel suffix allowlist — env-configurable, falls back to a
      // sensible default list of common CN intranet-penetration domains.
      const suffixes = tunnelSuffixes(c.env);
      if (suffixes.some((s) => origin.endsWith(s))) return origin;
      // Returning '' causes Hono to skip CORS headers entirely,
      // effectively denying the request from a browser.
      return '';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
);

// ── Auth middleware ─────────────────────────────────────────────────

const authenticate: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const header = c.req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: '请先登录' }, 401);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: '登录已过期，请重新登录' }, 403);
  c.set('user', payload);
  await next();
};

// ── /api/auth/register ─────────────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; username?: unknown }
    | null;
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const usernameRaw =
    typeof body.username === 'string' && body.username.trim()
      ? body.username.trim()
      : null;

  if (!email || !password) {
    return c.json({ error: '邮箱和密码不能为空' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: '邮箱格式不正确' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: '密码至少6位' }, 400);
  }
  if (usernameRaw && !/^[a-zA-Z0-9_]{3,20}$/.test(usernameRaw)) {
    return c.json({ error: '用户名只能包含字母、数字、下划线，3-20位' }, 400);
  }

  if (usernameRaw) {
    const dup = await findUserByUsername(c.env.DB, usernameRaw);
    if (dup) return c.json({ error: '该用户名已被占用' }, 409);
  }
  const existing = await findUserByEmail(c.env.DB, email);
  if (existing) return c.json({ error: '该邮箱已注册' }, 409);

  const userId = newId();
  const hashed = await hashPassword(password);
  await createUser(c.env.DB, {
    id: userId,
    email,
    username: usernameRaw,
    hash: hashed.hash,
    salt: hashed.salt,
    iterations: hashed.iterations,
  });

  const token = await signJwt(
    { id: userId, email: email.toLowerCase() },
    c.env.JWT_SECRET,
  );
  return c.json(
    {
      message: '注册成功',
      token,
      user: { id: userId, email: email.toLowerCase(), username: usernameRaw },
    },
    201,
  );
});

// ── /api/auth/login ─────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const id = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!id || !password) {
    return c.json({ error: '用户名/邮箱和密码不能为空' }, 400);
  }

  let user = await findUserByEmail(c.env.DB, id);
  if (!user) user = await findUserByUsername(c.env.DB, id);
  if (!user) return c.json({ error: '用户名/邮箱或密码错误' }, 401);

  const ok = await verifyPassword(password, {
    hash: user.password_hash,
    salt: user.salt,
    iterations: user.iterations,
  });
  if (!ok) return c.json({ error: '用户名/邮箱或密码错误' }, 401);

  const token = await signJwt(
    { id: user.id, email: user.email },
    c.env.JWT_SECRET,
  );
  return c.json({
    message: '登录成功',
    token,
    user: { id: user.id, email: user.email, username: user.username },
  });
});

// ── /api/auth/me ────────────────────────────────────────────────────

app.get('/api/auth/me', authenticate, async (c) => {
  const payload = c.get('user');
  const user = await getUserById(c.env.DB, payload.id);
  if (!user) return c.json({ error: '用户不存在' }, 404);
  return c.json({ user });
});

// ── /api/bookmarks (list + create) ─────────────────────────────────

app.get('/api/bookmarks', authenticate, async (c) => {
  const payload = c.get('user');
  const list = await listBookmarks(c.env.DB, payload.id);
  return c.json({ bookmarks: list.map(projectBookmark) });
});

app.post('/api/bookmarks', authenticate, async (c) => {
  const payload = c.get('user');
  const body = (await c.req.json().catch(() => null)) as
    | { url?: unknown; name?: unknown; description?: unknown; tags?: unknown }
    | null;
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const url = typeof body.url === 'string' ? body.url : '';
  const name = typeof body.name === 'string' ? body.name : '';
  if (!url || !name) return c.json({ error: 'URL和名称不能为空' }, 400);

  let finalUrl = url.trim();
  if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;

  const description =
    typeof body.description === 'string' ? body.description : '';
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string')
    : [];

  const id = newId();
  const sortOrder = (await getMaxSortOrder(c.env.DB, payload.id)) + 1;
  const created = await createBookmark(c.env.DB, {
    id,
    userId: payload.id,
    url: finalUrl,
    name: name.trim(),
    description,
    tags: JSON.stringify(tags),
    sortOrder,
  });
  return c.json({ message: '添加成功', bookmark: projectBookmark(created) }, 201);
});

// ── /api/bookmarks/:id (update + delete) ────────────────────────────

app.put('/api/bookmarks/:id', authenticate, async (c) => {
  const payload = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as
    | { url?: unknown; name?: unknown; description?: unknown; tags?: unknown }
    | null;
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const existing = await getBookmark(c.env.DB, id, payload.id);
  if (!existing) return c.json({ error: '书签不存在' }, 404);

  let url = typeof body.url === 'string' ? body.url : existing.url;
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : existing.name;

  const description =
    typeof body.description === 'string'
      ? body.description
      : existing.description;

  let tagsJson = existing.tags;
  if (Array.isArray(body.tags)) {
    tagsJson = JSON.stringify(
      body.tags.filter((t): t is string => typeof t === 'string'),
    );
  }

  const updated = await updateBookmark(c.env.DB, id, payload.id, {
    url,
    name,
    description,
    tags: tagsJson,
  });
  if (!updated) return c.json({ error: '更新失败' }, 500);
  return c.json({ message: '更新成功', bookmark: projectBookmark(updated) });
});

app.delete('/api/bookmarks/:id', authenticate, async (c) => {
  const payload = c.get('user');
  const id = c.req.param('id');
  const ok = await deleteBookmark(c.env.DB, id, payload.id);
  if (!ok) return c.json({ error: '书签不存在' }, 404);
  return c.json({ message: '删除成功' });
});

// ── /api/bookmarks/reorder ──────────────────────────────────────────

app.post('/api/bookmarks/reorder', authenticate, async (c) => {
  const payload = c.get('user');
  const body = (await c.req.json().catch(() => null)) as
    | { orderedIds?: unknown }
    | null;
  if (!body || !Array.isArray(body.orderedIds)) {
    return c.json({ error: '参数错误' }, 400);
  }
  const orderedIds = body.orderedIds.filter(
    (x): x is string => typeof x === 'string',
  );
  await reorderBookmarks(c.env.DB, payload.id, orderedIds);
  return c.json({ message: '排序已保存' });
});

// ── SPA fallback ────────────────────────────────────────────────────
//
// Any GET that isn't an /api/* route and isn't a static asset gets
// index.html so the frontend can take over routing. Static assets that
// exist in ./public are served directly by Wrangler before reaching this
// handler.

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const indexResp = await c.env.ASSETS.fetch(
    new Request(new URL('/index.html', url), c.req.raw),
  );
  return indexResp;
});

// ── Worker export ───────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;