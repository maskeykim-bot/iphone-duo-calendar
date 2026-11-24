#!/bin/bash
# 第19.2版 S11（閉じた画面の作り直し）: 1段ずつ claude -p を走らせる。使い方: S=S11a bash run_v191s11.sh
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log; TOOLS=/workspace/cal-v191-tools
ts(){ date +%H:%M; }
S=${S:?stage required e.g. S11a}
echo "$(ts) $S start (claude)" >> $LOG
( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout ${TMO:-10800} claude -p "$(cat ../V191_BRIEF_S11_HEAD.md ../V191_BRIEF_$S.md; [ -n "$PREVNOTE" ] && echo "$PREVNOTE")" \
  --add-dir /workspace/duo-calendar-team --add-dir $TOOLS --add-dir /workspace/cal-v191-shots \
  --permission-mode bypassPermissions --output-format json > ../claude-v191-$S.json.log 2>&1 )
echo "$(ts) $S claude exit=$?" >> $LOG
