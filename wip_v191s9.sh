#!/bin/bash
# 15分ごとの WIP コミット
cd /workspace/cal-v191
while true; do
  sleep 900
  grep -q "S9 ALL DONE\|S9 STOP:" v191-progress.log && exit 0
  git add -A app design v191-notes v19-open-issues.md 2>/dev/null
  if ! git diff --cached --quiet; then
    st=$(grep -oE "S9 start" v191-progress.log | tail -1 | cut -d' ' -f1)
    git commit -qm "WIP 第19.1版 $st $(date +%H:%M)" && echo "$(date +%H:%M) WIP commit $(git rev-parse --short HEAD) ($st)" >> v191-progress.log
  fi
done
