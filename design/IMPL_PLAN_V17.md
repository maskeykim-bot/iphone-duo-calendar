# 第17版 実装計画（Claude Code：1回に1PR）

基準は main `fba9b14`（第16版、実機 SW v139、IndexedDB v5、バックアップ v5）。征希さん了承（t125u・t126u）。

| 番号 | 題名・範囲 | SW |
|---|---|---|
| PR1 | ノートに date を足す（IndexedDB v5のまま） | v140 |
| PR2 | ノート見出しの「日付 ›」と一覧の日付 | v141 |
| PR3 | 月の印・日で絞る・長押し「この日のノート」 | v142 |
| PR4 | なぞった枠を同じ日の中で動かす | v143 |
| PR5 | 枠の取っ手の当たり・✕・VoiceOver | v144 |

## 共通の前提と引き渡し

- PRは表の順に直列。各節のファイルは `app/` 相対。各PRで `sw.js/CACHE` を直前から+1し、`tests/sw.spec.js` を合わせ、新設JSがあれば `ASSETS` に登録する。`npm run test:unit`（東京・NY）と関係 Playwright spec（必ず `sw.spec.js` を含む）を成功させる。全件は指揮役が最後に回す。
- **保存は IndexedDB v5 のまま**（SCHEMA_VERSION を上げない、`date` 索引は足さない）。バックアップ SCHEMA も 5。既存レコード・予定・メモは消さない。`sourceDate` は書き換えない（古いバックアップを戻したときの重複判定に使う）。
- ノートの `date` は `'YYYY-MM-DD' | null`。1ノートに日付は1つ（付けなくてもよい）。
- **1日1ノートの制限は、新しく日付を付けるときだけ**。移したメモが同じ日に複数あっても消さず残す。既にある重複は一覧・月の印・絞り込みに全部出す。
- 衝突（付けようとした日に、自分以外のノートがすでに `date` を持っている）: そのノートを開くか、付け替え（相手の `date` を外して自分に付ける。相手は消さない）を確認する。複数件（移行の重なり）がある日は、開く操作ではその日に絞った一覧を出す。
- 移したメモは最初から `date = sourceDate`。利用者が日付を外しても `sourceDate` は残す。
- バンドル ID `com.maskeykim.duocalendar` は変えない。新しい Swift ファイルは作らない。`ios/App/App/public/` は手編集しない（`build:www` のみ）。
- 正本: `/workspace/duo-calendar-team/design/19-drag-move-and-dated-notes.md`、`qa/bug-v16-feedback-2026-11-17.md`（V16-1, V16-2）。連携_第12弾は date の意味と sourceDate を残す理由だけ採用し、**v6 への版上げは採用しない**（指揮役決定）。

## PR1：ノートに date を足す（IndexedDB v5のまま）

- やること／ファイル・関数：
  - `js/notes-model.js`（新設関数）: `noteDateOf(n)`（`'date' in n` なら `date`（不正は null）、無ければ `sourceDate ?? null`）、`dateOccupants(rows, date, exceptId)`（`deletedAt` のある行は数えない。`noteDateOf` が一致し `id !== exceptId` の配列）。`noteFromMemo` に `date: m.date` を足す（`sourceDate` は今どおり `m.date`）。
  - `js/db.js`: `SCHEMA_VERSION` は 5 のまま。`validateNote` が `date` を正規化する（`null` か YYYY-MM-DD。`'date' in n` が偽なら `sourceDate ?? null` を入れるが、明示の `null` は `sourceDate` で上書きしない）。`patchNote` が `date` を受け付ける（本文・updatedAt は変えない）。コメントの Note 形に `date` を追記。
  - 任意の一括書き戻しを入れるなら、設定ストアの既存の一度きり印の流儀に合わせ、失敗時は印を付けず次起動で再試行。ノートを消さない・`sourceDate` を変えない。無くても `noteDateOf` で画面は正しい。
  - `js/notes.js`: `setMeta` / `getMeta` に `date` を含める。
  - `js/backup.js`: SCHEMA は 5。`exportNote` に `date: noteDateOf(n)`（null も出す）。`checkNotes` で `date` は無い・null・YYYY-MM-DD のみ。無いときは `date = sourceDate ?? null`。v4 以前の memos からの移しにも `date = memo.date`。
  - `js/search.js`: 検索対象を `sourceDate` から `noteDateOf(n)` に替える（sourceDate だけの行もヒットし続ける）。
