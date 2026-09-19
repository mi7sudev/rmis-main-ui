#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="file:/home/z/my-project/db/production-data.db"
export NEXTAUTH_SECRET="rmis-production-secret-key-0123456789abcdef"
unset NODE_OPTIONS 2>/dev/null || true
exec bun run dev
