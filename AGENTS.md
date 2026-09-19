# AGENTS.md — AI Agent Guide: Running RMIS on a New Machine

> **You are an AI agent** (Cursor, Copilot, Claude Code, Codex, …) that has been asked to
> run or deploy this project on the company's intranet PC. Read this file **fully before
> touching anything**. It tells you what to configure, what to run, and — most
> importantly — what **not** to change.

---

## 0. The Golden Rule — READ THIS FIRST

**The code is already portable. It does NOT need to be "converted from Linux" or
"adapted to Windows." If you find yourself editing application source code to make it
run on a different machine, you are almost certainly making a mistake.**

Every environment-specific value (database path, public URL, upload folder, AI API
key) is resolved at runtime from the **`.env` file** by the validated config module
[`src/lib/env.ts`](src/lib/env.ts). Moving this app to a new computer is a
**configuration + install** task, not a code-modification task.

Things that *look* Linux-specific but are **not**:

| What you saw | Why it is fine |
|---|---|
| `${process.cwd()}/upload` in `src/lib/env.ts` | Node resolves this correctly on Windows too; forward slashes are accepted by `fs`/`path` on win32. |
| Forward slashes in paths everywhere | Normal cross-platform Node style. Do not "fix" to backslashes. |
| `better-sqlite3` native module | Ships prebuilt binaries for Node LTS on Windows (`win32-x64`). `npm install` handles it. |
| `.sh` scripts in `.zscripts/` | **Sandbox-only tooling — never used in production.** Ignore them. |
| Hardcoded `/home/z/my-project` in docs/`dev.sh` | That was the original development sandbox path. On your machine it becomes your own project folder path — set in `.env`, nowhere else. |
| `bun:sqlite` in `scripts/seed-fresh.ts`, `scripts/clean-to-fresh.ts` | One-off destructive reset scripts for the sandbox. **Do not run them. Do not port them.** |

---

## 1. What This Application Is

**RMIS v3.4** — Recruitment Management Information System for DOST-MIRDC.
Applicants submit a 7-part profile (Personal / Education / Work Experience / Training /
Eligibility / Awards / Documents), the system auto-parses their PDS spreadsheet,
auto-evaluates it against a vacancy's Minimum Qualification Requirements (MQR), HR
reviews and shortlists, and the system sends regret letters / interview invitations.

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling / UI | Tailwind CSS 4, shadcn/ui, lucide-react |
| Database | **SQLite** — single file, accessed via Prisma ORM (`@prisma/client` 6.11) |
| Auth | Custom JWT sessions (`jose`), bcryptjs password hashing, RBAC (ADMIN / EVALUATOR / APPLICANT) |
| AI (PDS auto-extract) | Any OpenAI-compatible API (default: NVIDIA `integrate.api.nvidia.com/v1`) via `src/lib/ai-client.ts` |
| Audit log | Dedicated SQLite file `db/audit.db` via `better-sqlite3` |
| Production output | Next.js **standalone** build (`output: "standalone"` in `next.config.ts`) |

No external database server. No cloud dependency except the optional NVIDIA AI call.

---

## 2. Where the Data Lives (the owner asked — here is the answer)

Everything is plain files inside the project folder:

```
<project-root>/
├── db/
│   ├── production-data.db        ← ⭐ THE database. All applicants, users, jobs, MQR…
│   │                               (~4.6 MB SQLite single file)
│   ├── audit.db                  ← audit log (own file, WAL mode → audit.db-wal/-shm appear)
│   └── *.backup-*.db             ← old safety copies (from dev); safe to ignore/delete
└── upload/
    └── <applicantId>/<file>      ← applicant documents (PDF/XLSX/photos) — NOT in the DB
```

**Backup = copy files. Restore = paste them back.** Nothing more:

```bash
# Full backup (works in Git Bash / WSL / Linux)
tar czf rmis-backup-$(date +%Y-%m-%d).tar.gz db/production-data.db upload/
```

```powershell
# Windows PowerShell equivalent
Compress-Archive -Path db\production-data.db, upload -DestinationPath rmis-backup-$(Get-Date -Format yyyy-MM-dd).zip
```

> ⚠️ Back up **both** `db/production-data.db` **and** `upload/`. The DB only stores
> document metadata; the actual files live in `upload/`. Back up while the app is
> stopped (or idle) to guarantee a consistent copy.

---

## 3. DO NOT MODIFY — Non-Negotiable List

