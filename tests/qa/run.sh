#!/usr/bin/env bash
# Demo build (no keys) -> next start on :8790 -> Playwright click-through. Prints "== score" + FAIL lines.
# -v prints every check. Exit 1 if any check failed.
cd "$(dirname "$0")/../.."
PORT=8790
curl -s -o /dev/null "http://127.0.0.1:$PORT/" && { echo "== score 0/1 (port $PORT busy: stale server)"; exit 1; }
NEXT_PUBLIC_SITE_URL="http://127.0.0.1:$PORT" npm run build:demo >/tmp/qa-build.log 2>&1 || { echo "== score 0/1 (BUILD FAILED)"; tail -15 /tmp/qa-build.log; exit 1; }
NEXT_PUBLIC_DEMO_MODE=1 node node_modules/next/dist/bin/next start -p $PORT >/tmp/qa-server.log 2>&1 & SP=$!
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
OUT=$(QA_BASE="http://127.0.0.1:$PORT" python3 tests/qa/step1.py 2>&1)
kill $SP 2>/dev/null; wait $SP 2>/dev/null
if [ "$1" = "-v" ]; then echo "$OUT"; else echo "$OUT" | grep -E "^(==|  FAIL)"; fi
echo "$OUT" | grep -q "^  FAIL" && exit 1 || exit 0
