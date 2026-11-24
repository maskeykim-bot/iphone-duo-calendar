#!/bin/bash
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log; TOOLS=/workspace/cal-v191-tools
ts(){ date +%H:%M; }
echo "$(ts) V193p3 start (claude)" >> $LOG
( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout ${TMO:-28800} claude -p "$(cat ../V193_BRIEF_P3.md)" \
  --add-dir /workspace/duo-calendar-team --add-dir $TOOLS --add-dir /workspace/cal-v191-shots \
  --permission-mode bypassPermissions --output-format json > ../claude-v193p3.json.log 2>&1 )
echo "$(ts) V193p3 claude exit=$?" >> $LOG