You may create/modify **`.env`**, run **install/build commands**, and adjust
**firewall/service config on the OS**. Everything else below is off-limits:

1. **`prisma/schema.prisma`** — it is a *pure mapping* to an existing legacy database.
   Never "modernize" it. Never add `@relation`s. Never rename fields.
2. **NEVER run** `npm run db:push`, `npx prisma db push`, `prisma migrate`, or
   `bun run db:push` against `db/production-data.db`. The schema header says it
   explicitly: it would destroy real data. (The app only needs `prisma generate`.)
3. **Never delete or replace `db/production-data.db`.** It is the live company data.
4. **Do not "fix" the spelling of database columns.** `is_fillouted`,
   `information_fillouted`, and all `snake_case` names are the *real physical column
   names* of a legacy Strapi-era schema. They are intentional.
5. **Do not rewrite raw SQL.** API routes use `db.$queryRawUnsafe` with snake_case
   columns on purpose (Prisma can't read SQLite `json` columns — see
   `src/lib/raw-json.ts` for the workaround).
6. **Do not remove the `BigInt.prototype.toJSON` polyfill** in `src/lib/db.ts` —
   without it every API response containing a `bigint` column crashes.
7. **Do not replace `better-sqlite3`** usage in `src/lib/raw-json.ts` /
   `src/lib/audit-db.ts` with another driver. It works on Node 18/20/22 on Linux,
   Windows, and macOS.
8. **Do not run** `scripts/seed-fresh.ts` or `scripts/clean-to-fresh.ts` (destructive
   database resets) and **do not run** `.zscripts/dev.sh` (sandbox bootstrapper that
   would *overwrite your `.env`* with sandbox paths and run `db:push`).
9. **Do not convert API routes to Server Actions**, swap NextAuth for another auth
   library, or upgrade major dependency versions "while you're here".
10. **Do not touch `src/lib/ai-client.ts`** — the z.ai SDK was already replaced with a
    standard OpenAI-compatible client. It needs no credentials file; config comes
    from `.env` (`AI_API_KEY`, `AI_BASE_URL`).
11. **Do not commit `.env`** to any repository, and do not email it around.

If a change to source code seems *required* to make the app run, stop and re-read §0.
The one legitimate code-adjacent edit is `package.json` scripts if you are on native
Windows and refuse to use Git Bash — but the correct fix (Git Bash / WSL) is easier
than editing scripts. See §5.

---

## 4. The Only Things That Change Per Machine — `.env`

Copy `.env.example` → `.env` and fill in. This is the **single source of truth**.

```env
# ── REQUIRED ────────────────────────────────────────────────────────────────
# ABSOLUTE path, forward slashes, file: prefix.
#   Windows: file:C:/rmis/db/production-data.db
#   Linux:   file:/opt/rmis/db/production-data.db
DATABASE_URL=file:C:/rmis/db/production-data.db

# Fresh random 32+ chars — generate:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_SECRET=<paste-generated-hex>

# MUST match EXACTLY what employees type in the browser (scheme + IP + port).
#   Direct app on port 3000:        http://10.10.120.X:3000
#   Behind a proxy on port 80:      http://10.10.120.X
NEXTAUTH_URL=http://10.10.120.X:3000

# ── OPTIONAL (recommended) ──────────────────────────────────────────────────
# PDS auto-extract via NVIDIA (free key: https://build.nvidia.com).
# Without it the app runs fine; only auto-extract fails with a clear message.
AI_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxx

# Only if uploads should live outside the project folder:
# UPLOAD_DIR=D:/rmis-data/uploads

# Only if you use a different OpenAI-compatible provider:
# AI_BASE_URL=https://integrate.api.nvidia.com/v1
# AI_TEXT_MODEL=nvidia/llama-3.3-nemotron-super-49b-v1
# AI_VISION_MODEL=nvidia/nemotron-nano-12b-v2-vl
```

### ⚠️ Critical `.env` gotchas

- **`DATABASE_URL` must be an ABSOLUTE path.** Two independent consumers read it:
  Prisma (resolves relative paths against `prisma/schema.prisma`) and
  `better-sqlite3` in `src/lib/raw-json.ts` (resolves against the current working
  directory). A relative path works for one and silently breaks the other.
- **Use forward slashes even on Windows** (`file:C:/rmis/db/...`, never
  `file:C:\rmis\db\...`).
