#!/usr/bin/env node
// One-shot migration helper: read the old local SQLite `bookmarks.db`
// (from the removed Express backend) and write a JSON file in the
// frontend's bulk-import format, so you can re-import all your old
// bookmarks into the new Cloudflare deployment via the UI's
// "导入书签" menu item.
//
// Usage:
//   node scripts/export-bookmarks.mjs [path/to/bookmarks.db] [output.json]
//
// Defaults:
//   db:    ../bookmark-nav-backend/bookmarks.db
//   out:   ./bookmarks-export.json  (in the repo root)
//
// Notes:
//   - No npm install needed — uses Node 22.5+'s built-in `node:sqlite`.
//   - The output file is gitignored; treat it as personal data.
//   - After running, open the new BookMark site, log in, then
//     ⋮ menu → 导入书签 → select this JSON file.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const dbPath = process.argv[2] ||
  path.join(repoRoot, 'bookmark-nav-backend', 'bookmarks.db');
const outPath = process.argv[3] ||
  path.join(repoRoot, 'bookmarks-export.json');

if (!fs.existsSync(dbPath)) {
  console.error(`❌ bookmarks.db not found at: ${dbPath}`);
  console.error('   Pass the path explicitly:');
  console.error('     node scripts/export-bookmarks.mjs /path/to/bookmarks.db');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

let total = 0;
const items = [];
try {
  const stmt = db.prepare(
    'SELECT url, name, description, tags FROM bookmarks ORDER BY user_id, sort_order',
  );
  const rows = stmt.all();
  for (const row of rows) {
    let tags = [];
    try {
      const parsed = JSON.parse(row.tags || '[]');
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = [];
    }
    items.push({
      url: String(row.url ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      tags,
    });
    total++;
  }
} finally {
  db.close();
}

fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
console.log(`✅ Exported ${total} bookmarks → ${outPath}`);
console.log('');
console.log('   下一步：在新的 BookMark 站点上注册账号登录，');
console.log('   点右上角 ⋮ → 导入书签 → 选择这个 JSON 文件即可。');