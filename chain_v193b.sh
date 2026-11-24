#!/bin/bash
# その1 の claude の終わりを待ち → 追いコミット → その2 → コミット → その3 → コミット。二重起動しない。push しない。
cd /workspace/cal-v191
exec 9>/tmp/chain_v193b.lock; flock -n 9 || { echo "already running"; exit 0; }
LOG=v191-progress.log; P=V193_PROGRESS.md; ts(){ date +%H:%M; }
note(){ echo "- $(ts) $1" >> $P; echo "$(ts) chain $1" >> $LOG; }
commit(){ git add app v191-notes/V193.md 2>/dev/null; git add app; if git diff --cached --quiet; then note "コミットなし（変更なし）: $1"; else git commit -q -m "$1" && note "コミット $(git rev-parse --short HEAD): $1"; fi; }
running(){ pgrep -f "claude -p # 第19.3版$1" >/dev/null; }
while running "（閉じた画面だけの直し）"; do sleep 30; done
commit "v19.3 その1 仕上げ: 全体テストの仕様変更分の直し・ios sync・V193.md"
if ! running " その2"; then note "その2 開始"; bash run_v193p2.sh; fi
while running " その2"; do sleep 30; done
commit "v19.3 その2: カード｜時間・時間のバー・ノートの行頭記号と字下げ・入力欄をキーボードの上に・リマインダー同期のコードと NSReminders* を外す・チェック行→タスク（sw v180）"
if ! running " その3"; then note "その3 開始"; bash run_v193p3.sh; fi
while running " その3"; do sleep 30; done
commit "v19.3 その3: 予定・メモ・タスクのカードと別の日への移動（sw v181）"
note "chain 終わり"
