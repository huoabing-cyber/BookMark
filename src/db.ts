// D1 query layer. Pure functions that take a D1Database handle so the
// route handlers in index.ts stay thin and easy to read.

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ALLOWED_TUNNEL_SUFFIXES?: string;
  ASSETS: Fetcher;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow extends UserPublic {
  password_hash: string;
  salt: string;
  iterations: number;
}

export interface BookmarkRow {
  id: string;
  user_id: string;
  url: string;
  name: string;
  description: string;
  tags: string; // JSON-encoded array
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── users ──

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      'SELECT id, email, username, password_hash, salt, iterations, created_at, updated_at FROM users WHERE email = ?',
    )
    .bind(email.toLowerCase())
    .first<UserRow>();
}

export async function findUserByUsername(
  db: D1Database,
  username: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      'SELECT id, email, username, password_hash, salt, iterations, created_at, updated_at FROM users WHERE username = ?',
    )
    .bind(username)
    .first<UserRow>();
}

export async function getUserById(
  db: D1Database,
  id: string,
): Promise<UserPublic | null> {
  return db
    .prepare(
      'SELECT id, email, username, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(id)
    .first<UserPublic>();
}

export async function createUser(
  db: D1Database,
  u: {
    id: string;
    email: string;
    username: string | null;
    hash: string;
    salt: string;
    iterations: number;
  },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (id, email, username, password_hash, salt, iterations) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(u.id, u.email.toLowerCase(), u.username, u.hash, u.salt, u.iterations)
    .run();
}

// ── bookmarks ──

export async function listBookmarks(
  db: D1Database,
  userId: string,
): Promise<BookmarkRow[]> {
  const result = await db
    .prepare(
      'SELECT id, user_id, url, name, description, tags, sort_order, created_at, updated_at FROM bookmarks WHERE user_id = ? ORDER BY sort_order ASC, created_at DESC',
    )
    .bind(userId)
    .all<BookmarkRow>();
  return result.results ?? [];
}

export async function getBookmark(
  db: D1Database,
  id: string,
  userId: string,
): Promise<BookmarkRow | null> {
  return db
    .prepare(
      'SELECT id, user_id, url, name, description, tags, sort_order, created_at, updated_at FROM bookmarks WHERE id = ? AND user_id = ?',
    )
    .bind(id, userId)
    .first<BookmarkRow>();
}

export async function createBookmark(
  db: D1Database,
  b: {
    id: string;
    userId: string;
    url: string;
    name: string;
    description: string;
    tags: string;
    sortOrder: number;
  },
): Promise<BookmarkRow> {
  await db
    .prepare(
      'INSERT INTO bookmarks (id, user_id, url, name, description, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(b.id, b.userId, b.url, b.name, b.description, b.tags, b.sortOrder)
    .run();
  const created = await db
    .prepare(
      'SELECT id, user_id, url, name, description, tags, sort_order, created_at, updated_at FROM bookmarks WHERE id = ?',
    )
    .bind(b.id)
    .first<BookmarkRow>();
  if (!created) throw new Error('bookmark insert returned no row');
  return created;
}

export async function updateBookmark(
  db: D1Database,
  id: string,
  userId: string,
  patch: { url: string; name: string; description: string; tags: string },
): Promise<BookmarkRow | null> {
  const result = await db
    .prepare(
      "UPDATE bookmarks SET url = ?, name = ?, description = ?, tags = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    )
    .bind(patch.url, patch.name, patch.description, patch.tags, id, userId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) return null;
  return db
    .prepare(
      'SELECT id, user_id, url, name, description, tags, sort_order, created_at, updated_at FROM bookmarks WHERE id = ?',
    )
    .bind(id)
    .first<BookmarkRow>();
}

export async function deleteBookmark(
  db: D1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function reorderBookmarks(
  db: D1Database,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  const stmt = db.prepare(
    "UPDATE bookmarks SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
  );
  const batch = orderedIds.map((id, index) =>
    stmt.bind(index, id, userId),
  );
  await db.batch(batch);
}

export async function getMaxSortOrder(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT MAX(sort_order) AS max_order FROM bookmarks WHERE user_id = ?',
    )
    .bind(userId)
    .first<{ max_order: number | null }>();
  return row?.max_order ?? -1;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Parse the JSON `tags` column into a string array, falling back to []. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Project a D1 bookmark row into the API shape the frontend expects. */
export function projectBookmark(b: BookmarkRow) {
  return {
    id: b.id,
    user_id: b.user_id,
    url: b.url,
    name: b.name,
    description: b.description,
    tags: parseTags(b.tags),
    sort_order: b.sort_order,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}