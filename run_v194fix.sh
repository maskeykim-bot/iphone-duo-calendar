#!/bin/bash
cd /workspace/cal-v191
exec 9>/tmp/run_v194fix.lock; flock -n 9 || { echo running; exit 0; }
ts(){ date +%H:%M; }; note(){ echo "- $(ts) $1" >> V194_PROGRESS.md; echo "$(ts) p4run $1" >> v191-progress.log; }
SID=""
for i in 1 2 3 4 5 6; do
  OUT=claude-v194fix-r$i.json.log; note "v19.4 直し 実行 $i 回目 (sid=${SID:-new})"
  if [ -n "$SID" ]; then ARGS=(--resume "$SID" -p "API が止まったので続きから。V194_PROGRESS.md と git log を読み、V194_BRIEF_FIX.md の残りを最後まで。"); else ARGS=(-p "$(cat V194_BRIEF_FIX.md)"); fi
  ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 28800 claude "${ARGS[@]}" --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../$OUT 2>&1 )
  NS=$(grep -o '"session_id":"[^"]*"' $OUT | head -1 | cut -d'"' -f4); [ -n "$NS" ] && SID=$NS
  if grep -q '"is_error":false' $OUT; then note "v19.4 直し claude 終わり"; break; fi
  git add app v191-notes 2>/dev/null; git diff --cached --quiet || git commit -q -m "v19.4 直し WIP（止まった時点 $i 回目）"; note "v19.4 止まった。5 分待ってやり直す"; sleep 300
done
git add app v191-notes V194_PROGRESS.md 2>/dev/null; git diff --cached --quiet || { git commit -q -m "v19.4 直し 仕上げ（実装担当の最後の状態）"; note "コミット $(git rev-parse --short HEAD)"; }
note "v19.4 直し run 終わり"
