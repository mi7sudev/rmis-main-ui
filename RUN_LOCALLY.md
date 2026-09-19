# RMIS — Local Development Setup Guide

This guide walks you through running the RMIS Next.js application on your local machine using VS Code.

---

## Prerequisites

Before you begin, install the following on your computer:

### 1. Node.js (v18 or newer)
Download from: https://nodejs.org/
Verify installation:
```bash
node --version
npm --version
```

### 2. Bun (package manager)
Download from: https://bun.sh/
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Verify
bun --version
```

### 3. Git
Download from: https://git-scm.com/
```bash
git --version
```

### 4. VS Code
Download from: https://code.visualstudio.com/

**Recommended VS Code Extensions:**
- **ES7+ React/Redux/React-Native snippets** (dsznajder.es7-react-js-snippets)
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **Prisma** (Prisma.prisma)
- **TypeScript Importer** (vscode.typescript)

Install all at once via Command Palette (`Ctrl+Shift+P` → "Extensions: Install Extensions").

---

## Step 1: Get the Project Files

### Option A: From your existing folder

You already have the project at `D:\Office\RMIS V2 0.1`. Open it in VS Code:

```bash
# In VS Code terminal (Ctrl + `)
cd "D:\Office\RMIS V2 0.1"
```

### Option B: Clone from the sandbox

If you want a fresh copy from the Z.ai sandbox:

```bash
cd D:\Office
# The sandbox saves the project — copy the files to your machine
# You can use git clone if it's in a repo, or copy the folder directly
```

---

## Step 2: Install Dependencies

Open the VS Code integrated terminal (`Ctrl + \`` or Terminal → New Terminal) and run:

```bash
bun install
```

This installs all packages defined in `package.json` (Next.js, Prisma, shadcn/ui, etc.).

**Expected output:**
```
[0.03ms] ".env"
Checked 902 installs across 959 packages
```

---

## Step 3: Set Up the Production Database

### ⚠️ CRITICAL: Do NOT Skip This Step

The application connects to a **production SQLite database** containing real data. This database must **never** be deleted, reset, or recreated.

### 3a. Copy your production database

Copy your existing production database file to the project's `db/` folder:

```
From: D:\Office\RMIS\backend\.tmp\data.db
To:   D:\Office\RMIS V2 0.1\db\production-data.db
```

If the `db/` folder doesn't exist, create it:
```bash
mkdir db
copy "D:\Office\RMIS\backend\.tmp\data.db" "db\production-data.db"
```

### 3b. Create your `.env` file

Create a file named `.env` in the project root (same level as `package.json`):

```env
# Production database — contains REAL production data. NEVER delete or reset.
DATABASE_URL=file:./db/production-data.db
NEXTAUTH_SECRET=your-secret-key-here-at-least-16-characters
NEXTAUTH_URL=http://localhost:3000
```

**Important:** Replace `your-secret-key-here-at-least-16-characters` with any random string of at least 16 characters. This is used to sign login sessions.

You can generate a random secret:
```bash
# In VS Code terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3c. Verify the database is readable

```bash
# Generate the Prisma client (reads the schema, connects to your DB)
bun run db:generate
```

**Expected output:**
```
✔ Generated Prisma Client (v6.11.1)
```

If you see an error about the database not existing, check that:
- The `db/production-data.db` file exists
- The `DATABASE_URL` in `.env` points to the correct path
- You are running the command from the project root

---

## Step 4: Start the Development Server

```bash
bun run dev
```

**Expected output:**
```
▲ Next.js 16.1.3 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 650ms
```

Open your browser and go to: **http://localhost:3000**

---

## Step 5: Log In

The application reads users from the production database. You can log in with any existing Strapi user's username/email and password.

### Test Admin Account

A test admin account was created in the database for testing:

```
Username: testadmin
Password: password123
```

### Existing Production Users

All your existing Strapi users can log in with their current passwords. The system reads the bcrypt password hashes directly from the `up_users` table.

**Role derivation:**
- `is_admin = true` → **Administrator** role
- Linked to `applicants` role (role_id=3) → **Applicant** role
- Other authenticated users → **Evaluator** role

---

## Project Structure

```
RMIS V2 0.1/
├── db/
│   └── production-data.db     ← Your production database (DO NOT DELETE)
├── prisma/
│   └── schema.prisma          ← Maps to production tables (read-only)
├── src/
│   ├── app/
│   │   ├── api/               ← API routes (31 files)
│   │   ├── page.tsx           ← Main page (single-route SPA)
│   │   ├── layout.tsx         ← Root layout
│   │   └── globals.css        ← Global styles + topbar CSS
│   ├── components/
│   │   ├── ui/                ← shadcn/ui components (48 files)
│   │   ├── views/             ← Page views (12 files)
│   │   ├── topbar.tsx         ← Preserved topbar (DO NOT MODIFY)
│   │   ├── footer.tsx         ← MIRDC footer
│   │   └── session-provider.tsx
│   └── lib/
│       ├── db.ts              ← Prisma client (fail-fast if DB missing)
│       ├── auth.ts            ← Session/RBAC helpers
│       ├── jwt.ts             ← JWT signing/verification
│       ├── roles.ts           ← Role type definition
│       ├── role-utils.ts      ← Role derivation (from is_admin + junction)
│       ├── validation.ts      ← Zod schemas
│       ├── mqr.ts             ← Minimum Qualification Requirements engine
│       ├── extraction.ts      ← Document AI extraction (VLM)
│       └── raw-json.ts        ← SQLite JSON column reader
├── public/
│   ├── logo.png               ← Original DOST logo (from repo)
│   └── logo122.png            ← Original MIRDC logo (from repo)
├── .env                       ← Environment variables (NOT in git)
├── .env.example               ← Template for .env
└── package.json
```

---

## Common Commands

```bash
# Start dev server (http://localhost:3000)
bun run dev

