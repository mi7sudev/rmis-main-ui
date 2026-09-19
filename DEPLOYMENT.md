# RMIS — Deployment Guide

This guide covers the two deployment targets for RMIS:

1. **Localhost development** — your laptop, `bun run dev`
2. **Intranet production** — a self-hosted server on the internal network, `bun run start`

Both environments use the **same codebase** and the **same `.env` file format**. Only the `.env` *values* differ between them. There is no cloud PaaS dependency — the app runs on any server with Node.js/Bun and a persistent filesystem.

> 🤖 **AI agent adapting this project to a new machine (e.g. a Windows company PC)?**
> Read [`AGENTS.md`](AGENTS.md) **first** — it explains why **no source-code changes are
> needed**, which files to copy, Windows-specific setup paths (WSL2 / Git Bash / Bun),
> the `.env` gotchas (absolute `DATABASE_URL`, `NEXTAUTH_URL` matching), and the
> "DO NOT MODIFY" list (legacy column names, `prisma db push` ban, destructive scripts).
> Then come back here for the Linux server details (systemd, Caddy).

---

## 1. Required Environment Variables

All configuration lives in `.env` at the project root. A validated, centralized config module (`src/lib/env.ts`) reads these at startup and **fails fast** with a clear message if any required var is missing or malformed.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite connection string. Always `file:<path>`. Same format for both envs — only the path differs. |
| `NEXTAUTH_SECRET` | ✅ | Signs JWT session tokens (HS256). ≥16 chars. **Use a different value on localhost vs. the intranet server.** |
| `NEXTAUTH_URL` | ✅ | Canonical public URL (no trailing slash). `http://localhost:3000` locally; on the server the exact URL employees type — e.g. `http://10.10.120.X` (proxy on 80) or `http://10.10.120.X:3000` (direct). |
| `AI_API_KEY` | ✅ | NVIDIA API key for PDS auto-extract. Get one free at [build.nvidia.com](https://build.nvidia.com). Same key works on both envs. |
| `UPLOAD_DIR` | ⚠️ | Absolute path to the upload directory. Leave empty to use `<project-root>/upload`. Set on the intranet server if uploads should live on a separate persistent volume. |
| `AI_BASE_URL` | ⚠️ | OpenAI-compatible AI API base URL. Defaults to NVIDIA's endpoint. Override only for a different provider. |
| `AI_TEXT_MODEL` | ⚠️ | Chat/instruct model for structuring extracted text → JSON. Default: `nvidia/llama-3.3-nemotron-super-49b-v1`. |
| `AI_VISION_MODEL` | ⚠️ | Vision-language model for reading scanned document images. Default: `nvidia/nemotron-nano-12b-v2-vl`. |

Three required vars (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`) plus `AI_API_KEY` for the PDS auto-extract feature. The rest have sensible defaults.

---

## 2. Localhost Development

### 2a. Create `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=file:/absolute/path/to/db/production-data.db
NEXTAUTH_SECRET=<random 32+ char string>
NEXTAUTH_URL=http://localhost:3000
AI_API_KEY=nvapi-<your-nvidia-api-key>
# UPLOAD_DIR=  (leave empty for dev)
```

Get a free NVIDIA API key at [build.nvidia.com](https://build.nvidia.com) (sign in → "Get API Key"). This powers the PDS auto-extract feature.

Generate a strong dev secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2b. Database

The production Strapi data lives in `db/production-data.db` (~4 MB). **Never delete, reset, or `prisma db push` against it** — see [RUN_LOCALLY.md](RUN_LOCALLY.md) for the full local setup walkthrough.

### 2c. Run

```bash
bun install
bun run dev      # http://localhost:3000  (NODE_ENV=development, hot reload)
bun run lint     # code quality
```

---

## 3. Intranet Production Deployment

### 3.0 Quick path — bare-IP intranet (http://10.10.120.X)

The typical deployment here: employees open the app at the server's LAN IP with **no port and no domain**. Two supported URL shapes:

| Shape | NEXTAUTH_URL | How |
|---|---|---|
| `http://10.10.120.X` (recommended) | `http://10.10.120.X` | Caddy/nginx on port 80 → proxies to the app on 3000. A Caddy config ready to copy is in [`deploy/Caddyfile.intranet`](deploy/Caddyfile.intranet). |
| `http://10.10.120.X:3000` | `http://10.10.120.X:3000` | The app serves port 3000 directly on the LAN — no proxy. Simplest, but the port must stay in the URL. |

**`NEXTAUTH_URL` must exactly match the URL employees type** (scheme + IP + optional port, no trailing slash). If it doesn't, login sessions won't stick.

Session cookies are **transport-aware**: on plain HTTP the `Secure` flag is skipped automatically, so login works on a bare-IP intranet; if you later put TLS in front (proxy sending `x-forwarded-proto: https`) the flag turns on by itself. No code change needed.

Other bare-IP specifics:

- **Firewall**: open TCP 80 (proxy) or 3000 (direct) to the LAN, e.g. `sudo ufw allow 80/tcp` (or `firewall-cmd --add-port=80/tcp --permanent && firewall-cmd --reload` on RHEL-family).
- **Runtime**: run the production server with **Node.js 20+** (`npm run start`). Bun also works (`npm run start:bun`), but Node is the battle-tested runtime for the native SQLite module (`better-sqlite3`) this app reads with.
- **Internet**: the app itself is fully intranet-capable (fonts are self-hosted at build time). One feature calls out: **PDS auto-extract uses NVIDIA's cloud API** — on a server with no outbound internet it fails gracefully with a clear message and everything else keeps working. Allow outbound HTTPS to `integrate.api.nvidia.com` if you want auto-extract.
- **Go-live checklist**: ① `npm run create-admin` to create the real administrator, ② `--deactivate` the test logins (any `test*` account ships with weak passwords), ③ set a fresh `NEXTAUTH_SECRET`, ④ schedule the nightly DB backup (see §5), ⑤ `curl http://localhost:3000/api/health` returns `{"status":"healthy"}`.

### 3a. Server prerequisites

On the intranet server, install:

- **Node.js 20+** (recommended production runtime): `sudo apt install nodejs npm` or via [nodesource](https://github.com/nodesource/distributions). Verify with `node -v`.
- **Bun** (fast installs; optional but used by several helper scripts): `curl -fsSL https://bun.sh/install | bash`
- **Git** (to clone the repo) or a way to transfer the project files
- A persistent directory for the app + database + uploads (e.g. `/opt/rmis/`)

### 3b. Build the app (on the server, once)

```bash
cd /opt/rmis
bun install
bun run build
```

This produces a self-contained production bundle in `.next/standalone/` (Next.js standalone output mode is enabled in `next.config.ts`).

### 3c. Create the production `.env`

```bash
cp .env.example .env
nano .env
```

Fill in **production values** (different from your localhost `.env`):

```env
# Absolute path on the server — use an absolute path so it doesn't depend on CWD
DATABASE_URL=file:/opt/rmis/db/production-data.db

# Generate a FRESH strong secret for production (do NOT reuse your dev secret)
NEXTAUTH_SECRET=<fresh 64-char hex string>
# Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# The URL users will type in their browser on the intranet.
# Bare IP (recommended): must match exactly what users type — pick ONE:
NEXTAUTH_URL=http://10.10.120.X            # proxy on port 80
# NEXTAUTH_URL=http://10.10.120.X:3000     # direct, no proxy

# NVIDIA API key for PDS auto-extract (same key works on both envs — get one at
# https://build.nvidia.com)
AI_API_KEY=nvapi-<your-nvidia-api-key>

# Optional: put uploads on a dedicated persistent volume
UPLOAD_DIR=/var/data/rmis/uploads
```

### 3d. Place the production database

Copy `production-data.db` to the path you set in `DATABASE_URL`:

```bash
# From your local machine (or wherever the canonical DB lives):
scp db/production-data.db user@rmis-server:/opt/rmis/db/production-data.db
```

**Back up the existing database first** if the server already has one.

### 3e. Start the production server

```bash
NODE_ENV=production npm run start   # Node 20+ (recommended)
# or: npm run start:bun             # Bun alternative
```

This runs the standalone Next.js server on port 3000, bound to 0.0.0.0 (all interfaces), so other machines on the LAN can reach it. Verify:

```bash
curl http://localhost:3000/api/health
# → {"status":"healthy","checks":{"app":"ok","database":"ok"}}
```

### 3f. Run as a background service (recommended)

Use **systemd** (Linux) to keep the app running across reboots and crashes. Create `/etc/systemd/system/rmis.service`:

```ini
[Unit]
Description=RMIS — Recruitment Management Information System
After=network.target

[Service]
Type=simple
User=rmis
WorkingDirectory=/opt/rmis
EnvironmentFile=/opt/rmis/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
# Node runtime (recommended for the native better-sqlite3 module).
ExecStart=/usr/bin/node /opt/rmis/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rmis
sudo systemctl start rmis
sudo systemctl status rmis   # verify it's running
```

### 3g. Reverse proxy (recommended)

Put **Caddy** or **nginx** in front to serve the bare IP on port 80. The ready-to-copy Caddy config for this exact scenario is [`deploy/Caddyfile.intranet`](deploy/Caddyfile.intranet) (`:80` → `127.0.0.1:3000`, 12 MB upload limit, static-asset caching).

Equivalent nginx config (note `server_name _` — matches the bare IP):

```nginx
server {
    listen 80;
    server_name _;   # bare IP — match any Host

    # Optional: redirect to HTTPS if you have a cert
    # return 301 https://$host$request_uri;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Allow large file uploads (PDS, certificates — up to 10MB)
    client_max_body_size 12m;
}
```

If TLS is terminated by nginx, set `NEXTAUTH_URL=https://...` in `.env` — the session cookie's `Secure` flag then turns on automatically.

### 3h. Create the real accounts (go-live)

The repository's dev/test logins (`testadmin`, `testevaluator`, `testapplicant` — password `password123`) **must not survive go-live**:

```bash
# 1. Create the real administrator (prompts refuse weak passwords):
bun scripts/create-admin.ts --email juan.delacruz@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Juan Dela Cruz"

# 2. Optionally create evaluators (HR staff):
bun scripts/create-admin.ts --email maria.santos@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Maria Santos" --role evaluator

# 3. Deactivate the test logins:
bun scripts/create-admin.ts --deactivate testadmin
bun scripts/create-admin.ts --deactivate testevaluator
bun scripts/create-admin.ts --deactivate testapplicant

# 4. Rotate the session secret so any leaked dev session tokens die:
#    set a fresh NEXTAUTH_SECRET in .env, then: sudo systemctl restart rmis
```

Applicants self-register through the normal sign-up page — no script needed.

---

## 4. Keeping Localhost and Production in Sync

The `.env` file is the **only** thing that differs between environments. To stay compatible:

| Variable | Localhost | Intranet prod |
|---|---|---|
| `DATABASE_URL` | `file:/home/you/projects/rmis/db/production-data.db` | `file:/opt/rmis/db/production-data.db` |
| `NEXTAUTH_SECRET` | (random dev secret) | (**different** random prod secret) |
| `NEXTAUTH_URL` | `http://localhost:3000` | `http://rmis.intranet.gov.ph` |
| `AI_API_KEY` | `nvapi-...` (same key) | `nvapi-...` (same key) |
| `UPLOAD_DIR` | (empty — uses `<project>/upload`) | `/var/data/rmis/uploads` (persistent volume) |
| `AI_BASE_URL` | (default — NVIDIA) | (default — NVIDIA) |
| `AI_TEXT_MODEL` | (default) | (default) |
| `AI_VISION_MODEL` | (default) | (default) |

**Database sync:**
- The schema is identical (same Prisma schema, same SQLite file).
- To copy production data to localhost for testing: `scp server:/opt/rmis/db/production-data.db ./db/`
- **Never** copy localhost data to production — you'd overwrite real applicant records.

**Code sync:**
- Both environments run the same code (same `package.json`, same `next.config.ts`).
- After pulling new code on the server: `bun install && npm run build && sudo systemctl restart rmis`

---

## 5. Security Notes

- **Never commit `.env`.** It's gitignored. `.env.example` (no secrets) is the only env file that should be in version control.
- **Use different `NEXTAUTH_SECRET` values** for localhost vs. production. Dev secrets should never match the production value.
- **Rotate `NEXTAUTH_SECRET`** if it ever leaks. Rotation invalidates all active sessions — users must re-login, but no data is lost.
- **Back up `db/production-data.db` regularly.** It's a single file — `cron` a nightly copy to a backup location.
- **Back up the `UPLOAD_DIR`** on the intranet server (applicant documents live there).
- **CSP / security headers** are configured in `next.config.ts` and apply automatically in production.
- **Cookies** are `httpOnly`, `sameSite=lax`, and **transport-aware**: `secure` turns on only when the deployment is HTTPS-based (`NEXTAUTH_URL` starts with `https://`, or the proxy forwards `x-forwarded-proto: https`). On a plain-HTTP bare-IP intranet the flag is skipped so login works; the moment TLS sits in front, it activates on its own. See `secureCookieFor()` in `src/lib/jwt.ts`.

---

## 6. Troubleshooting

### "Missing required environment variables: DATABASE_URL, NEXTAUTH_SECRET, ..."

The centralized env validator (`src/lib/env.ts`) failed at startup. Check your `.env`:
1. File exists at the project root (same level as `package.json`).
2. All three required vars are set and non-empty.
3. No trailing spaces or quotes around values.

### "Refusing to connect to 'custom.db' in production"

Safety guard in `src/lib/env.ts`. `custom.db` is the old dev scratch DB. Set `DATABASE_URL` to `production-data.db`.

### "DATABASE_URL must be a SQLite file URL"

The validator requires `file:` prefix. Make sure your URL looks like `file:/path/to/db.sqlite` (not just `/path/to/db.sqlite`).

### "NEXTAUTH_SECRET must be at least 16 characters"

The secret is too short. Generate a new one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Login works locally but fails on the intranet server

Most likely `NEXTAUTH_SECRET` differs between the two environments (which is correct — but it means sessions don't transfer). Users just need to re-login on the server. If login itself fails, check:
- `NEXTAUTH_URL` matches the actual URL users visit **exactly** — scheme, IP/hostname AND port. `http://10.10.120.X` and `http://10.10.120.X:3000` are different canonical URLs; use whichever matches the address bar.
- `curl -i http://localhost:3000/api/auth/login` (POST) — if the `Set-Cookie` header contains `Secure` while the site is served over plain HTTP, you're on an old build; rebuild (`npm run build`) so the transport-aware cookie fix is included.

### Uploaded files disappear after app restart on the server

`UPLOAD_DIR` is either not set (so uploads go to `<project>/upload`, which might get cleared on redeploy) or points to a non-persistent location. Set `UPLOAD_DIR` to a dedicated persistent volume.

### Health check returns 503

```bash
curl http://localhost:3000/api/health
# → {"status":"unhealthy","checks":{"app":"ok","database":"fail"}}
```

The app is running but can't reach the database. Check:
1. `DATABASE_URL` points to a real file that exists on the server.
2. The file is readable by the user running the app (`rmis` in the systemd example).
3. The Prisma client is generated: `bun run db:generate`.

---

## 7. Quick Reference — File Map

| File | Role |
|---|---|
| [`.env`](.env) | Runtime env vars (gitignored). **The single source of truth.** |
| [`.env.example`](.env.example) | Template — safe to commit. |
| [`src/lib/env.ts`](src/lib/env.ts) | Centralized, validated env config (fail-fast on missing/malformed vars). |
| [`src/lib/ai-client.ts`](src/lib/ai-client.ts) | OpenAI-compatible AI client (drop-in for z-ai-web-dev-sdk). Calls NVIDIA API. |
| [`src/lib/extraction.ts`](src/lib/extraction.ts) | Document Intelligence — PDS/resume extraction (uses ai-client). |
| [`src/lib/db.ts`](src/lib/db.ts) | Prisma client (uses `env.DATABASE_URL`). |
| [`src/lib/jwt.ts`](src/lib/jwt.ts) | JWT signing (uses `env.NEXTAUTH_SECRET`). |
| [`src/lib/raw-json.ts`](src/lib/raw-json.ts) | SQLite `json` column reader (uses `sqliteFilePath()` from env). |
| [`next.config.ts`](next.config.ts) | Next.js config (CSP, standalone output, external packages). |
| [`prisma/schema.prisma`](prisma/schema.prisma) | DB schema — uses `env("DATABASE_URL")`. |
| [`package.json`](package.json) | Scripts: `dev`, `build`, `start`, `lint`, `db:generate`. |
| [`RUN_LOCALLY.md`](RUN_LOCALLY.md) | Detailed local setup walkthrough. |
