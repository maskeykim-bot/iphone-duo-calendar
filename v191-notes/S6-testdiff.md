# S6 既存テストの変更の判定（git diff 17e43b5 -- tests）

対象: 既存 spec の変更（M）43 ファイル。新規 6 spec（closed-month-s1 / kb-accessory-s3 / notes-rich-s3 / open-portrait-s2 / press-sheet-type-s4 / s5-fixes）は対象外。
削除されたテスト・skip・force:true は無し。fixme は 1 件外した（memo.spec:148、外してよい）。固定の待ち（waitForTimeout）の追加は month-pull.spec だけ（150〜300ms、フェード 0.15 秒・寄せ 0.25 秒の後）。
判定: 正当 = 設計書に合わせた書き換え／後退 = アプリの後退をテストが隠している／疑わしい = 緩めた・設計と食い違う。
設計の略称: D32=design/32、D33=design/33、D22=design/22、D25=design/25、VR=review/2026-11-19-visual-review.md（番号 H-xx 等）。

## A. 後退（チップ・帯が押せなくなった。アプリを直して元に戻す）
| spec:行 | 変更前 → 変更後 | 根拠 | 判定 |
|---|---|---|---|
| helpers.js:411〜 | （なし）→ `clickChip`：チップを押せないのでマスを押して日の部分の行を押す | VR M-11 は「見た目はそのまま、押せる範囲を 44 に」＝押せなくすることではない | 後退（この関数ごと不要に） |
| popup-dismiss.spec:19 付近・55 付近 | `[data-event="p1"]:visible` → `button[data-event="p1"]:visible`（月ではチップに当たらず日の部分の行になる） | 同上。「チップをたたく→その予定のポップアップ」の仕様が「日の選択」に変わった | 後退（元の `[data-event]` に） |
| paste.spec:72, 122, 334 | `chip(page,'撮影').click()` → `clickChip(...)` | 同上 | 後退 |
| open-portrait.spec:149（import は :2） | `.bar … .click({position:{x:4,y:8}})` → `clickChip` | 同上 | 後退 |
| layout-metrics.spec:254〜263 | チップの `aria-label` /09:00 – 09:30 大小0/ → `aria-hidden="true"`＋マスの aria-label を見る。時刻つきの確認（`aria-label` に時刻）も消えた | 同上。D32/D33/VR に「チップを押す的でなくす」の指定は無い | 後退 |
| native.spec:370 | チップの `aria-label /^iPhone、/` → `aria-hidden`＋マスの aria-label /予定\d+件.*歯医者/ | 同上。「iPhone の予定」の出所の読み上げがチップから消えた | 後退 |

