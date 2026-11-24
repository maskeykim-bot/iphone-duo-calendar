
## 前段（S11b）からの引き継ぎ（開発責任者）
- 現在の HEAD は S11b のコミット。v191-notes/S11.md の S11a・S11b・「品質の確認への対応」を先に読むこと。品質の確認 qa/review-v19-2-38b1e56.md も読む。
- 品質のひな形は app/tests/closed-pull-v20.spec.js・spec-values.js・note-ime-r70.spec.js（qa/scripts の写し）。**原本は触らない**。写しの直しは v191-notes/S11-qa-spec-diff.patch の 3 か所だけ。始める前に qa/scripts/v20-closed/ と qa/scripts/note-ime-r70.spec.js の日時を見て、新しければ写し直してから patch の 3 か所を当て直す。
- S11b 時点の落ち（closed-pull-v20）: G 533（全部→…→月の表現）、538（今日へ）、564、570、571、578、579、594（タスク y172〜220・押せる y168〜224）、611（「…」の位置と中）、H 640（ノート中）。これを全部通す。
- 全体 Playwright の S11c の落ち: band-layout（5）、closed-tabs（4）、s7e:76（1）。タブ・帯のボタンを前提にした古い形の試験なので、design/34（§2.1 見出し y0〜44・曜日 y44〜64＝格子上端 y64、§9.1 タブ廃止・右の列、§6.3 日の欄の中だけ流れる）に合わせて書き直す。skip/fixme/only は禁止、確かめを減らさない。どの値をなぜ変えたかを S11.md に根拠（34 の節）付きで残す（品質が仕分けに使う）。
- 見出しの古いボタン（‹ › 全部 今日 の見える版）は閉じた画面では消し、見えない「前の月」「次の月」（2×2、opacity 0、`.mph [data-act=prev/next]`）は残す（S11b で 2×2 に直した。`min-height:0` を消さない）。
- タブを消したら、note-ime-r70.spec.js と note-sheet などの「閉じた段1は段4へ進めてから押す」一時の直しが要らなくなるはず。要らなければ外し、patch からも消す（要るなら理由を S11.md に）。
- __duoHapticLog は S11a で入っている（起動時から配列、段の境をまたぐたびに {stage,t}）。変えない。
- Q-13（チップの長押しで別の日へ、R-49 の moveTimes 経由、NY 夏時間 3/8・11/1 の単体2本）は S11b で入っている。壊さない。
- 終わりに: 全体 Playwright（PW_PORT=4292）0 失敗（重い時刻の試験は workers=1 で再確認してよい）、単体 TZ=Asia/Tokyo と TZ=America/New_York、重なりの 1pt 再スキャン（/workspace/cal-v191-tools/scan.mjs）、sw.js の CACHE を1つ上げる、npm run ios の sync、段ごとのスクショを /workspace/cal-v191-shots/S11/（c-s1〜c-s7.png、c-menu.png、c-today.png、c-note.png）、S11.md に S11c の記録、コミット（S11c）。push と iPhone への入れ込みはしない。
- 守ること: バンドル ID com.maskeykim.duocalendar を変えない。osascript と System Events は使わない。秘密の情報を書かない。git stash 禁止。DB の版6・ノートの保存の形は変えない。/workspace/duo-calendar-team/ は読むだけ。
