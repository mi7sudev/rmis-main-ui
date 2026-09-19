#!/bin/bash
# RMIS dev server keep-alive wrapper (sandbox-safe)
# Restarts the Next.js dev server whenever it exits. Intentionally does NOT
# run `prisma db push` — the shipped db/production-data.db is already in sync
# with prisma/schema.prisma and must never be mutated automatically.
cd /home/z/my-project
export DATABASE_URL="file:./db/production-data.db"
export NEXTAUTH_SECRET="79ba5fd70a27c782ebd8274043f65f940aed5f76143adb8459a3feb1ce21b7b5"
export NEXTAUTH_URL="http://localhost:3000"
unset NODE_OPTIONS 2>/dev/null || true
while true; do
  # Only start if port 3000 is actually free (avoid duplicate instances)
  if ! (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
    echo "[$(date)] Starting RMIS dev server..." >> /home/z/my-project/dev.log
    bun run dev >> /home/z/my-project/dev.log 2>&1
    echo "[$(date)] Dev server exited with code $?" >> /home/z/my-project/dev.log
  fi
  sleep 5
done
