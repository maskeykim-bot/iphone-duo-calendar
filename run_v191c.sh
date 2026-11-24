#!/bin/bash
# S5 のコミットを待って runner 版2 を止め、S6（最終の仕上げ）→ 全体テスト → 失敗があれば直す
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log; TOOLS=/workspace/cal-v191-tools
ts(){ date +%H:%M; }
while ! grep -q "第19.1版 S5:" $LOG; do sleep 20; done
sleep 5; kill 187999; echo "$(ts) runner 版2 を止め、S6（最終の仕上げ）へ（BGTEST S5 は裏で続行）" >> $LOG
CL(){ ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout ${2:-9000} claude -p "$1" --add-dir /workspace/duo-calendar-team --add-dir $TOOLS --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../claude-v191-$3.json.log 2>&1 ); echo "$(ts) $3 claude exit=$?" >> $LOG; }
measure(){ ( cd $TOOLS && V19_MEASURE=device M_SHOTS=/workspace/cal-v191-shots/$1/measure-final M_RAW=$TOOLS/$1-final-raw.json timeout 600 node measure.mjs > $1-final-summary.json 2>&1 ); echo "$(ts) $1 measure: $(tr -d ' \n' < $TOOLS/$1-final-summary.json | grep -o '"counts":{[^}]*}')" >> $LOG; }
commit(){ git add -A app design v191-notes v19-open-issues.md 2>/dev/null; git diff --cached --quiet || { git commit -qm "$1" && echo "$(ts) committed $(git rev-parse --short HEAD): $1" >> $LOG; }; }
fulltest(){ # 作業ツリーでそのまま（他に動くものが無い状態）
  cd app; u=$(npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')
  PW_PORT=4292 timeout 3000 npx playwright test --workers=3 --reporter=list > $TOOLS/pw-$1.out 2>&1
  nf=$(grep -E "^\s+[0-9]+ failed" $TOOLS/pw-$1.out | grep -oE "[0-9]+"); np=$(grep -E "^\s+[0-9]+ passed" $TOOLS/pw-$1.out | head -1 | grep -oE "[0-9]+" | head -1)
  r=""; if [ -n "$nf" ]; then PW_PORT=4292 timeout 1500 npx playwright test --last-failed --workers=1 --reporter=list > $TOOLS/pw-$1-retry.out 2>&1; r=$(grep -E "^\s+[0-9]+ (passed|failed)" $TOOLS/pw-$1-retry.out | tr '\n' ' '); fi
  cd ..; echo "$(ts) FULL $1 ($(git rev-parse --short HEAD)) unit: $u | pw: passed ${np:-?} failed ${nf:-0} | retry: $r" >> $LOG
  echo "$u" | grep -qE "fail [1-9]" && return 1
  [ -z "$nf" ] && return 0
  echo "$r" | grep -qE "[0-9]+ failed" && return 1; return 0
}
echo "$(ts) S6 start: 品質の合格線まで（反応なし0、文字切れ・画面端・隠れるを第19版以下、残りの動き、M-1〜M-11 の表）" >> $LOG
CL "$(cat V191_BRIEF_S6.md)

## 前の段 S5 の全体テスト
結果は $TOOLS/pw-S5.result と $TOOLS/pw-S5.out（まだ無ければ実行中）。失敗があればこの段で直す（\"N failed\" の行を見る。retry の結果は pw-S5-retry.out）。" 9000 S6
measure S6; commit "第19.1版 S6: 品質の合格線まで仕上げ（押した反応なし0、文字切れ・画面端・隠れるの戻し、残りのシートの動き、iOS へ www を同期）"
for k in 1 2 3; do
  # BGTEST S5 が終わるまで待ってから全体（同時に回すと負荷で不安定になる）
  while pgrep -f "v191-pw-S5" > /dev/null; do sleep 20; done
  if fulltest F$k; then echo "$(ts) FINAL tests OK" >> $LOG; echo "$(ts) ALL DONE" >> $LOG; exit 0; fi
  CL "$(cat V191_BRIEF_COMMON.md)

## 最終の修正ラウンド F$k
全体テストに失敗が残っている。$(tail -1 $LOG)
詳細: $TOOLS/pw-F$k.out と $TOOLS/pw-F$k-retry.out。原因を調べて直す（アプリの不具合ならアプリ、資料で仕様が変わった所の古いテストならテスト。関係ないテストを弱めない・skip/fixme にしない）。直した spec を PW_PORT=4292 で通るまで確かめる。何を直したかを v191-notes/final.md に追記。measure の noFeedback が 0 のままか確かめる。" 3600 F$k
  measure F$k; commit "第19.1版 全体テストの直し（F$k）"
done
echo "$(ts) STOP: tests still failing after final fix rounds" >> $LOG
