#!/bin/bash
# 第19.1版 段ごとの実行（版2）。全体テストは段のコミットのスナップショットで裏で回し、その間に次の段を進める。
cd /workspace/cal-v191
LOG=/workspace/cal-v191/v191-progress.log
TOOLS=/workspace/cal-v191-tools
declare -A T=(
 [S1]="閉じた画面の月を縮めず1本でスクロール（R-62・design/33 §5）、タブに隠れない（R-12/R-40/M-18 のぼかし24・下余白87）、+N を日付の行の右へ・六曜（H-05/H-06/M-19）、格子 x8〜374（H-21）、開いた横の月の既定を予定名（H-04）、閉じた週（H-07/M-08）、L-05、L-01、M-10"
 [S2]="開いた縦: ホーム案A（R-15/H-12/企画-1）、集中切替を上の帯 220×36（R-18/H-11）、月の1枚の紙・2つの窓と「全部」（H-13）、設定の溝（H-22）、時間軸から月の日へ落とす（R-49）"
 [S3]="ノートの記号を隠して見た目だけで書式・チェック二重を消す（保存の文字と DB v6 はそのまま、R-27/H-14/H-15/FIX1）、M-06、M-07、キーボードの ∧∨✓ の帯を消す（@capacitor/keyboard setAccessoryBarVisible、kbTop の真上8のまま）、IMPL_PLAN_V19 PR2 の書き換え"
 [S4]="押した反応を全ボタンに（:active 0.10秒 #EFECE4 ほか、H-01）、シートを0.25秒で下から・角丸24（H-02・動-5）、ダイヤルと終日の秒数（動-3/4）、明朝をやめ標準書体（H-03）、文字の段（M-01）、角丸（M-02）"
 [S5]="残りの第19版の直し（H-08/09/10/16/17/18/19/20、M-03〜05/09/11〜17/20/21、L-02/03/04/06/07）、SW と iOS へ www を同期"
)
declare -A PORT=([S1]=4301 [S2]=4302 [S3]=4303 [S4]=4304 [S5]=4305 [F1]=4306 [F2]=4307 [F3]=4308)
ts(){ date +%H:%M; }
CL(){ ( cd /workspace/cal-v191/app && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN timeout ${2:-9000} claude -p "$1" --add-dir /workspace/duo-calendar-team --add-dir $TOOLS --add-dir /workspace/cal-v191-shots --permission-mode bypassPermissions --output-format json > /workspace/cal-v191/claude-v191-$3.json.log 2>&1 ); echo "$(ts) $3 claude exit=$?" >> $LOG; }
commit(){ cd /workspace/cal-v191; git add -A app design v191-notes v19-open-issues.md 2>/dev/null; git diff --cached --quiet || { git commit -qm "$1" && echo "$(ts) committed $(git rev-parse --short HEAD): $1" >> $LOG; }; }
bgtest(){ # $1=名前 — HEAD のスナップショットで単体＋Playwright 全体を裏で
  local N=$1 D=/tmp/v191-pw-$1 H=$(git -C /workspace/cal-v191 rev-parse --short HEAD)
  ( git -C /workspace/cal-v191 worktree remove --force $D 2>/dev/null; rm -rf $D
    git -C /workspace/cal-v191 worktree add -q --detach $D $H && ln -s /workspace/cal-v191/app/node_modules $D/app/node_modules
    cd $D/app
    u=$(npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')
    echo "$u" | grep -qE "fail [1-9]" && u="retry: $(npm run test:unit 2>&1 | grep -E "ℹ (pass|fail) " | tr '\n' ' ')"
    PW_PORT=${PORT[$N]} timeout 3000 npx playwright test --workers=3 --reporter=list > $TOOLS/pw-$N.out 2>&1
    p=$(tail -6 $TOOLS/pw-$N.out | tr '\n' ' ')
    if echo "$p" | grep -qE "[0-9]+ (failed|flaky)"; then
      r=$(PW_PORT=${PORT[$N]} timeout 1500 npx playwright test --last-failed --workers=2 --reporter=list 2>&1 | tee $TOOLS/pw-$N-retry.out | tail -5 | tr '\n' ' ')
      p="$p || retry-failed-only: $r"
    fi
    echo "$(ts) BGTEST $N ($H) unit: $u | pw: $p" >> $LOG
    echo "$H|$u|$p" > $TOOLS/pw-$N.result
  ) > /dev/null 2>&1 &
  echo "$(ts) BGTEST $N started on $H (port ${PORT[$N]})" >> $LOG
}
prevnote(){ # 前の段の全体テストの結果を次の段へ渡す
  local P=$1
  [ -z "$P" ] && return
  echo "
## 前の段 $P の全体テスト（裏で実行）
結果ファイル: $TOOLS/pw-$P.result（\"コミット|単体|Playwright\" の1行。まだ無ければ実行中）、詳細 $TOOLS/pw-$P.out と $TOOLS/pw-$P-retry.out。
この段の作業の途中でときどき確かめ、失敗（retry でも落ちたもの）があれば、この段の中で原因を調べて直す（アプリの不具合ならアプリ、資料で仕様が変わった所の古いテストならテスト。関係ないテストを弱めない）。retry で通ったものは不安定として notes に書く。"
}
measure(){ ( cd $TOOLS && V19_MEASURE=device M_SHOTS=/workspace/cal-v191-shots/$1/measure-final M_RAW=$TOOLS/$1-final-raw.json timeout 600 node measure.mjs > $1-final-summary.json 2>&1 ); echo "$(ts) $1 measure: $(tr -d ' \n' < $TOOLS/$1-final-summary.json | grep -o '"counts":{[^}]*}')" >> $LOG; }

PREV=""
for S in ${STAGES:-S1 S2 S3 S4 S5}; do
  if [ "$S" = S1 ] && [ -n "$S1PID" ]; then
    echo "$(ts) S1 resume: waiting for running claude pid $S1PID" >> $LOG
    while kill -0 $S1PID 2>/dev/null; do sleep 15; done
    echo "$(ts) S1 claude finished" >> $LOG
  else
    echo "$(ts) $S start: ${T[$S]}" >> $LOG
    CL "$(cat V191_BRIEF_$S.md)$(prevnote $PREV)" 9000 $S
  fi
  grep -q '"git stash' claude-v191-$S.json.log 2>/dev/null && echo "$(ts) WARN: git stash mentioned in $S" >> $LOG
  measure $S
  commit "第19.1版 $S: ${T[$S]}"
  bgtest $S
  PREV=$S
done
# 最後の段の全体テストを待ち、失敗があれば直して全体をもう一度（最大3回）
for k in 1 2 3; do
  while [ ! -f $TOOLS/pw-$PREV.result ]; do sleep 20; done
  res=$(cat $TOOLS/pw-$PREV.result)
  u=$(echo "$res" | cut -d'|' -f2); p=$(echo "$res" | cut -d'|' -f3-)
  if echo "$u" | grep -q "fail 0" && ! echo "$u" | grep -qE "^[^r]*fail [1-9]" && { ! echo "$p" | grep -qE "[0-9]+ failed" || echo "$p" | grep -q "retry-failed-only:.*passed" && ! echo "$p" | grep -qE "retry-failed-only:.*[0-9]+ failed"; }; then
    echo "$(ts) FINAL tests OK on $(echo "$res" | cut -d'|' -f1)" >> $LOG; echo "$(ts) ALL DONE" >> $LOG; exit 0
  fi
  F=F$k
  echo "$(ts) $F fix round start (failures in $PREV)" >> $LOG
  CL "$(cat V191_BRIEF_COMMON.md)

## 最終の修正ラウンド $F
全体テストに失敗が残っている。単体: $u
Playwright: $p
詳細: $TOOLS/pw-$PREV.out、$TOOLS/pw-$PREV-retry.out。原因を調べて直す（アプリの不具合ならアプリ、資料で仕様が変わった所の古いテストならテスト。関係ないテストを弱めない・skip/fixme にしない）。直した spec を PW_PORT=4292 で通るまで確かめる。何を直したかを v191-notes/final.md に追記する。" 3600 $F
  measure $F
  commit "第19.1版 全体テストの直し（$F）"
  bgtest $F; PREV=$F
done
echo "$(ts) STOP: tests still failing after final fix rounds" >> $LOG
