#!/bin/bash
# 第19.1版 段ごとの実行。STAGES="S1 S2 ..." で再開できる。
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log
declare -A T=(
 [S1]="閉じた画面の月を縮めず1本でスクロール（R-62・design/33 §5）、タブに隠れない（R-12/R-40/M-18 のぼかし24・下余白87）、+N を日付の行の右へ・六曜（H-05/H-06/M-19）、格子 x8〜374（H-21）、開いた横の月の既定を予定名（H-04）、閉じた週（H-07/M-08）、L-05、L-01、M-10"
 [S2]="開いた縦: ホーム案A（R-15/H-12/企画-1）、集中切替を上の帯 220×36（R-18/H-11）、月の1枚の紙・2つの窓と「全部」（H-13）、設定の溝（H-22）、時間軸から月の日へ落とす（R-49）"
 [S3]="ノートの記号を隠して見た目だけで書式・チェック二重を消す（保存の文字と DB v6 はそのまま、R-27/H-14/H-15/FIX1）、M-06、M-07、キーボードの ∧∨✓ の帯を消す（@capacitor/keyboard setAccessoryBarVisible、kbTop の真上8のまま）"
 [S4]="押した反応を全ボタンに（:active 0.10秒 #EFECE4 ほか、H-01）、シートを0.25秒で下から・角丸24（H-02・動-5）、ダイヤルと終日の秒数（動-3/4）、明朝をやめ標準書体（H-03）、文字の段（M-01）、角丸（M-02）"
 [S5]="残りの第19版の直し（H-08/09/10/16/17/18/19/20、M-03〜05/09/11〜17/20/21、L-02/03/04/06/07）、SW と iOS へ www を同期"
)
ts(){ date +%H:%M; }
runpw(){ cd /workspace/cal-v191/app; PW_PORT=4292 timeout 2400 npx playwright test --workers=3 --reporter=dot > /tmp/v191-pw.out 2>&1; tail -6 /tmp/v191-pw.out | tr '\n' ' '; }
pwok(){ echo "$1" | grep -q "passed" && ! echo "$1" | grep -qE "[0-9]+ (failed|flaky)"; }
for S in ${STAGES:-S1 S2 S3 S4 S5}; do
  echo "$(ts) $S start: ${T[$S]}" >> $LOG
  ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 9000 claude -p "$(cat ../V191_BRIEF_$S.md)" --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../claude-v191-$S.json.log 2>&1 ); echo "$(ts) $S claude exit=$?" >> $LOG
  grep -q '"git stash' claude-v191-$S.json.log && echo "$(ts) WARN: git stash mentioned" >> $LOG
  for round in 1 2 3; do
    u=$(cd app && npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')
    p=$(runpw)
    if echo "$p" | grep -qE "[0-9]+ (failed|flaky)"; then
      cd /workspace/cal-v191/app; r=$(PW_PORT=4292 timeout 1200 npx playwright test --last-failed --workers=2 --reporter=dot 2>&1 | tail -4 | tr '\n' ' '); cd /workspace/cal-v191
      echo "$(ts) $S retry failed-only: $r" >> $LOG
      pwok "$r" && p="retried-ok($r) first: $p"
    fi
    cd /workspace/cal-v191
    echo "$(ts) $S round$round unit: $u | pw: $p" >> $LOG
    if echo "$u" | grep -q "fail 0" && ! echo "$u" | grep -qE "fail [1-9]" && { pwok "$p" || echo "$p" | grep -q "retried-ok(" ; }; then ok=1; break; fi
    ok=0
    [ $round = 3 ] && break
    grep -E "✘|failed|Error" /tmp/v191-pw.out | head -60 > /tmp/v191-fail.txt
    ( cd app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout 3600 claude -p "$(cat ../V191_BRIEF_COMMON.md)

## 修正ラウンド（段 $S の後）
段 $S（${T[$S]}）の実装のあと、テストが落ちている。単体: $u
Playwright の失敗（/tmp/v191-pw.out の抜粋）:
$(cat /tmp/v191-fail.txt)
全文は /tmp/v191-pw.out。原因を調べ、アプリの不具合ならアプリを、仕様が資料で変わった所の古いテストならテストを新しい仕様に合わせて直す（関係ないテストを弱めない、skip/fixme にしない）。直した spec を PW_PORT=4292 で走らせて通ることを確かめる。何を直したかを v191-notes/$S.md の末尾に追記する。" --add-dir /workspace/duo-calendar-team --add-dir /workspace/cal-v191-tools --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > ../claude-v191-$S-fix$round.json.log 2>&1 ); echo "$(ts) $S fix$round claude exit=$?" >> $LOG
  done
  cd /workspace/cal-v191
  ( cd /workspace/cal-v191-tools && V19_MEASURE=device M_SHOTS=/workspace/cal-v191-shots/$S/measure-final M_RAW=/workspace/cal-v191-tools/$S-final-raw.json timeout 600 node measure.mjs > $S-final-summary.json 2>&1 ); echo "$(ts) $S measure: $(tr -d ' \n' < /workspace/cal-v191-tools/$S-final-summary.json | grep -o '"counts":{[^}]*}')" >> $LOG
  git add -A app design v191-notes v19-open-issues.md 2>/dev/null
  if [ $ok = 1 ]; then
    git commit -qm "第19.1版 $S: ${T[$S]}" && echo "$(ts) $S committed $(git rev-parse --short HEAD)" >> $LOG
  else
    git commit -qm "WIP 第19.1版 $S（テスト失敗が残る）: ${T[$S]}" ; echo "$(ts) STOP: $S tests still failing after fixes ($(git rev-parse --short HEAD))" >> $LOG; exit 1
  fi
done
echo "$(ts) ALL DONE" >> $LOG
