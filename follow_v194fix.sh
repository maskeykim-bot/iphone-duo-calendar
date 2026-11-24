#!/bin/bash
cd /workspace/cal-v191
exec 8>/tmp/follow_v194fix.lock; flock -n 8 || { echo running; exit 0; }
exec 9>/tmp/run_v194fix.lock; flock 9   # run_v194fix.sh が終わるまで待つ
ts(){ date +%H:%M; }; note(){ echo "- $(ts) $1" >> V194_PROGRESS.md; echo "$(ts) follow $1" >> v191-progress.log; }
SID=$(grep -ho '"session_id":"[^"]*"' $(ls -t claude-v194fix-r*.json.log) 2>/dev/null | head -1 | cut -d'"' -f4); [ -z "$SID" ] && SID=938e5df1-6a97-4112-a777-f63b93665f60
MSG="$(cat V194_BRIEF_FIX_ADD.md)"
for i in 1 2 3 4 5 6; do
  OUT=claude-v194fixadd-r$i.json.log; note "直し 追記（品質 Q-1〜Q-5）実行 $i 回目 (sid=${SID:-new})"
  if [ -n "$SID" ]; then ARGS=(--resume "$SID" -p "$MSG"); else ARGS=(-p "$(cat V194_BRIEF_FIX.md)

$MSG"); fi
  ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 28800 claude "${ARGS[@]}" --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../$OUT 2>&1 )
  NS=$(grep -o '"session_id":"[^"]*"' $OUT | head -1 | cut -d'"' -f4); [ -n "$NS" ] && SID=$NS
  if grep -q '"is_error":false' $OUT; then note "直し 追記 claude 終わり"; break; fi
  MSG="API が止まったので続きから。V194_PROGRESS.md と git log を読み、V194_BRIEF_FIX.md と V194_BRIEF_FIX_ADD.md の残りを最後まで。"
  git add app v191-notes 2>/dev/null; git diff --cached --quiet || git commit -q -m "v19.4 直し 追記 WIP（止まった時点 $i 回目）"; note "止まった。5 分待ってやり直す"; sleep 300
done
git add app v191-notes V194_PROGRESS.md 2>/dev/null; git diff --cached --quiet || { git commit -q -m "v19.4 直し 追記 仕上げ（実装担当の最後の状態）"; note "コミット $(git rev-parse --short HEAD)"; }
note "直し 追記 run 終わり"