# Run lint (check code quality)
bun run lint

# Generate Prisma client (after schema changes)
bun run db:generate

# Validate Prisma schema (read-only, does NOT touch the DB)
bun run db:validate
```

### ⚠️ Commands That Do NOT Exist (Removed for Safety)

The following commands were **intentionally removed** to protect the production database:

```bash
bun run db:push     # REMOVED — would destroy production data
bun run db:reset    # REMOVED — would destroy production data
bun run db:migrate  # REMOVED — would destroy production data
```

**Never run `prisma db push`, `prisma migrate`, or `prisma migrate reset` against the production database.**

---

## Troubleshooting

### "Cannot find module 'jose'" or similar errors

Dependencies may need reinstalling:
```bash
rm -rf node_modules
bun install
```

### "DATABASE_URL environment variable is not set"

Your `.env` file is missing or incorrect. Verify:
1. `.env` exists in the project root
2. It contains `DATABASE_URL=file:./db/production-data.db`
3. The `db/production-data.db` file exists

### "Refusing to connect to custom.db in production"

The app detected `custom.db` in the `DATABASE_URL`. This is a safety guard. Fix your `.env`:
```env
DATABASE_URL=file:./db/production-data.db
```

### Login fails with "Invalid credentials"

1. Make sure you're using an existing Strapi user's username or email
2. The password must match what's stored in the `up_users` table (bcrypt hash)
3. Use the test admin account: `testadmin` / `password123`

### Page loads but data is empty

The app is likely connecting to the wrong database. Check:
1. `db/production-data.db` exists and is 4+ MB
2. `.env` points to the correct path
3. No `custom.db` file was created in `db/` (delete it if found)

### Server crashes with memory error

Increase the Node.js memory limit:
```bash
# Windows PowerShell
$env:NODE_OPTIONS="--max-old-space-size=4096"
bun run dev
```

### Port 3000 is already in use

```bash
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or use a different port
bun run dev -- -p 3001
```

---

## Database Safety Rules

1. **Never delete `db/production-data.db`** — it contains real production data
2. **Never run `prisma db push`** — it will overwrite the production schema
3. **Never run `prisma migrate reset`** — it will destroy all data
4. **Never commit `.env`** — it contains secrets (it's already in `.gitignore`)
5. **Always back up** `db/production-data.db` before making changes:
   ```bash
   copy db\production-data.db db\production-data.db.backup
   ```

---

## VS Code Debugging (Optional)

To debug the Next.js app in VS Code:

1. Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "dev"],
      "env": {
        "DATABASE_URL": "file:./db/production-data.db",
        "NEXTAUTH_SECRET": "your-secret-key-here"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

2. Press `F5` to start debugging (or Run → Start Debugging)

---

## Need Help?

If you encounter issues:

1. Check the dev server console output in the VS Code terminal
2. Verify your `.env` file is correct
3. Make sure `db/production-data.db` exists
4. Run `bun run lint` to check for code errors
5. Check that all dependencies are installed (`bun install`)
