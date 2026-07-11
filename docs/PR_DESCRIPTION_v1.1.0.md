# PR / Release Description — v1.1.0

> 📋 这是给 GitHub PR 或 v1.1.0 Release 页面粘贴用的描述文本。
> 复制下面的代码块即可。

---

## Summary

Add a **hold-to-reveal password toggle** to all three authentication inputs
on the auth modal: `authPassword` (login), `authPasswordReg` (register), and
`authPasswordConfirm` (register confirm). The plaintext view is only visible
while the user actively presses the eye icon — release (or mouse-out) and
the field reverts to `type=password` immediately.

## Motivation

Users occasionally mistype passwords but have no in-place way to verify
what they typed. A toggle that requires a **deliberate hold** (not a sticky
show/hide) trades a tiny bit of convenience for significantly better
shoulder-surfing resistance — and matches how password reveal is implemented
in iOS Safari, the LastPass extension, and most banking apps.

## Changes

| File | Change |
|------|--------|
| `bookmark-nav/index.html` | +90 / -3 — new CSS, three wrapped inputs, one new JS helper |

- **CSS**: `.password-wrap` (relative) + `.password-reveal` (absolute,
  right-anchored 32×32 button) with hover / active states that match the
  auth modal palette. Active state uses `transform: scale(0.94)` for a
  press feel.
- **HTML**: each of three password `<input>` elements is now wrapped in
  `.password-wrap` with a sibling `<button class="password-reveal">`.
- **JS**: new `revealPassword(btn, show)` helper scoped to the closest
  `.password-wrap`, bound to `mousedown / mouseup / mouseleave /
  touchstart / touchend` so the same function works for any password
  input on the page.

## Behavior matrix

| Event                          | Effect                       |
|--------------------------------|------------------------------|
| `mousedown` / `touchstart`     | `type="text"` (plaintext)    |
| `mouseup` / `mouseleave` / `touchend` | `type="password"` (revert) |
| Tap without press              | `type="password"` (no change) |
| Lucide icon                    | `eye` ⇄ `eye-off`            |

## Safety checklist

- [x] Toggle uses `type="button"` — won't submit the form
- [x] `onfocus="this.blur()"` — caret stays in the password field
- [x] `mouseleave` bound to hide — no "stuck on plaintext" state
- [x] All three auth fields covered (login / register / confirm)
- [x] No backend changes · No API changes · No DB migration
- [x] No new npm dependencies
- [x] `.gitignore` re-verified clean (`*.db`, `backups/`, `logs/`,
      `.env*`, `*.pem`, `*.key`)

## Testing

```bash
open http://localhost:8080/
```

1. Click 右上角 **登录** → type any password → press and hold the
   eye icon → plaintext visible → release → bullets back.
2. Switch to **注册** tab → repeat on both 密码 and 确认密码 fields.
3. Hover only (no press) → no state change.
4. Press, then drag mouse away while still holding → field reverts
   mid-press (this is the intentional `mouseleave` behavior).

## Impact

- Single-file diff: **+90 / -3**
- No deploy coordination needed — drop-in.
- Existing users pick up the change on next page load.

## Release tag

```bash
git tag -a v1.1.0 -m "Release v1.1.0: hold-to-reveal password toggle"
git push origin v1.1.0
```

> The tag is **annotated** so it shows author, date, and message in the
> GitHub Releases panel.
