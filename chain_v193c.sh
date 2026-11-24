#!/bin/bash
cd /workspace/cal-v191
exec 9>/tmp/chain_v193c.lock; flock -n 9 || exit 0
bash resume_v193.sh p2 b4155735-0daa-4c8c-8c3a-f100d24dfa21
bash resume_v193.sh p3
echo "- $(date +%H:%M) chain_c 終わり" >> V193_PROGRESS.md