- **`NEXTAUTH_URL` mismatch = login loop.** `http://10.10.120.X:3000` and
  `http://10.10.120.X` are *different* canonical URLs. Match the browser address bar.
- On plain-HTTP intranet the session cookie's `Secure` flag is skipped automatically
  (`secureCookieFor()` in `src/lib/jwt.ts`). No code change needed for HTTP.

---

## 5. Setup Paths for a Windows Company PC (pick ONE)

The original dev environment is Linux, but you have three ways to run this on
Windows **with zero source-code changes**, ranked from most to least recommended.
*(Deploying on a Linux server instead? Skip to `DEPLOYMENT.md` §3 — it applies verbatim.)*

### Path A — WSL2 + Ubuntu (RECOMMENDED — identical to the dev environment)

Everything in `DEPLOYMENT.md` works verbatim inside WSL. No script, path, or
line-ending issues at all.

1. On the company PC (admin PowerShell): `wsl --install -d Ubuntu`, reboot.
2. Move the project into the **WSL filesystem** (NOT `/mnt/c/...` — 10× slower):
   e.g. `~/rmis`.
3. Inside WSL: install Node 20+ (nodesource or nvm) and run the steps in §6 below.
4. VS Code: install the **WSL** extension → "Connect to WSL" → open `~/rmis`.
   Everything (integrated terminal, ESLint, Prisma extension) then runs inside WSL.
5. LAN reachability from other PCs works out of the box (WSL2 NAT): the app listens
   on `0.0.0.0:3000` and Windows forwards the port. If it doesn't, add one
   `netsh interface portproxy` rule or run the app natively instead.

### Path B — Native Windows + Node 20+ + **Git Bash** (simple, no VM)

**Key trick: run every npm script from the Git Bash terminal** (installed with
Git for Windows). The npm scripts use `tee`, `cp -r`, and `NODE_ENV=…` prefixes —
all of which work in Git Bash and fail in `cmd.exe`/PowerShell. This is why other
agents thought the project "needed Linux".

1. Install **Node.js 20+ LTS** (nodejs.org) and **Git for Windows** (git-scm.com).
2. VS Code: `Ctrl+Shift+P` → *Terminal: Select Default Profile* → **Git Bash**.
3. Open the project folder in VS Code; all commands below go in the Git Bash terminal.
4. `better-sqlite3` installs a prebuilt binary automatically for Node LTS. If you
   ever see a `node-gyp` build error, install Visual Studio Build Tools
   (`npm i -g --production windows-build-tools` is obsolete — use the VS Installer,
   "Desktop development with C++" workload) and re-run `npm install`.
5. In Git Bash, `DATABASE_URL` uses the Windows path with forward slashes:
   `file:C:/rmis/db/production-data.db`.
6. Proceed with §6.

### Path C — Native Windows + Bun (fast installs; slight caveat)

Bun for Windows ships a bash-like shell, so `npm run dev` / `build` / `start` work
as written even from PowerShell:

1. Install Bun: `powershell -c "irm bun.sh/install.ps1 | iex"`.
2. `bun install`, then `bun run build`, `bun run start`.
3. **Caveat:** if you ever see a `NAPI` / native-module crash from
   `better-sqlite3` under Bun (seen on some Linux+Bun combos), don't debug it —
   just run the production server under Node instead:
   `node .next/standalone/server.js` (with `NODE_ENV=production` set via
   `cross-env` or plain PowerShell `$env:NODE_ENV="production"`).
   The app code is plain Node-compatible; only the *runner* changes.

---

## 6. Bring-Up Procedure (any Windows path; same on Linux)

```bash
# 0. Get the code onto the machine (see §7 for what to copy)
cd /c/rmis            # Git Bash spelling of C:\rmis  (or ~/rmis in WSL)

# 1. Install dependencies — MUST be a fresh install on this machine.
#    NEVER copy node_modules/ or .next/ from another computer (native binaries
#    are OS/CPU-specific).
npm install           # or: bun install

# 2. Generate the Prisma client (this is NOT db push — it only generates code)
npx prisma generate   # or: npm run db:generate

# 3. Create .env  (copy .env.example → .env, fill in per §4)

# 4. Verify the DB file is where DATABASE_URL points and is non-trivial in size
ls -la db/production-data.db    # expect ~4–5 MB

# 5. Production build (standalone output lands in .next/standalone/)
npm run build

# 6. Start (binds 0.0.0.0:3000 — reachable from the whole LAN)
npm run start
# equivalent: NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js

# 7. Health check
curl http://localhost:3000/api/health
# → {"status":"healthy","checks":{"app":"ok","database":"ok"}}
```

