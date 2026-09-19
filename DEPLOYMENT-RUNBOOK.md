# RMIS v3.4 — Production Deployment Runbook (As-Executed)

> **Purpose:** Complete, step-by-step reproduction guide for deploying the RMIS (Recruitment Management Information System, DOST-MIRDC) to the office intranet server, including **every error encountered, its root cause, and the exact fix applied**.
>
> **Audience:** An AI agent or IT operator performing the deployment with no prior context. Follow phases **in order**. Do not skip verification steps.
>
> **Status at time of writing:** App is LIVE at `http://10.10.120.102:3000` (verified from a workstation browser). systemd service installation is the remaining step to make it permanent (see Phase 9 + Section 12 "Current Status").

---

## 1. System Overview

| Item | Value |
|---|---|
| Application | RMIS v3.4 — DOST-MIRDC Recruitment Management System |
| Framework | Next.js **16.1.3** (App Router, Turbopack, **standalone** output) |
| Language | TypeScript 5, React 19 |
| ORM / Database | Prisma **6.11.1** + SQLite (`db/production-data.db`) |
| Secondary DB | SQLite audit trail (`db/audit.db`, better-sqlite3, self-creating, WAL mode) |
| Auth | NextAuth.js v4 (credentials provider) |
| Package manager on server | npm (with Node 22) |
| App port | **3000** (HTTP) |
| SSH port | **22** (for VS Code Remote-SSH — distinct from app port) |
| Production URL | `http://10.10.120.102:3000` |

**Key architectural facts the agent MUST know:**

