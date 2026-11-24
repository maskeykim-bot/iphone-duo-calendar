#!/bin/bash
# 第19.1版 S7（レビュー後の直し）: S7a→S7b→S7c→S7d、段ごとに measure・コミット・裏で全体テスト。最後に全体テスト→失敗なら直す（最大3回）
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log; TOOLS=/workspace/cal-v191-tools
ts(){ date +%H:%M; }
declare -A T=([S7a]="ノートの記号を題名・一覧・検索・ピン留めで隠す（保存の文字そのまま）、V-15/18/19/20/24、品質の高-1/2" [S7b]="設計の高 V-01〜V-10（切替 252×36、帯の絵、+N、六曜、週の題名、明るい色のみ・UIUserInterfaceStyle=Light、設定の溝、ぼかし、上の帯）" [S7c]="設計の中・低 V-11〜V-27、品質の中・低、計測の「直す」" [S7d]="最終の照合、S7.md の対応表、SW と iOS 同期" [S7e]="設計の答えの残り（文字の値、送り切りの 8 のテスト、横のシートの影、左ページの端 16）、S7.md の未決を解決")
declare -A PORT=([S7a]=4311 [S7b]=4312 [S7c]=4313 [S7d]=4314 [S7e]=4315)
CL(){ ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout ${2:-9000} claude -p "$1" --add-dir /workspace/duo-calendar-team --add-dir $TOOLS --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../claude-v191-$3.json.log 2>&1 ); echo "$(ts) $3 claude exit=$?" >> $LOG; }
measure(){ ( cd $TOOLS && V19_MEASURE=device M_SHOTS=/workspace/cal-v191-shots/$1/measure-final M_RAW=$TOOLS/$1-final-raw.json timeout 600 node measure.mjs > $1-final-summary.json 2>&1 ); echo "$(ts) $1 measure: $(tr -d ' \n' < $TOOLS/$1-final-summary.json | grep -o '"counts":{[^}]*}')" >> $LOG; [ -f $TOOLS/s7-fixcheck.mjs ] && echo "$(ts) $1 fixcheck: $(cd $TOOLS && timeout 120 node s7-fixcheck.mjs $TOOLS/$1-final-raw.json 2>&1 | tail -3 | tr '\n' ' ')" >> $LOG; }
commit(){ git add -A app design v191-notes v19-open-issues.md 2>/dev/null; git diff --cached --quiet || { git commit -qm "$1" && echo "$(ts) committed $(git rev-parse --short HEAD): $1" >> $LOG; }; }
pwsum(){ local nf np nk; nf=$(grep -E "^\s+[0-9]+ failed" $1 | grep -oE "[0-9]+" | head -1); np=$(grep -E "^\s+[0-9]+ passed" $1 | grep -oE "[0-9]+" | head -1); nk=$(grep -E "^\s+[0-9]+ flaky" $1 | grep -oE "[0-9]+" | head -1); echo "passed ${np:-?} failed ${nf:-0} flaky ${nk:-0}"; }
bgtest(){ local N=$1 D=/tmp/v191-pw-$1 H=${2:-$(git rev-parse --short HEAD)}
  ( git worktree remove --force $D 2>/dev/null; rm -rf $D
    git worktree add -q --detach $D $H && ln -s /workspace/cal-v191/app/node_modules $D/app/node_modules
    cd $D/app; u=$(npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')
    PW_PORT=${PORT[$N]} timeout 3000 npx playwright test --workers=3 --reporter=list > $TOOLS/pw-$N.out 2>&1
    p=$(pwsum $TOOLS/pw-$N.out); r=""
    if ! echo "$p" | grep -q "failed 0"; then PW_PORT=${PORT[$N]} timeout 1500 npx playwright test --last-failed --workers=1 --reporter=list > $TOOLS/pw-$N-retry.out 2>&1; r=" || retry: $(pwsum $TOOLS/pw-$N-retry.out)"; fi
    echo "$(ts) BGTEST $N ($H) unit: $u | pw: $p$r" >> $LOG; echo "$H|$u|$p$r" > $TOOLS/pw-$N.result ) > /dev/null 2>&1 &
  echo "$(ts) BGTEST $N started on $H (port ${PORT[$N]})" >> $LOG; }
prevnote(){ [ -z "$1" ] && return; echo "
## 前の段 $1 の全体テスト（裏で実行）
結果: $TOOLS/pw-$1.result（無ければ実行中）、詳細 $TOOLS/pw-$1.out・pw-$1-retry.out。作業の途中で確かめ、retry でも落ちたものはこの段で原因を調べて直す（アプリの不具合はアプリ。関係ないテストを弱めない）。"; }
PREV=""; PREV0=${PREV0:-}
[ -n "$BG0" ] && bgtest $BG0 $BG0C
for S in ${STAGES:-S7a S7b S7c S7d}; do
  echo "$(ts) $S start: ${T[$S]}" >> $LOG
  CL "$(cat V191_BRIEF_S7_HEAD.md V191_BRIEF_$S.md; [ -f V191_BRIEF_${S}_RESUME.md ] && cat V191_BRIEF_${S}_RESUME.md)$(prevnote ${PREV:-$PREV0})" 9000 $S
  measure $S; commit "第19.1版 $S: ${T[$S]}"; bgtest $S; PREV=$S
done
fulltest(){ cd app; u=$(npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')
  PW_PORT=4292 timeout 3000 npx playwright test --workers=3 --reporter=list > $TOOLS/pw-$1.out 2>&1; p=$(pwsum $TOOLS/pw-$1.out); r=""
  if ! echo "$p" | grep -q "failed 0"; then PW_PORT=4292 timeout 1500 npx playwright test --last-failed --workers=1 --reporter=list > $TOOLS/pw-$1-retry.out 2>&1; r="$(pwsum $TOOLS/pw-$1-retry.out)"; fi
  cd ..; echo "$(ts) FULL $1 ($(git rev-parse --short HEAD)) unit: $u | pw: $p | retry: $r" >> $LOG
  echo "$u" | grep -qE "fail [1-9]" && return 1; echo "$p" | grep -q "failed 0" && return 0; echo "$r" | grep -q "failed 0" && return 0; return 1; }
for k in 1 2 3; do
  while pgrep -f "[v]191-pw-S7" > /dev/null; do sleep 20; done
  if fulltest G$k; then echo "$(ts) FINAL tests OK" >> $LOG; echo "$(ts) S7 ALL DONE" >> $LOG; exit 0; fi
  CL "$(cat V191_BRIEF_S7_HEAD.md)

## 最終の修正ラウンド G$k
全体テストに失敗が残っている。$(tail -1 $LOG)
詳細: $TOOLS/pw-G$k.out と pw-G$k-retry.out。原因を調べて直す（アプリの不具合はアプリ、資料で仕様が変わった所の古いテストはテスト（根拠を書く）。関係ないテストを弱めない・skip/fixme にしない）。直した spec を PW_PORT=4292 で通るまで確かめる。何を直したかを v191-notes/S7.md に追記。measure の noFeedback 0 と s7-fixcheck の残り 0 を保つ。" 3600 G$k
  measure G$k; commit "第19.1版 S7 全体テストの直し（G$k）"
done
echo "$(ts) S7 STOP: tests still failing after final fix rounds" >> $LOG