Dev mode instead (hot reload, only for maintenance sessions):
`npm run dev` → http://localhost:3000

> Note: `npm run build`/`start` need Git Bash (Path B) because of `cp -r` / `tee` /
> env-prefix syntax. That is a *shell* requirement, not a code change.

---

## 7. Transferring the Project from the z.ai Workspace

Zip/copy the project folder **excluding** these (they are machine-specific and will
be regenerated):

```
node_modules/        ❌ rebuilt by npm install on the target
.next/               ❌ rebuilt by npm run build
dev.log, server.log  ❌ logs
```

**Must include** (this is the whole product):

```
src/                 application code
prisma/              schema.prisma (pure mapping — needed by prisma generate)
db/production-data.db  ⭐ THE database (copy while app is stopped)
db/audit.db            audit log (optional but recommended)
upload/              ⭐ applicant documents
public/              static assets
scripts/             create-admin.ts and other staff tools
deploy/              Caddyfile.intranet (only if you put a reverse proxy on :80)
package.json, package-lock.json (or bun.lock), next.config.ts, tsconfig.json,
postcss.config.mjs, components.json, .env.example, eslint.config.mjs,
DEPLOYMENT.md, RUN_LOCALLY.md, AGENTS.md, docs/
```

Transfer via USB drive / secure network share / `git bundle`. If you use `git`
and see CRLF warnings, run once: `git config --global core.autocrlf input`.
(Keep `.sh` files' LF endings — another reason to prefer zip/USB over git.)

**No internet on the intranet PC?** `npm install` needs registry access. Options:
temporarily connect for the install, use the company npm mirror
(`npm config set registry https://<company-mirror>/`), or `npm install` on an
internet machine and copy the resulting `node_modules` **only between identical
OS+CPU+Node-version machines** (fragile — prefer a mirror).

---

## 8. Make It Reachable on the Intranet (Windows specifics)

1. **Firewall** (admin PowerShell) — allow the port you chose:
   ```powershell
   netsh advfirewall firewall add rule name="RMIS 3000" dir=in action=allow protocol=TCP localport=3000
   ```
2. **Find the PC's static LAN IP** (`ipconfig`) — ideally ask IT to reserve it via
   DHCP, so `NEXTAUTH_URL` never has to change.
3. **Auto-start on boot** — pick one:
   - **NSSM** (simplest): `nssm install RMIS "C:\Program Files\nodejs\node.exe" "C:\rmis\.next\standalone\server.js"`
     then `nssm set RMIS AppDirectory C:\rmis` and add env vars
     (`nssm set RMIS AppEnvironmentExtra NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000`).
     NSSM can also load `.env` via `AppEnvironmentExtra` entries.
   - **Task Scheduler**: "At startup" → `node.exe` with the same args/working dir.
   - **pm2**: `npm i -g pm2` → `pm2 start .next/standalone/server.js --name rmis`
     → `pm2 save` + `pm2-startup install`.
4. **Antivirus**: if build/start feels pathologically slow, ask IT to exclude the
   project folder from real-time scanning (node_modules churn is heavy).
5. Employees browse to `http://<PC-IP>:3000` — which must equal `NEXTAUTH_URL`.
   (For bare `http://10.10.120.X` with no port, put Caddy/nginx on port 80 —
   ready-made config in `deploy/Caddyfile.intranet`; on Windows, Caddy runs fine
   as a service.)

---

## 9. Verification Checklist (run ALL of these before declaring success)

- [ ] `curl http://localhost:3000/api/health` → `{"status":"healthy",...}`
- [ ] From **another machine on the LAN**: open `http://<PC-IP>:3000` — login page renders, no console errors.
- [ ] Login as administrator (see below) → Command Center loads with real counts.
- [ ] Jobs list shows the real vacancies from the DB (proves SQLite path is right).
- [ ] Register a test applicant → fill the 7-part profile (or upload a PDS with
      auto-extract if `AI_API_KEY` is set) → submit an application.
- [ ] As HR: open Review → MQR evaluation renders → shortlist → notification appears for the applicant.
- [ ] Confirm a new file appeared under `upload/<applicantId>/` and it opens via the app (proves upload path + file serving).
- [ ] `db/audit.db` grew (audit events are being written) — check file mtime.
- [ ] Restart the app → everything still there (data persisted, sessions invalid → users re-login: normal).

**Accounts:** dev/test logins `testadmin` / `testevaluator` / `testapplicant`
(password `password123`, login field accepts username **or** email). Create real
staff accounts and deactivate test ones at go-live:

```bash
npm run create-admin -- --email juan.delacruz@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Juan Dela Cruz"
npm run create-admin -- --role evaluator --email maria.santos@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Maria Santos"
npm run create-admin -- --deactivate testadmin
npm run create-admin -- --deactivate testevaluator
npm run create-admin -- --deactivate testapplicant
```

*(If `npm run create-admin` has issues on Windows, run it under Bun, or with
`npx tsx scripts/create-admin.ts …` — same tool.)*

---

## 10. Troubleshooting — Agent FAQ

| Symptom | Root cause & fix |
|---|---|
| `[env] Missing required environment variables: …` | `.env` missing/empty. Copy `.env.example` → `.env`, fill the three required vars. The app refuses to start without them **by design** — do not add fallbacks to the code. |
| `[env] Refusing to connect to 'custom.db' in production` | `DATABASE_URL` points at the old dev scratch DB. Point it at `production-data.db`. |
| Health check says `"database":"fail"` | Path in `DATABASE_URL` doesn't exist on this machine, or relative path gotcha (§4). Also run `npx prisma generate` if the error mentions the Prisma client. |
| Login page loops / sessions don't stick | `NEXTAUTH_URL` ≠ the URL in the address bar. Match scheme+IP+port exactly. |
| `NODE_ENV=production npm run start` errors in PowerShell/cmd | Shell syntax, not the app. Use Git Bash, or `$env:NODE_ENV="production"; node .next/standalone/server.js`. |
| `better-sqlite3` fails to load / NAPI crash | Under Node: reinstall (`npm rebuild better-sqlite3`); if gyp errors → VS Build Tools. Under Bun on Windows: just switch the *runtime* to Node (`node .next/standalone/server.js`). Do not rewrite the module's usage. |
| PDS upload: "extract" fails | `AI_API_KEY` missing or no outbound HTTPS to `integrate.api.nvidia.com`. Everything else keeps working. Point `AI_BASE_URL` at an internal OpenAI-compatible API if you have one. |
| Uploaded file 404s in browser | File exists in `upload/` but DB row's `filePath` is stale (copied DB without `upload/`, or `UPLOAD_DIR` changed after upload). Keep `upload/` and `UPLOAD_DIR` stable. |
| `SQLITE_BUSY` / database locked | Another process holds the DB (a second app instance, or someone opened the file in a SQLite editor). One app instance per DB file. |
| `npm run build` fails with `cp: cannot stat` | You're in cmd/PowerShell (no `cp`). Use Git Bash. |
| Weird TypeScript errors after install | Run `npx prisma generate`; restart the TS server in VS Code (`Ctrl+Shift+P` → "Restart TS Server"). |
| Page loads but every API 500s with BigInt error | Someone removed the `BigInt.toJSON` polyfill from `src/lib/db.ts`. Restore it. |

---

## 11. File Map (agent orientation, 60-second version)

| Path | Role |
|---|---|
| `.env` / `.env.example` | **All** machine-specific config. The only file you create/edit. |
| `src/lib/env.ts` | Validated config singleton — fail-fast at boot. Read it to see every var. |
| `src/lib/db.ts` | Prisma client + BigInt polyfill. |
| `src/lib/raw-json.ts` | `better-sqlite3` read-only helper for SQLite `json` columns. |
| `src/lib/audit-db.ts` | Dedicated `db/audit.db` writer (auto-creates its table). |
| `src/lib/ai-client.ts` | OpenAI-compatible client (NVIDIA default) for PDS auto-extract. |
| `src/lib/jwt.ts` | JWT + transport-aware session cookie (`secureCookieFor`). |
| `prisma/schema.prisma` | Pure mapping to the legacy DB — read the header warning before touching. |
| `next.config.ts` | Standalone output, CSP/security headers, external packages. |
| `DEPLOYMENT.md` | Full Linux/production deployment guide (systemd, Caddy, go-live). |
| `RUN_LOCALLY.md` | Local dev walkthrough. |
| `scripts/create-admin.ts` | Staff account tool (create/reset/deactivate). |
| `db/production-data.db` | ⭐ The entire production database. |

---

*When you finish the setup, record in the project worklog what you changed
(`.env` values, firewall rules, service installation) — future agents will need it.*