- 移行：版上げなし。既存ノートは読んだとき `noteDateOf` で日付が付いて見える。レコードは消さない。
- JS↔Swift：なし。
- テスト／読み替え：`test-unit/notes-model.test.mjs`（移したノートは `date === sourceDate`。指紋 `digestOf(sourceDate, memoTextOf)` は変えない）、`notes-db.test.mjs`、`notes-backup.test.mjs`（export 往復で date が残る、v5 の date 無しファイルは `date = sourceDate ?? null`、同じ sourceDate の複数ノートを戻しても件数は増えない、明示 null は sourceDate があっても null のまま）、`notes-store.test.mjs`、`search-notes.test.mjs`。関係 spec: `sw.spec.js`。
- 完了条件：SCHEMA_VERSION も backup SCHEMA も 5。移したメモに date が付き、sourceDate は不変。既存データを消す処理が無い。

## PR2：ノート見出しの「日付 ›」と一覧の日付

- やること／ファイル・関数：
  - `js/app.js` の `paintNoteMeta` / ノート見出し: 「フォルダ ›」の右に「日付 ›」（見た目 110×28、押せる高さ 44）。未設定は「日付 ›」、付いているときは「11月18日（水）›」。たたくと 12 の日付カプセルと同じ小さな月を出し、日を選ぶ。月の下に「日付を外す」。
  - 衝突: 選んだ日に自分以外のノートがある（`dateOccupants`）とき、小さな確認を出す。「この日にはすでにノートがあります。」と、ボタン「そのノートを開く」（1件ならその編集、複数ならその日に絞った一覧）、「このノートに付け替える」（相手の `date` を null にし、自分に付ける。相手の本体は消さない）、「やめる」。
  - 一覧2行目: `直した日 ・ フォルダ ・ 11/18` のように `noteDateOf` の日付も出す。日付チップ（`.nsrc`）は `noteDateOf` があるときに出し、たたくとその日を開く（これまで sourceDate だけだったのを date に替える。チップの見た目は流用可）。
  - `app.js:3106` など sourceDate を表示・絞りに使っている所を `noteDateOf` へ。
  - CSS は既存の `.nmeta` を拡げ、日付ボタンと小さな月・確認の寸法を 19 §2 に合わせる。
- 移行：なし（PR1 の date を使う）。
- テスト／読み替え：新設または拡張 `tests/notes-editor.spec.js`（日付の付け外し、衝突で開く・付け替え、明示 null のあと sourceDate が残ること）。一覧の日付は `tests/memo-mark-list-search.spec.js` と `tests/notes-folders.spec.js` を必要なら読み替え。関係 spec: `notes-editor.spec.js`, `memo-mark-list-search.spec.js`, `sw.spec.js`。
- 完了条件：見出しから日付を付け外しでき、衝突時に既存ノートを開くか付け替えを確認できる。ノートは消えない。

## PR3：月の印・日で絞る・長押し「この日のノート」

- やること／ファイル・関数：
  - 月のマス（`weekInner` 等）と小さな月（`miniMonth`）: `noteDateOf` のある日の数字の下に 12×2 の線（旧 `.mline` を復活。色は 10 §5 の #8A7E5C、位置はマス上端から y15.5〜17.5、数字の中心。19 の「緑の線」は同じ印を指す）。件数は出さない。削除済みは数えない。複数件ある日も線は1本。
  - 開いた横で左が月・右がノートのとき、月の日をたたくと右の一覧をその日のノートに絞る。一覧の上に「11月18日（水）のノート ✕」（高さ 28）。✕ で絞りを外す。札の右の「＋」: その日にノートが無ければ、1行目が `dailyHeading(date)` の新しいノートを「日ごとのメモ」フォルダに入れて `date` を付けて開く。1件あればそれを開く。複数（移行の重なり）があれば新たに作らず一覧のまま。
  - 時間ページの日見出し（`dateHead`）の右に「ノート n」チップ（高さ 22）。n はその日の件数。0 件でも出してよい（「ノート」だけでも可）。たたくと右ページをノートにし、その日に絞る。
  - 月の日を長押しして同じ日のまま離したとき（期間ドラッグにならない1日）: 終日予定のシートをすぐ開かず、小さなメニュー（チップメニューにならう。幅160・行44・角丸12）に「終日の予定」と「この日のノート」を出す。「この日のノート」は上の「＋」と同じ規則（0件=新規、1件=開く、複数=その日に絞った一覧）。複数日をなぞったときは今どおり期間の予定シート（ノート項目は出さない）。
  - `tests/memo-mark-list-search.spec.js` の「月のマスにも帯にもメモの線は出ない」は仕様変更として更新する（移したメモには date が付くので線を出す。帯の旧メモ印 `.cmemo.has` は出さないままでよい）。削除や skip で隠さない。
