# CPH Evaluation System - fork owned by `bsomar16`

This repository is the **owned copy** of the CPH HR evaluation platform.

| | |
|---|---|
| **Upstream (original)** | `techbeinweb-sys/evaluation-sys-app` (private, read-only for `bsomar16`) |
| **This repository** | `bsomar16/evaluation-sys-app` (private, `bsomar16` has `admin`) |
| **Runtime hosting** | cPanel shared hosting `cph-agro.com` (Apache + PHP 8.3 + PostgreSQL 13.23) |
| **Runtime database** | PostgreSQL 13.23 on the same host, cPanel-managed |
| **Runtime GitHub** | none - GitHub is source-of-truth only, never a runtime dependency |

## Why a new repository instead of a GitHub fork

The upstream repository is a **personal account** (`techbeinweb-sys`), not an
organisation, and `bsomar16` only had `pull` access to it. A GitHub fork would
have kept the parent link and the whole commit history - including a live
service-role key and a hardcoded backdoor account. This repository is a clean
copy: full control over visibility, branch protection and CI, and the leaked
credentials never enter its history.

## History

The upstream history is kept (327 commits, so `git log` and `git blame` still
work), but it was **rewritten** with `git filter-repo` before the first push:

- 5 distinct Supabase service-role JWTs were replaced with a
  `REDACTED-SUPABASE-KEY` marker in every blob where they appeared
  (`.env` plus 8 files under `scripts/`),
- the path `.env` was removed from every commit,
- the upstream-only commit that contained nothing but `.env` was pruned
  (328 -> 327 commits).

Verified after the rewrite: `git grep -E "eyJ[A-Za-z0-9_.-]{40,}" $(git rev-list --all)`
returns **no match** on any revision.

## Syncing with upstream

Upstream still commits a live service-role key in `.env`, so **never merge
upstream wholesale** - a merge would carry `.env` (and the key) into this
repository's history. Cherry-pick the fixes you actually want:

```bash
git remote add upstream git@github.com:techbeinweb-sys/evaluation-sys-app.git
git fetch upstream
git log --oneline upstream/main..main     # what we have that upstream does not
git log --oneline main..upstream/main     # what upstream has that we do not
git cherry-pick <sha>                     # take one fix at a time
```

After a cherry-pick, check that no secret came along:

```bash
git show --stat <sha> | grep -E "^\s+\.env$"   # must print nothing
node scripts/guard-secrets.mjs                 # must exit 0
```

Do **not** merge upstream blindly: see `SECURITY-HARDENING.md` for the changes
that intentionally diverge from upstream.

## Pushing safely

`.githooks/pre-push` refuses to push if a service-role JWT or a tracked
`.env` appears. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## Deployment

```bash
npm ci
APP_BASE=/eval/ npm run build     # APP_BASE = the Apache sub-path
```

The build output in `dist/` is a static SPA. It is uploaded to the cPanel
document root; `public/.htaccess` provides the `BrowserRouter` fallback.

## Database

The backend is **PostgreSQL**, served through a PostgREST-compatible PHP API
(`pdo_pgsql`) hosted on the same cPanel account. The frontend talks to it with
the standard `@supabase/supabase-js` client, pointed at the API with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.

PostgreSQL was chosen over MySQL deliberately: **Odoo 14 requires PostgreSQL**,
the schema already uses `uuid` / `jsonb` / `timestamptz` / `text[]` /
`interval`, Row Level Security only exists in PostgreSQL, and PostgREST is
PostgreSQL-only. A MySQL port would have meant a full schema conversion plus
the loss of RLS.
