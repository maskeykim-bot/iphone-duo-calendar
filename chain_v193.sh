#!/bin/bash
# その1 の claude が終わるのを待ち、その1→その2→その3 の順にローカルコミットと実行をつなぐ（push しない）
cd /workspace/cal-v191
LOG=v191-progress.log; ts(){ date +%H:%M; }
while pgrep -f "claude -p # 第19.3版（閉じた画面だけの直し）" >/dev/null; do sleep 30; done
commit(){ git add app v191-notes/V193.md 2>/dev/null; git add -u app; git commit -q -m "$1" && echo "$(ts) chain commit $(git rev-parse --short HEAD) $1" >> $LOG; }
commit "v19.3 その1: 閉じた縦の段はつまみ（上）だけで変える・格子と日の欄を1本の縦スクロールに（sw v179）"
bash run_v193p2.sh
commit "v19.3 その2: 閉じた日の欄をカード｜時間に・時間の幅はつまみ（下）・ノートの行頭記号の直しと字下げ・入力欄をキーボードの上に・iOSリマインダー同期を止める・ノートのチェック→タスク（sw v180）"
bash run_v193p3.sh
commit "v19.3 その3: 予定・メモ・タスクのカードと別の日への移動（sw v181）"
echo "$(ts) chain done" >> $LOG
