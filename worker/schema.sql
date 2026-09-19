-- BookMark D1 schema.
-- Apply locally with:  npm run db:init:local
-- Apply remotely with: npm run db:init:remote

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    UNIQUE NOT NULL,
  username      TEXT,
  password_hash TEXT    NOT NULL,  -- base64url of PBKDF2 derived bits
  salt          TEXT    NOT NULL,  -- base64url
  iterations    INTEGER NOT NULL,  -- PBKDF2 iteration count
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT    DEFAULT '',
  tags        TEXT    DEFAULT '[]',  -- JSON-encoded array of strings
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_sort ON bookmarks(user_id, sort_order);