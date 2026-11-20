#!/usr/bin/env bash
# Behavioural parity guard: pure src/domain files must be byte-identical to the member repo.
# Usage: scripts/check-parity.sh [member-repo-path]   (default ../chokprathan). CI runs this.
# Only pure src/domain files are compared; services (settlement, wallet) are adapted on purpose.
set -e
M="${1:-../chokprathan}"
rc=0
for f in money pricing match numbers adjust schedule; do
  for p in "src/domain/$f.ts" "src/domain/$f.test.ts"; do
    if [ -f "$M/$p" ]; then
      cmp -s "$M/$p" "$p" || { echo "DIFF $p"; rc=1; }
    fi
  done
done
cmp -s "$M/src/domain/parity.test.ts" src/domain/parity.test.ts || { echo "DIFF src/domain/parity.test.ts"; rc=1; }
[ "$rc" -eq 0 ] && echo "parity ok"
exit $rc
