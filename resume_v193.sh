#!/bin/bash
# claude -p を続きから（--resume）。529 などで止まったら待って最大 6 回やり直す。二重起動しない。使い方: bash resume_v193.sh p2|p3
cd /workspace/cal-v191
PH=$1; exec 9>/tmp/resume_v193_$PH.lock; flock -n 9 || { echo running; exit 0; }
LOG=v191-progress.log; P=V193_PROGRESS.md; ts(){ date +%H:%M; }
note(){ echo "- $(ts) $1" >> $P; echo "$(ts) resume $1" >> $LOG; }
commit(){ git add app v191-notes 2>/dev/null; git add app; git reset -q v191-notes/*.out 2>/dev/null; if git diff --cached --quiet; then note "コミットなし: $1"; else git commit -q -m "$1" && note "コミット $(git rev-parse --short HEAD): $1"; fi; }
BRIEF=V193_BRIEF_${PH^^}.md
MSG_RESUME="API の 529 で止まったので続きから再開してください。まず V193_PROGRESS.md・git log・v191-progress.log を読み、済んだ項目は飛ばして、$BRIEF の残り（とくに追記8: 項目ごとにローカルコミット、全体 Playwright を最後に1回、V193.md の節、sw、npm run ios、スクショを Read で確かめる）を最後まで仕上げてください。push 禁止・git stash 禁止。"
SID=${2:-}
for i in 1 2 3 4 5 6; do
  OUT=claude-v193$PH-r$i.json.log
  note "$PH 再開 $i 回目 (sid=${SID:-new})"
  if [ -n "$SID" ]; then ARGS=(--resume "$SID" -p "$MSG_RESUME"); else ARGS=(-p "# 第19.3版 ${PH} 続き
$MSG_RESUME

$(cat $BRIEF)"); fi
  ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 28800 claude "${ARGS[@]}" \
    --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots \
    --permission-mode bypassPermissions --output-format json > ../$OUT 2>&1 )
  NS=$(grep -o '"session_id":"[^"]*"' $OUT | head -1 | cut -d'"' -f4); [ -n "$NS" ] && SID=$NS
  if grep -q '"api_error_status":5' $OUT || ! grep -q '"is_error":false' $OUT; then note "$PH 止まった（$(grep -o '"result":"[^"]\{0,80\}' $OUT | head -1)）。5 分待ってやり直す"; commit "v19.3 $PH WIP（止まった時点、$i 回目）"; sleep 300; continue; fi
  note "$PH 終わり"; commit "v19.3 $PH 仕上げ（実装担当の最後の状態）"; exit 0
done
note "$PH 6 回やり直しても終わらない"
