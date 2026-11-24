#!/bin/bash
cd /workspace/cal-v191
exec 9>/tmp/run_v193p4.lock; flock -n 9 || { echo running; exit 0; }
ts(){ date +%H:%M; }; note(){ echo "- $(ts) $1" >> V193_PROGRESS.md; echo "$(ts) p4run $1" >> v191-progress.log; }
SID=""
for i in 1 2 3 4 5 6; do
  OUT=claude-v193p4-r$i.json.log; note "その4 実行 $i 回目 (sid=${SID:-new})"
  if [ -n "$SID" ]; then ARGS=(--resume "$SID" -p "API が止まったので続きから。V193_PROGRESS.md と git log を読み、V193_BRIEF_P4.md の残りを最後まで。"); else ARGS=(-p "$(cat V193_BRIEF_P4.md)"); fi
  ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 21600 claude "${ARGS[@]}" --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../$OUT 2>&1 )
  NS=$(grep -o '"session_id":"[^"]*"' $OUT | head -1 | cut -d'"' -f4); [ -n "$NS" ] && SID=$NS
  if grep -q '"is_error":false' $OUT; then note "その4 claude 終わり"; break; fi
  note "その4 止まった。3 分待ってやり直す"; sleep 180
done
git add app v191-notes/V193.md 2>/dev/null; git add app; git diff --cached --quiet || { git commit -q -m "v19.3 その4 仕上げ（実装担当の最後の状態）"; note "コミット $(git rev-parse --short HEAD)"; }
note "その4 run 終わり"