- テスト／読み替え：新設 `tests/dated-notes.spec.js`（印、絞り、＋の衝突、長押しメニュー、複数の移行メモが残ること）。既存 `memo-mark-list-search.spec.js`, `memo.spec.js`, `direct-input.spec.js`（1日長押しがメニューになる点を読み替え）。関係 spec: 上記と `sw.spec.js`。
- 完了条件：印・絞り・長押しの3経路が同じ date につながる。移行の重なりは残る。新しい付け方だけが1日1件。

## PR4：なぞった枠を同じ日の中で動かす

- やること／ファイル・関数：
  - `js/direct-input.js` に純関数 `moveBox(r, minutes)` を新設。長さ（end-start）はそのまま、開始を 15分刻みに合わせ、0:00〜24:00 の外に出ないよう clamp（はみ出す分は開始をずらす。長さが1日を超えることは無い前提、最小15分は維持）。
  - `js/app.js` の仮枠（`DF.mode === 'temp'`）: 枠の内側（取っ手の外側）を押したまま上下に引くと、`moveBox` で枠ごと動く。指を離すまで確定しない（編集シートは開かない）。動いた距離が 8pt 以下ならたたきとみなし、今どおり `openDraft`。8pt 超なら離してもシートは開かない（仮枠は残る）。
  - 引いている間、左の時刻札（既存 `.dtag`）が上端・下端に付いて動く。15分刻みが変わるたび `feel('light')`（selection）。5分刻みにはしない。
  - 画面の上端・下端から 48 以内まで引くと時間軸を自動送りする（目安 1秒で約1時間。既存 `edgeLoop` を流用し、この操作だけ edge=48・速度は 1時間/秒相当。長押しなぞり作成の EDGE=40 / 120pt/秒は変えない）。動かしている間、時間軸の通常スクロールは止める。
  - 横の日へは動かさない（`DF.day` は変えない）。開いた横の左右、閉じた画面の時間表示でも同じ。
  - 取っ手で長さを変える今の動きは残す（当たりの詳細は PR5）。
- テスト／読み替え：`test-unit/direct-input.test.mjs` に `moveBox`（15分、0:00/24:00 の端、長さ維持）。`tests/direct-input.spec.js` に仮枠の移動・8pt 以下はシート・端ではみ出さないこと。関係 spec: `direct-input.spec.js`, `sw.spec.js`。
- 完了条件：同じ日の中だけで枠が動き、たたきと移動が切れ、作成用の長押しドラッグは壊さない。

## PR5：枠の取っ手の当たり・✕・VoiceOver

- やること／ファイル・関数：
  - 上下の丸: 見た目の直径 14（今は12なので 14 に合わせる）、押せる範囲 44×44 は維持（`.hdl:before`）。丸の中心から 16pt 以内で押したら長さ変え、それより内側は移動。枠の高さ（`--d * hh / 60`）が 60 未満のときは、丸の押せる範囲を枠の外側に寄せ、内側は移動に使う。
  - 枠の右上に「✕」（見た目 20、押せる 44）。たたくと取り消し（`clearDraftBox`）。枠の外をたたいても取り消し（今と同じ）。
  - VoiceOver: 仮枠にカスタム操作「15分早く」「15分遅く」「15分長く」「15分短く」（`moveBox` / `moveHandle`）。
  - 当たり判定はできれば純関数（例 `hitDraftPart(box, y, handlePts)` を `direct-input.js`）にして単体テストする。
- テスト／読み替え：単体（16pt の境、高さ60未満）。`direct-input.spec.js` に ✕、取っ手と移動の切り分け。関係 spec: `direct-input.spec.js`, `sw.spec.js`。
- 完了条件：短い枠でも移動でき、取っ手と移動が取り違えにくい。VoiceOver で15分単位に動かせる。

## 見送るもの

- 枠を翌日・隣の日へ動かすこと（週表示は後回し。指揮役決定）。
- 15分より細かい枠の移動（編集シートの時刻カプセルで直す。19 §1）。
- IndexedDB / バックアップを v6 に上げること（指揮役決定。第16版が date を黙って捨てる可能性は残る。v5 のまま date を項目として出し入れする）。
- 既存の同じ日の複数メモを自動で1つにまとめること（消さない）。

## Xcode の手作業

なし（www 同期と実機配備は指揮役）。

## QA（実機）

- V16-1: 仮枠をつかんで15分刻みで動く。札が追従し、15分ごとに軽い振動。0:00〜24:00 の外に出ない。取っ手は長さ、内側は移動。たたきはシート。開いた横左右・開いた縦・閉じた時間。
- V16-2: 「日付 ›」・日のタップで絞る「＋」・長押し「この日のノート」で日付が付く。1日に新規は1つ。既にある日は開くか付け替え確認。移したメモの重なりは残る。月の線、時間見出しの「ノート n」。
