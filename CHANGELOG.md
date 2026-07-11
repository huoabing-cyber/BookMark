# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
