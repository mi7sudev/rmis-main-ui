#!/bin/bash
# RMIS dev server keep-alive wrapper
# Sets the correct production DATABASE_URL (overriding the sandbox system env var)
# and restarts the dev server if it exits.
cd /home/z/my-project
export DATABASE_URL="file:/home/z/my-project/db/production-data.db"
export NEXTAUTH_SECRET="8f40953fb81d7dc12dd200fd2c4f34df9078d2a3e7381451a211287baded7af4"
export NEXTAUTH_URL="http://localhost:3000"
unset NODE_OPTIONS 2>/dev/null || true
while true; do
  echo "[$(date)] Starting RMIS dev server..." >> /home/z/my-project/dev.log
  ./node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Dev server exited with code $?, restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
