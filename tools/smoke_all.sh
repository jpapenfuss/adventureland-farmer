#!/bin/sh
# Runs test/smoke.js without stopping at the first failure and lists every FAIL line (the real test exits at the
# first one). Usage: tools/smoke_all.sh   (from the repo root)
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
sed -e "s#__dirname#'$(pwd)/test'#g" \
    -e 's#console.error("FAIL:", m, "\\nlog:", log); process.exit(1); }#console.log("FAIL:", m); return; }#' test/smoke.js > "$tmp/smoke_all.js"
node "$tmp/smoke_all.js" > "$tmp/out.txt" 2>&1 || true
echo "ok: $(grep -c '^ok' "$tmp/out.txt")"
grep '^FAIL' "$tmp/out.txt" || echo "no FAIL lines"
rm -rf "$tmp"
