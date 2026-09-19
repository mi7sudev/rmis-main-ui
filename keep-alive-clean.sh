#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..." >> /home/z/my-project/dev.log
  DATABASE_URL="file:/home/z/my-project/db/production-data.db" NEXTAUTH_SECRET="rmis-production-secret-key-0123456789abcdef" bun run dev >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Dev server exited with code $?, restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