## B. 疑わしい（緩めた・設計と食い違う・確認が要る）
| spec:行 | 変更前 → 変更後 | 根拠 | 判定／元に戻す内容 |
|---|---|---|---|
| month-all.spec:485 | 「全部」を末尾までスクロール後 `expect(firstWk()).not.toBe('2026-10-26')`（先頭の週が外れた）→ `scrollTop > 40`（`void firstWk` で消した） | 設計の変更ではない。メモの理由は「行が 1pt 低くなり先頭の週が丸ごと外れるほど溢れない」だが、行高の 1pt 差で週 1 本分の差は出ない。溢れ量が境目にあるなら、アプリが何かを縮めた疑い | 疑わしい（緩め）：元の「先頭の週が変わる」に戻し、7件×4日の種を増やして溢れさせる。通らないならアプリの高さ（H-05 の +N 移動で段が減ったか）を調べる |
| pages.spec:78 | 選んだ札 `pill.width toBeCloseTo(46)` → `toBeLessThanOrEqual(64.5)`（高さは 40 に） | VR M-03「選んだ札は文字の左右 12 の余白」＝幅は文字幅＋24 と決まっている。上限だけでは 10pt でも通る | 疑わしい（緩め）：`pill.width ≈ ボタン内の文字幅 + 24`（toBeCloseTo）に |
| timeline.spec:129 | 下のタブ `height >= 46-0.5` → `>= 40-0.5`。コメントで「押せる範囲は疑似要素で 44」 | 40 は VR M-03 のとおり。ただし押せる 44（M-11・D25 §5）を確かめる行が消えた | 疑わしい（確認が減った）：`elementFromPoint` でボタン上下 2pt の外が当たるか、44 の確認を足す（S5 は上下 2 の `::after`） |
| search-backup.spec:90 | 0 件の文 `…検索語や検索範囲を確認してください。` → `…検索語を確認してください。` | VR M-13「0 件のときだけ『この3年に見つかりませんでした』13pt 灰」。js/app.js:4354 のコメントとS5.md#16 には「この3年に見つかりませんでした」とあるが、js/app.js:4361 の実文は「該当する予定はありません。検索語を確認してください。」。テストは設計でなく実装の文に合わせた | 疑わしい（設計と不一致）：アプリを「この3年に見つかりませんでした」に直し、テストもその文に |
| focus-modes.spec:135、band-layout.spec:259〜276・299、open-portrait.spec:39〜48 | 検索・切替が「右上の予約域（x≥540 時刻・電池）に入らない」の確認 → 設定 x20・検索 右から20（x605〜649、y19〜63）・切替 220×36 の位置の確認 | D32 §5-5・VR △8・S2。位置は設計どおり。ただし「予約に入らない」の根拠（時刻・電池）を設計が消した記述は無い | 正当（設計指定）／要確認：実機で検索が状態バーの電池・時刻に重ならないか（`safe 上` が 0 のときだけ）。重なるなら「予約に入らない」を残す |
| calendar-settings.spec:54 | 行の高さ `r: 40` → `44` | VR M-11 は「見た目はそのまま、押せる範囲だけ 44」（疑似要素）。行の見た目を 40→44 にするのは設計に無い（S5.md #37 は「押せる範囲」と書くが、実際は行の高さ自体を変えている） | 疑わしい（軽）：見た目を 40 に戻して疑似要素で 44、または設計に 44 行と書き足す |
| reminder-settings.spec:71〜78 | ✓N の位置 `|dx-14|<1.5`（数字の中心から右 14）→ 六曜の右から `0 <= dx < 5` | 新しい位置を決めた資料が見つからない（D33 §5 は六曜 x+21〜37、+N 右 2 まで）。幅が 5 もあり、ずれても通る | 疑わしい（軽）：実測値で `dx` を締める（例 `toBeCloseTo(3, 0)`）か、資料に位置を足す |

