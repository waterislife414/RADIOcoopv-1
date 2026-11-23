#!/usr/bin/env bash
# Build the demo, serve it, run a click-through suite (arg: suite name, default step1), print the summary. Exit 1 if anything failed.
cd "$(dirname "$0")/../.."
npm run build:demo >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }
node tests/qa/serve.cjs dist-demo 8790 >/dev/null 2>&1 & SP=$!
sleep 2
OUT=$(QA_BASE=http://127.0.0.1:8790 python3 tests/qa/${1:-step1}.py 2>&1)
kill $SP 2>/dev/null
echo "$OUT" | grep -E "^(==|  FAIL|PASS|FAIL)"
echo "$OUT" | grep -q "FAIL" && exit 1 || exit 0