1. The build produces a **standalone** server (`next build` + copy steps, see `package.json` `build` script). We run `node .next/standalone/server.js` — NOT `next start`.
2. `DATABASE_URL` must be an **ABSOLUTE** `file:` path. Relative paths break in standalone mode (Prisma resolves them against the generated client's location inside `.next/standalone/node_modules/...`).
3. The audit DB path is `join(process.cwd(), "db", "audit.db")` (`src/lib/audit-db.ts`) and the upload dir defaults to `process.cwd()/upload` (`src/lib/env.ts`). Therefore the process **working directory MUST be the project root**.
4. The standalone server must be given env vars explicitly (systemd `EnvironmentFile=`, or `set -a && source .env && set +a` for manual runs). Do not assume it loads the project `.env` by itself.
5. `NEXTAUTH_URL` must **exactly match** the URL typed in browsers (`http://10.10.120.102:3000`, no trailing slash) or logins fail (host/CSRF validation).
6. `better-sqlite3@13` and `unpdf@1.8.0` require **Node ≥ 22**. Node 20 is NOT sufficient.
7. The office network **blocks GitHub release downloads** — `better-sqlite3` cannot fetch its prebuilt binary and falls back to compiling from source, which requires `build-essential` (make/gcc/g++).

---

## 2. Target Environment (as-deployed)

| Item | Value |
|---|---|
| Server IP | `10.10.120.102` |
| OS | Ubuntu Linux (apt-based) |
| SSH login | `rmis-mirdc@10.10.120.102` (password auth) |
| Linux user | `rmis-mirdc` (has sudo) |
| Project path | `/home/rmis-mirdc/Desktop/RMISv3.4` |
| Node version installed | v22.23.2 (via NodeSource setup_22.x) |
| Deployment method | VS Code **Remote-SSH**: open the server folder in VS Code, copy files from the dev machine into the remote workspace |

---

## 3. Prerequisites (on the operator's workstation)

1. VS Code with the **Remote-SSH** extension installed.
2. SSH reachability: `ssh rmis-mirdc@10.10.120.102` (port 22) must succeed.
3. The complete RMIS project source (sandbox copy, including `src/ prisma/ public/ scripts/ db/ upload/ package.json package-lock.json next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs components.json eslint.config.mjs .env.example`).

> ⚠️ **GOTCHA #0 (bit us):** copying the FULL project also ships the **dev machine's `.env`** (with dev paths), the **`.next/` dev build artifacts** (stale Turbopack cache), and dev leftover DBs. This caused two separate failures later (Phase 6 and Phase 8). Copying everything is acceptable, **but** Phases 5 and 6 below contain mandatory counter-steps. **After ANY future re-extraction/re-copy of the project onto the server, re-verify `.env` and delete `.next` before starting.**

---

## 4. Phase 1 — Upload the project

Via VS Code Remote-SSH:

1. Install "Remote-SSH" extension → `Ctrl+Shift+P` → "Remote-SSH: Connect to Host…" → `rmis-mirdc@10.10.120.102` (SSH port 22).
2. Open folder `/home/rmis-mirdc/Desktop/RMISv3.4` on the remote (create it if needed).
3. Drag-and-drop / copy the project files from the local machine into the remote workspace.
4. Verify from the integrated terminal (which now runs ON the server):

```bash
cd ~/Desktop/RMISv3.4
ls
# Expect: src  prisma  public  scripts  db  upload  package.json  next.config.ts  ...
```

> Note: `node_modules` is NOT copied — it is installed fresh on the server (Phase 3). Full-project copies also bring `.env`/`.next`/`.git` — handled in later phases.

---

## 5. Phase 2 — Install Node.js 22 (REQUIRED, not optional)

**Why:** `better-sqlite3@13.0.3` and `unpdf@1.8.0` declare `engines: node >= 22`. On Node 20, `npm install` fails with `EBADENGINE`, then attempts a source build and dies. (We initially tried Node 20 — that was a mistake; use 22.)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # Expected: v22.x  (we got v22.23.2)
npm -v
which node     # Expected: /usr/bin/node  (needed for the systemd unit in Phase 9)
```

---

## 6. Phase 3 — Toolchain + `npm install`

**Why `build-essential`:** the office network blocks the GitHub release download of better-sqlite3's prebuilt binary, so npm falls back to compiling it with node-gyp, which needs `make`/gcc. Without it, install fails with `gyp ERR! Error: not found: make`.

```bash
sudo apt install -y build-essential
cd ~/Desktop/RMISv3.4
npm install
```

**Expected output:** `added 914 packages, and audited 915 packages in ...`

**Known, non-blocking warnings:**
- `npm warn deprecated @types/bcryptjs@3.0.0` — harmless stub package.
- `26 vulnerabilities (2 low, 10 moderate, 13 high, 1 critical)` — **do NOT run `npm audit fix --force`**; it applies breaking major-version bumps that will break the build. Vulnerabilities are in transitive dev-time tooling; address deliberately later, never with `--force` during a deployment.

---

## 7. Phase 4 — Generate the Prisma client

```bash
cd ~/Desktop/RMISv3.4
npx prisma generate
```

**Expected:** `✔ Generated Prisma Client (v6.11.1) to ./node_modules/@prisma/client`

---

## 8. Phase 5 — Write the production `.env`  ⚠️ CRITICAL PHASE

The project ships with a **dev** `.env` pointing at dev-machine paths. It MUST be replaced on the server. This exact issue caused the runtime database failure in Phase 8 — do not skip or half-do this phase.

**Generate and write the file (paste as one block):**

```bash
cd ~/Desktop/RMISv3.4
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
cat > .env << EOF
DATABASE_URL=file:/home/rmis-mirdc/Desktop/RMISv3.4/db/production-data.db
NEXTAUTH_URL=http://10.10.120.102:3000
NEXTAUTH_SECRET=$SECRET
EOF
cat .env
```

**Variable contract:**

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `file:/home/rmis-mirdc/Desktop/RMISv3.4/db/production-data.db` | **Absolute** path mandatory (see §1 fact 2). Must point at the real production DB. |
| `NEXTAUTH_URL` | `http://10.10.120.102:3000` | Must equal exactly what users type in the browser. Wrong value ⇒ login fails with host/CSRF errors. |
| `NEXTAUTH_SECRET` | fresh 64-hex string | Session signing. Generate once per environment; keep stable afterwards (changing it invalidates all sessions). |
| `AI_API_KEY` | *(optional)* `nvapi-…` | Only needed for Document Intelligence (PDS auto-extract). Append later with `echo "AI_API_KEY=nvapi-..." >> .env` and restart. Without it the app logs `[env] AI_API_KEY is not set…` and everything else works. |

**Verify the shipped dev `.env` was really replaced:**

```bash
grep -n "DATABASE_URL\|NEXTAUTH_URL" .env
# MUST show the /home/rmis-mirdc path and http://10.10.120.102:3000 — NOT /home/z/... or localhost
```

> 🔁 **REMEMBER:** every time the project is re-copied/re-extracted onto the server, the dev `.env` comes with it and clobbers this file. Re-run this phase after any re-copy.

---

## 9. Phase 6 — Production build

```bash
cd ~/Desktop/RMISv3.4
rm -rf .next        # MANDATORY if the folder came from a dev machine (stale Turbopack cache)
npm run build
```

**What the build script does** (`package.json`): `next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/` — i.e. compile, then assemble the standalone bundle with static assets and `public/`.

**Expected success output (key lines):**

```
▲ Next.js 16.1.3 (Turbopack)
- Environments: .env
  Creating an optimized production build ...
✓ Compiled successfully in ~18s
✓ Finished TypeScript in ~21s
✓ Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (34/34)
✓ Finalizing page optimization
Route (app) ┌ ○ /  ├ ○ /_not-found  ├ ƒ /api  … (48 routes listed)
```

**Non-fatal messages you may see during "Collecting page data" (both are expected, ignore):**
- `[env] AI_API_KEY is not set. Document Intelligence (PDS auto-extract) will not work.` — the optional feature flag.
- `[AUDIT-DB] historical migration failed: … Error code 14: Unable to open the database file` — build workers run in a context where `db/audit.db` isn't openable yet; the audit DB **self-creates at runtime** (Phase 8). This does not affect the build or runtime.

**If the build fails, see Section 10 (error table) — every build failure we hit is catalogued there.**

---

## 10. Error → Root Cause → Fix Reference (everything we actually hit)

### 10.1 `npm install` — `EBADENGINE` / `gyp ERR! not found: make`
- **Symptom:** install dies on `better-sqlite3@13.0.3`, engine check fails; node-gyp fallback fails with `Error: not found: make`.
- **Root cause:** Node 20 too old for better-sqlite3@13; and office network blocks the prebuilt binary download so it must compile from source; no compiler installed.
- **Fix:** install Node 22 (Phase 2) + `sudo apt install -y build-essential` → re-run `npm install`.

### 10.2 `npm run build` — `sh: 1: next: not found`
- **Symptom:** `> next build` immediately fails, `next: not found`.
- **Root cause:** `node_modules` was wiped/absent — a full re-extraction of the project replaced the folder contents without `node_modules` (it's never part of a source copy).
- **Fix:** `npm install && npx prisma generate && npm run build` (chained).

### 10.3 `npm run build` — `Export assessmentSchema doesn't exist in … src/lib/validation.ts`
- **Symptom:** `Turbopack build failed: ./src/app/api/evaluator/assessments/[applicationId]/route.ts:7:1 — Export assessmentSchema doesn't exist in target module … Did you mean to import userUpdateSchema?`
- **Diagnosis:** the source was actually correct (`assessmentSchema` exported at `src/lib/validation.ts` line 243; file is 276 lines). Verification used on the server:
  ```bash
  grep -n "export const assessmentSchema" src/lib/validation.ts && wc -l src/lib/validation.ts
  # Expected: 243:export const assessmentSchema = z.object({   /   276 src/lib/validation.ts
  ```
- **Root cause:** stale `.next` Turbopack cache copied from the dev machine, referencing an old module graph (the hint "Did you mean to import userUpdateSchema?" = an old snapshot of the file where `userUpdateSchema` was the last export).
- **Fix:** `rm -rf .next && npm run build`.
- **Lesson:** dev-mode compiles routes lazily, so dev can run clean while `next build` (which resolves every export statically) exposes real code issues. If a build reports a missing export, first verify the source file (`grep`), and always suspect a copied `.next` cache.

### 10.4 Runtime — `PrismaClientInitializationError: Error code 14: Unable to open the database file`
- **Symptom:** server boots fine (`✓ Ready in 111ms`) but EVERY DB query fails (`prisma.notification.findMany()`, `prisma.jobPosting.findMany()`, … all with error code 14).
- **Key diagnostic:** error 14 = SQLite got a URL but couldn't open the file (≠ "DATABASE_URL missing", which produces a different error).
- **Root cause:** the full project re-extraction had **overwritten the corrected `.env` with the dev machine's copy** (`DATABASE_URL=file:/home/z/my-project/db/production-data.db` — a path that doesn't exist on the server).
- **Fix:** re-run Phase 5 (rewrite `.env` with absolute server path), stop server (`Ctrl+C`), re-export env, restart:
  ```bash
  set -a && source .env && set +a
  PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production node .next/standalone/server.js
  ```
- **Lesson (logged as a standing rule):** after ANY project re-copy to the server, re-verify `.env` BEFORE starting.

### 10.5 Pre-existing code bug fixed during deployment (context for agents)
The route `src/app/api/evaluator/assessments/[applicationId]/route.ts` imports `assessmentSchema` from `@/lib/validation`. During the deployment-prep code review, the full project was type-checked (`bunx tsc --noEmit` → 0 errors after fixes) and 48 latent type errors were repaired (missing `assessmentSchema` export among them). If rebuilding from an older source snapshot, ensure the source includes those fixes (the export must exist at `src/lib/validation.ts` line ~243).

---

## 11. Phase 7 — Pre-boot data verification

```bash
ls -la ~/Desktop/RMISv3.4/db/ && ls -ld ~/Desktop/RMISv3.4/upload
```

**Requirements:**
- `production-data.db` present (~4.7 MB), owned by `rmis-mirdc`, writable.
- `audit.db` — may be absent (self-creates at runtime). If present with `-shm`/`-wal` siblings, that's fine (SQLite WAL; recovered automatically on open).
- `upload/` directory exists and is writable (applicant documents get written to `upload/<applicantId>/`).
- Everything owned by `rmis-mirdc` — if anything is `root`-owned: `sudo chown -R rmis-mirdc:rmis-mirdc ~/Desktop/RMISv3.4/db ~/Desktop/RMISv3.4/upload`.

Dev-leftover files (`production-data.backup-*.db`, `custom.db`) are harmless; delete after go-live if desired (§13 cleanup).

---

## 12. Phase 8 — Manual boot test (prove it works BEFORE making it a service)

```bash
cd ~/Desktop/RMISv3.4
set -a && source .env && set +a
PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production node .next/standalone/server.js
```

**Expected terminal output:**
```
▲ Next.js 16.1.3
- Local:         http://localhost:3000
- Network:       http://0.0.0.0:3000
✓ Starting...
✓ Ready in ~100ms
```
…and then **silence** (occasional `[env] AI_API_KEY is not set` line is fine; NO `prisma:error` lines).

**Browser verification (from any intranet workstation):**

| Check | URL | Expected |
|---|---|---|
| Homepage | `http://10.10.120.102:3000` | Homepage renders with live job postings |
| Health endpoint | `http://10.10.120.102:3000/api/health` | `{"status":"healthy","checks":{"app":"ok","database":"ok"}}` |

The health check proves the main DB opens. The homepage proving job postings render proves Prisma queries work end-to-end.

> **Result achieved in our deployment:** both checks passed; app declared LIVE.

If terminal says `Ready` but the browser can't connect → firewall (see Phase 10). If pages render but data is missing → re-check `.env` (Phase 5) and restart.

---

## 13. Phase 9 — Make it permanent: systemd service  ⏳ (PENDING in current deployment)

**⚠️ Current live state:** the app runs as a **foreground process in a terminal**. If that terminal closes or the server reboots, the app dies. Complete this phase to make the deployment permanent.

Create the unit file:

```bash
sudo tee /etc/systemd/system/rmis.service > /dev/null << 'EOF'
[Unit]
Description=RMIS - Recruitment Management Information System
After=network.target

[Service]
Type=simple
User=rmis-mirdc
WorkingDirectory=/home/rmis-mirdc/Desktop/RMISv3.4
EnvironmentFile=/home/rmis-mirdc/Desktop/RMISv3.4/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/node /home/rmis-mirdc/Desktop/RMISv3.4/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

**Unit-file notes (do not "simplify"):**
- `WorkingDirectory` MUST be the project root — the audit DB (`cwd/db/audit.db`) and uploads (`cwd/upload`) resolve from it (§1 fact 3).
- `EnvironmentFile` provides `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — the standalone server does not reliably load `.env` by itself.
- `ExecStart` uses the absolute node path found via `which node` (Phase 2) — `/usr/bin/node` with NodeSource.
- `Restart=on-failure` + `RestartSec=5` auto-recovers from crashes.

Start and enable:

```bash
# First stop the manual test instance if still running (Ctrl+C in that terminal,
# or: pkill -f '.next/standalone/server.js')
sudo systemctl daemon-reload
sudo systemctl enable --now rmis
sudo systemctl status rmis          # Expect: active (running)
curl -s http://localhost:3000/api/health   # on the server: expect {"status":"healthy",...}
```

**Service management cheatsheet:**

```bash
sudo systemctl start rmis | stop rmis | restart rmis | status rmis
journalctl -u rmis -f          # live logs (this is where console.log output goes)
journalctl -u rmis -n 100      # last 100 lines
```

---

## 14. Phase 10 — Firewall

In our deployment the workstation could reach port 3000 immediately (firewall not blocking). If a different server blocks it:

```bash
sudo ufw status
sudo ufw allow 3000/tcp        # only if ufw is active and 3000 not already allowed
```

SSH (22) must stay reachable for Remote-SSH management.

---

## 15. Go-Live Checklist (operational tasks — PENDING)

1. **Create the real administrator account** (replaces test login):
   ```bash
   cd ~/Desktop/RMISv3.4
   npx tsx scripts/create-admin.ts --email hr.admin@mirdc.gov.ph --password 'STRONG_PASSWORD' --name "HR Administrator"
   ```
   (Check `scripts/create-admin.ts` header for exact flags if this changes.)
2. **Deactivate test accounts** — log in as admin → user management → deactivate `testadmin`, `testevaluator`, `testapplicant`. (Test account passwords are NOT the documented defaults; do not leave them active.)
3. **Nightly database backup cron**:
   ```bash
   mkdir -p /home/rmis-mirdc/backups
   crontab -e
   # add (note escaped % — required in crontab):
   30 2 * * * cp /home/rmis-mirdc/Desktop/RMISv3.4/db/production-data.db /home/rmis-mirdc/backups/production-data-$(date +\%Y\%m\%d).db
   ```
   Safer alternative if `sqlite3` CLI is installed: `sqlite3 /home/rmis-mirdc/Desktop/RMISv3.4/db/production-data.db ".backup '/home/rmis-mirdc/backups/…'"` (consistent snapshot while running).
4. **Optional:** append `AI_API_KEY=nvapi-…` to `.env`, then `sudo systemctl restart rmis` — enables PDS auto-extract.
5. **Optional cleanup:** delete dev leftovers in `db/` (`production-data.backup-*.db`, `custom.db`) once live and first backup exists.
6. **Smoke-test the golden path:** applicant register → apply to a job → upload PDS → evaluator queue shows the application → assessment submit → status changes. (Also resets `testadmin` password if you keep it.)

---

## 16. Update / Redeploy Procedure (future versions)

When a new version is ready on the dev machine:

```bash
# ON SERVER — from ~/Desktop/RMISv3.4, after copying new files over via VS Code:
# 1. RE-CHECK .env (re-copying may have clobbered it — GOTCHA #0):
grep -n "DATABASE_URL\|NEXTAUTH_URL" .env
# 2. If package.json / package-lock.json changed:
npm install && npx prisma generate
# 3. Always rebuild clean:
rm -rf .next && npm run build
# 4. Restart:
sudo systemctl restart rmis
# 5. Verify:
curl -s http://localhost:3000/api/health && journalctl -u rmis -n 20
```

Type-check on the dev machine before shipping: `bunx tsc --noEmit` and `bun run lint` must both pass (dev mode does not type-check; `next build` does).

---

## 17. Backup & Restore

**Backup** (see §15 item 3 for cron): copy `db/production-data.db` (+ optionally `db/audit.db`) to `/home/rmis-mirdc/backups/` with a dated filename. Uploaded applicant files live in `upload/` — back that directory up periodically too if documents matter.

**Restore:**
```bash
sudo systemctl stop rmis
cp /home/rmis-mirdc/backups/production-data-YYYYMMDD.db /home/rmis-mirdc/Desktop/RMISv3.4/db/production-data.db
sudo systemctl start rmis
curl -s http://localhost:3000/api/health
```

---

## 18. Troubleshooting Quick Reference

| Symptom | Likely cause | Action |
|---|---|---|
| `Error code 14: Unable to open the database file` (runtime) | `.env` has dev/relative DB path (re-copy gotcha) | Re-do Phase 5; restart service |
| `sh: 1: next: not found` | `node_modules` missing | `npm install && npx prisma generate` |
| `EBADENGINE` on install | Node < 22 | Phase 2 |
| `gyp ERR! not found: make` | compiler toolchain missing | `sudo apt install -y build-essential` |
| Build: missing export in a module | stale `.next` cache or genuinely older source | verify file with `grep`, then `rm -rf .next && npm run build` |
| Login fails with host/CSRF error | `NEXTAUTH_URL` ≠ browser URL | fix `.env`, restart |
| Browser can't connect at all | app not running / firewall | `systemctl status rmis`; `sudo ufw status` |
| `EADDRINUSE :3000` | old instance still running | `pkill -f '.next/standalone/server.js'` then start service |
| `prisma:error` in `journalctl` | DB path/permissions | `ls -la db/`; verify `DATABASE_URL` absolute path; check ownership |
| `[AUDIT-DB] … error 14` during BUILD only | build-worker cwd (known) | harmless; verify runtime health endpoint instead |

---

## 19. Current Deployment Status Snapshot

| Item | Status |
|---|---|
| Project uploaded to server | ✅ Done |
| Node 22 + build-essential | ✅ Done |
| npm install (914 pkgs) | ✅ Done |
| Prisma client generated | ✅ Done |
| Production `.env` written | ✅ Done (re-verify after any re-copy!) |
| Production build (34 pages, 48 routes) | ✅ Done |
| Manual boot test + browser verification | ✅ DONE — **LIVE at http://10.10.120.102:3000** |
| systemd service (`rmis.service`) | ⏳ **PENDING — next required step** (app currently foreground) |
| Firewall rule | ✅ Not needed (port reachable); document if ufw enabled later |
| Real admin account / test-account deactivation | ⏳ Pending |
| Nightly backup cron | ⏳ Pending |
| `AI_API_KEY` (PDS auto-extract) | ⏳ Optional, pending |
| Dev-leftover cleanup in `db/` | ⏳ Optional |

---

## 20. The Five Standing Warnings (memorize these)

1. **`.env` gets clobbered by every project re-copy** — always re-verify after re-extraction (this caused the live outage of Phase 8).
2. **`rm -rf .next` before every server build** — a dev machine's cache produces phantom "missing export" build errors.
3. **`DATABASE_URL` must be absolute** — relative `file:` paths break in standalone mode.
4. **Working directory must be the project root** — audit DB + uploads resolve from `process.cwd()`.
5. **Never `npm audit fix --force`** on this project — it breaks pinned dependencies (better-sqlite3, next).

---

*Document generated from the actual deployment session of 10.10.120.102. All commands, outputs, and error messages are verbatim from the real run unless marked "expected".*