## C. 正当（設計に合わせた書き換え）
| spec:行 | 変更前 → 変更後 | 根拠 | 判定 |
|---|---|---|---|
| band-layout.spec:259〜276, 299 | 設定 x20・検索 x484 → 設定 x20・検索 右から20、y19、切替 x(W-220)/2・y23・220×36 | D32 §5-5、VR △8、S2 の実測 | 正当 |
| open-portrait.spec:39〜48, 182 | 同上（y24→19 を含む） | 同上 | 正当 |
| focus-modes.spec:135 | 設定・検索・切替の位置（上記） | 同上 | 正当（B の要確認あり） |
| layout-metrics.spec:44,49,75,80 | grid-top 106→146（safe 上 100 は 124→164） | D22 §5「マスは y146〜」、S2（見出し y82〜126・曜日 20） | 正当 |
| layout-metrics.spec:179,228〜246 | 置く件数 3→4、5→6、「大」の件数 4→5/2→3 など、+N の件数 | VR H-05・D33 §1（+N は日付の行の右、段は全部名前）。件数は cap−1→cap で一致 | 正当 |
| chip-style.spec:10,13,38,48,50 | 開いた横の文字 9.5→9pt、閉じた月の型は 16・10pt、角丸 3.5→3 | VR H-04（9pt W6・角丸 3）、D33 §1（チップ 2段×18＝高さ 16、10pt W6、角丸 3） | 正当 |
| chip-style.spec:63,71 | レーン先頭 19→18（許容 18〜20） | D33 §5・VR H-06（日付の行 18） | 正当 |
| closed-tabs.spec:109,114 | `.mday` → `.mpull` の末尾、最後の行 ≤ タブの上端 → ちょうどタブの上 8（±1。上限だけでなく下限も追加） | D33 §2・§5（1 本スクロール、下の余白 87、最後の行はタブの上 8） | 正当（厳しくなった） |
| closed-tabs.spec:206,212 | 開いた縦のホームは `.phome`（週では `.hero, .phome` が無い） | D32 案A | 正当 |
| layout.spec:57,60 | `.mday` → `.mpull`、`≤ tabs.y -8 +1`（上限のみ） | D33 §2。下限は closed-tabs.spec:114 が見ている | 正当 |
| month-all.spec:32,200 | 新しい端末の既定 手帳 → 予定名 | VR H-04 | 正当 |
| month-all.spec:59 | 閉じた画面の +N 文字 9→8pt | D33 §5（8pt W6） | 正当 |
| month-all.spec:71,78,80,84,128,224 | 日付の行 19→18 に伴い 101→100、19+→18+、レーン位置 -19→-18 | D33 §5、VR H-06 | 正当 |
| month-all.spec:287,299 | 月の型 6行×50(300) → 6行×64(384) | D33 §1 | 正当 |
| month-all.spec:326,420,449 | 開いた縦の「全部」は上下 2 つの窓（`.alwin.alb`）。末週は下の窓の下端に届く（`gap≥-1`、`over` は窓の分を引く） | D22 §5・S2 #21、open-portrait.spec:161 も同じ | 正当 |
| month-pull.spec:16,47〜74 | `--sar:84px` の `band()` を足し、型「月」を 6行×64、名前 2 件＋「+3」、1週・2週は 4 件＋「+1」、+N の位置（日付の行の右・8pt・右 2・44×44）、格子 x8〜374・マス 52.3 | D33 §1・§5、VR H-05/H-21 | 正当 |
| month-pull.spec:97〜106 | ドラッグ +100→+160、離すと 300→384 | D33 §1（型の高さが 384） | 正当 |
| month-pull.spec:146〜 | 「スクロールで 1週に縮む」→「縮まない、固定は見出し 48＋曜日 20 だけ、流れ切ると『12日（木）』が出る、戻すと消える」。1週・2週・月の 3 型で確認 | D33 §2（22 §2 の置き換え） | 正当（置き換えで、検証は増えた。旧テストの削除は D33 §0 の指定） |
| month-pull.spec:280〜290 | 開いた縦 669×951 の件数 5→6、12→13、1→2、+N 10→9 など | VR H-05（段は全部名前） | 正当 |
| month-pull.spec:330,343 | `.mday` の scrollTop 300 → `.mpull` で 80+24+300、閉じた画面でも同じ位置 | D33 §2「位置を覚える」 | 正当 |
| ref-layout.spec:44,88,97 | 保つ表現が portrait のときだけ named、件数 1→2、+4→+3 | VR H-04（既定 予定名）、D33 §1（名前 2 件）。portrait は setStyle('手帳') を呼ばないので既定 named | 正当 |
| rokuyo.spec:26〜38 | 六曜の色 #A8ABA4→#68716A（W6）、前後の月は #8C918A、位置 左3 → 閉じた x+21／開いた x+26、日付の右、日付の行（top≤1.5・高さ≤18.5） | VR H-06・M-19、D33 §5 | 正当（11/01 だけ位置を飛ばすのは「11/1」の月つき表記のため） |
| rokuyo.spec:52〜57 | +N の範囲を 44×44 ではなく文字の範囲で比べる。六曜は日付の右、+N は六曜の右 | D33 §5（押せる範囲 44×44 は文字と重なる設計） | 正当 |
| pages.spec:69〜80,200 | 下のタブ 240×46・48 → 320×40・64 | VR M-03 | 正当（B の pill に注意） |
| edit-sheet.spec:55 | 長さのチップ 1 行 → 2 行（top が 2 種） | VR H-10 | 正当 |
| datetime.spec 他（direct-input:251、home:52、portrait-fold-timeline:134、timeline:217、plus 他） | `09:00`→`9:00`、`00:55`→`0:55`、`.nowt` 角丸 11px→999px（高さ 22 のまま＝同じ丸） | VR L-04（時刻は先頭の 0 なし）。保存値は 09:00 のまま | 正当 |
| popup-dismiss.spec:55〜65,172 | 幕 0.2→0.25 秒、シートは `animation`（0.25 秒）、角丸 22→24 | D25 §速度表「0.25 シートの出入り」、S5 M-10（角丸 24） | 正当 |
| settings-hierarchy.spec:18 | メニュー角丸 22→24 | 同上 | 正当 |
| dated-notes:86、direct-input:298,489、swipe:122、timeline:180、search-backup:139 | Escape の後に `toBeHidden()`（0.25 秒の閉じる動きの後に次の操作） | D25（シートの出入り 0.25）。固定 sleep でなく状態待ち | 正当（待ちを増やしたが状態待ち） |
| helpers.js:5 | `bodyIs`（contenteditable の `e.value` を `expect.poll`） | S3。`toHaveValue` と同じ文字列を同じ厳しさで比較。正規表現も可 | 正当 |
| note-sheet / notes-checklist / notes-editor / memo / memo-mark-list-search / tt-spread の `bodyIs` | `toHaveValue` → `bodyIs` | 同上 | 正当 |
| notes-checklist.spec:57 | チェック四角 22→20 | VR H-14 | 正当 |
| memo.spec:148〜162 | `test.fixme` を外し、本文の中心が書式バーに覆われない確認を追加、y106→146 | S3 FIX1、D22 §5 | 正当（検証が増えた） |
| helpers.js:43 | 全 spec でシートの出る動きを止める style を足す | D25（0.25 秒）の動きは press-sheet-type-s4.spec と popup-dismiss.spec:60 が `motion:true` で確かめる。閉じる 0.25 秒の待ちは変わらない | 正当（ただし動きを見る spec が 2 か所だけなのを承知） |
| helpers.js:45 | `duo.dev=1` を既定で立てる | VR H-16/H-17。隠れることは s5-fixes.spec が `nodev:true` で確かめている | 正当 |
| move-to-day.spec:37, paste.spec:41 | `setAccessoryBarVisible` を書き込み扱いから外す | S3（キーボード上の棒、書き込みでない） | 正当 |
| move-to-day.spec:175 | 時間軸からの落としの 2 件を追加 | R-49、S2 | 正当（追加） |
| reminder-tasks.spec:48 | 今日の期限は `overdue` でなく `before` の見出し | VR M-17 | 正当 |
| tt-spread.spec:213 | ノート欄の空の日は「この日のノートを書く」 | VR M-06 | 正当 |
| curl-painter.spec:171 | 省略の判定を `.tlev` から内側の `.tn` へ | `.tlev` の中に `.tn` の入れ子ができた（app.js:1435、M-09）。判定の厳しさは同じ | 正当 |

## D. 件数減・expect 削除・skip・force の点検
- expect の削除: focus-modes.spec:135（予約の確認 → 位置の確認、B 参照）、band-layout.spec:272/276（同）、layout-metrics.spec:257（時刻つき aria-label、A）、open-portrait.spec:48（予約）、month-all.spec:485（B）。それ以外に黙って消えた expect は無い。
- toBeCloseTo → toBeLessThanOrEqual: pages.spec:78（B。M-03 は幅が決まっている）。timeline.spec:129 は下限を下げただけ（B）。ほかの `≤` の増加は新しい基準（D33 下の余白、つまみの 8、…）の追加で、等号を緩めたものではない。
- 件数を減らした: layout-metrics・ref-layout・month-pull の件数の増減は、段数の設計変更（H-05）で説明がつく（+N が段を使わない）。
- skip・fixme の追加: 無し。force:true の追加: 無し。
- 待ちの追加: month-pull.spec の固定 sleep（150〜300ms）は、フェード 0.15 秒・寄せ 0.25 秒の後の計測のため。`expect.poll` に直せるが緩めてはいない。
