#!/bin/bash
# Ensure the RMIS dev server is up (start if not listening), wait until it responds.
cd /home/z/my-project
if curl -s --connect-timeout 1 --max-time 2 -o /dev/null http://localhost:3000/; then
  echo "ALREADY UP"
  exit 0
fi
setsid nohup bun run dev </dev/null > /dev/null 2>&1 &
# wait up to 120s for HTTP 200 on / (compile happens on first hit)
for i in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "UP after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "FAILED to come up in 120s"
tail -20 /home/z/my-project/dev.log
exit 1
