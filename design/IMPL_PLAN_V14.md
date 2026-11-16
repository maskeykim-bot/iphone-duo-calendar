# 第14版 実装計画（Claude Code：1回に1PR）

| 番号 | 題名 | 資料の対応PR |
|---|---|---|
| PR1 | 六曜の表と検証済みデータを導入する | 第5弾 PR1・PR4の資産登録 |
| PR2 | 六曜の表示設定を保存する | 第5弾 PR2（バックアップはPR10） |
| PR3 | 月と日の見出しに六曜を表示する | 第5弾 PR3 |
| PR4 | 左右ページの状態と描画を分離する | 10 §3、第4弾 PR9のページ状態 |
| PR5 | 左右ページの切替と時間の表示を作る | 10 §3.1、第4弾 PR9の切替 |
| PR6 | 共通の日付移動と小さな月を作る | 10 §3.2 |
| PR7 | 開いた縦に下パネルの土台を作る | 10 §6 |
| PR8 | 日付メモの保存領域を追加する | 第4弾 PR1 |
| PR9 | メモ編集と自動保存をつなぐ | 第4弾 PR2の保存 |
| PR10 | メモと表示設定をバックアップに含める | 第4弾 PR3、第5弾 PR2の残り |
| PR11 | メモの印と一覧と検索を追加する | 第4弾 PR2の印・一覧、PR4 |
| PR12 | リマインダーの許可とリスト取得を作る | 第4弾 PR5のネイティブ |
| PR13 | タスクページに許可の案内を出す | 第4弾 PR5の画面 |
| PR14 | リマインダーの一覧取得を実装する | 第4弾 PR6のネイティブ |
| PR15 | タスクの分類と完了履歴を表示する | 第4弾 PR6の画面 |
| PR16 | リマインダーの追加処理を作る | 第4弾 PR7の追加API |
| PR17 | タスクを続けて追加できるようにする | 第4弾 PR7の追加画面 |
| PR18 | タスクの差分更新と完了処理を作る | 第4弾 PR7の更新・完了API |
| PR19 | タスクの編集と完了の操作をつなぐ | 第4弾 PR7の編集・完了画面 |
| PR20 | タスクの削除と四秒の取消を作る | 第4弾 PR7の削除 |
| PR21 | タスクの通知を期限に合わせる | 第4弾 PR8のネイティブ |
| PR22 | タスク編集に通知の選択を追加する | 第4弾 PR8の画面 |
| PR23 | タスクのリスト設定と月の件数を作る | 第4弾 PR9のリスト・件数 |
| PR24 | 長押しとドラッグの共通制御を作る | 10 §1・§2の操作土台 |
| PR25 | 時間軸のドラッグから予定を入力する | 10 §1の枠・シート |
| PR26 | 月のドラッグから期間予定を入力する | 10 §2 |
| PR27 | 直接入力の端スクロールと触覚を仕上げる | 10 §1・§2の端操作・Pencil |
| PR28 | コピーする予定の型紙と貼付計画を作る | 第6弾 PR1 |
| PR29 | ネイティブで予定をまとめて追加する | 第6弾 PR2の型A |
| PR30 | iPhone予定を出席者なしで複製する | 第6弾 PR2の型B |
| PR31 | 貼付結果と失敗分の再試行をまとめる | 第6弾 PR3 |
| PR32 | 貼り付けた予定を六秒以内に取り消す | 第6弾 PR4 |
| PR33 | コピー開始と貼る日の選択画面を作る | 第6弾 PR5の入口・選択 |
| PR34 | 貼付の見本と失敗画面を仕上げる | 第6弾 PR5の見本・確定 |
| PR35 | 前面で通知が鳴ったら予約を補充する | 第6弾 PR6のwillPresent |
| PR36 | 通知を更新する最後のお知らせを予約する | 第6弾 PR6の最後の枠 |

## 共通の前提と引き渡し

- 基準は依頼指定 main `d47e80c`、実機はSW v39。git操作・push・公開・秘密情報の参照はしない。本計画作成で書くのは本ファイルだけ。他プロジェクトの指定資料・画像は読み取りのみ。コード変更と試験実行は後続実装担当の作業。
- PR1→PR36を直列に実装。1本は実装作業約20〜30分を目安とし、各PR単独で `app/` の `npm test` と `npm run test:unit`（東京・NY）を全成功。既存skip/todoは報告し、新設skip・force click・assert削減で通さない。
- 各PRの共通変更先は `app/sw.js` のCACHEと該当テスト。版は **PRn＝v(39+n)**、PR1 v40〜PR36 v75。新規実行モジュールは導入PRでASSETSへ登録し、`tests/sw.spec.js` のオフライン起動も確認する。
- 第4弾PR10・第5弾PR4・第6弾PR7の **最終www同期／最終SW版上げはPRにしない**。指揮役が最後に担当し、各PRのSW増分とは別扱い。実装PRではwww・iOS public生成物を直接変更しない。
- 実在するビルドは `app/scripts/build-www.mjs`（`app/build-www.mjs` ではない）。現在の一覧は `js` 全体を再帰コピーするので新JSも既に対象。導入PRでこの一覧の包含を確認し、fixturesを配布しない。個別JSの重複コピーは足さない。
- 正本はチーム資料の10と該当5画像（pages-spread-month-task、pages-spread-time-memo、panel-open-portrait、rokuyo-spread、paste-spread）。データは第4〜6弾、研究、六曜成果物、QA全文を参照。行番号は使わず、下記の現行関数を接続点にする。新設する関数は「新設」と記す。
- 研究の複数メモ／検索延期、旧資料の未決事項よりオーナー決定を優先：1日1メモ・検索あり・タスクのローカル保存なし・六曜既定オン。図／確認欄の「メモの点」は**日付下の短い線**と読む。閉じた画面の4タブ置換は10 §7の案なので今回は行わず、既存一覧・日・週・月を維持する。
- ext＝iPhone由来の予定、linked＝Duo由来でiPhoneと結びつく予定。V13の詳細→編集、差分上書き、削除競合確認、URL・未操作通知の保持、requestId・outboxを維持。タスクはメモリのみ、outbox・バックアップへ入れない。
- 以下の「橋なし」はJS↔Swift変更なし、「偽装据置」は製品 `native.js` とPlaywright偽装の拡張不要を意味する。`native.js` 自体に偽装はなく、汎用 `call/listen` の先の `window.Capacitor` を `tests/native.spec.js` の `mock()` 等で偽装している。API追加時は共通fixtureへ抽出し、既存ext・通知の偽装でも未知メソッドにならないよう更新する。
- Swiftは既存 `app/ios/App/App/DuoNativePlugin.swift` 内に追加し `pluginMethods` に登録、既存EventKit queueで直列化。バンドルID `com.maskeykim.duocalendar` 不変。JSON型のnumberはSwift Double／Int、stringはString、boolはBool、nullはNSNull。MS＝Unixミリ秒、Day＝YYYY-MM-DD、Stamp＝端末ローカルYYYY-MM-DDTHH:mm。JS偽装の成功をSwiftの実証とは扱わない。

## 維持する寸法と試験の基準

- `app.js` の `measureL/safe/updateLayoutMetrics/vpTick` を維持。安定寸法W,Hとsafe T,R,B,Lsを使い、キーボード中はLを保持。右本文端W−Rに旧rail幅を二重控除しない。R≥56で帯、未満は既存fallback。折り目f=W/2±10は描画禁止、44角hit（帯56角）と非重複を維持。
- 現行横月はV12本文の旧G=573qではなくV13／現行式：q=(H−T−B)/669、tabsTop=min(T+611q,H−B−46)、gridTop=T+96q、gridBottom=tabsTop−8q（基準y603）。左[ Ls+8,f−10 ]、右[ f+10,W−R−16 ]を各ページの利用境界にする。
- 横の各ページ切替は幅240・高46、各60、選択54×36、基準top611。左右それぞれの利用幅の中央（図x236.5／671付近）へ置き、旧270幅を読み替える。時間・タスク・メモの末尾余白64、月は上記下端。右に月を移してもそのページ幅÷7と同じ高さ式で計算する。
- 縦の通常月はhead=max(T,82)、gridTop=head+24、gridBottom=H−B−71p、p=(H−B)/951。下パネル表示時は基準y520〜873、gridBottom=520、内容580〜873、メモ罫線588〜。可変サイズでは通常gridの高さ比414/774を用い、下端を既存controlsTop−8pへ置く。6／5／4週の上限3／3／5、収まらない場合は減らし+N。キーボード中の拡大は可視V内で行いLを変えない。
- 既存 `tests/helpers.js` のtab等は姿勢・ページを明示して拡張。`closed-tabs` は維持、`timeline/open-portrait/layout-metrics/ref-layout/band-layout/safe-layout/month-all/swipe/screenshots` は変更箇所だけ新期待へ。月レーン・全表示仮想化・週アンカー・チップの塗り・文字切り・外側閉じ・touch-checkは維持。
- 各画面PRは466×678、669×951、951×669、旧626×890／890×626、safe0／R84／T82、R47/56境界、非対称safeで数値・elementFromPoint・実tapを確認。light/dark、4/5/6週、月曜/日曜、回転・開閉・入力中も確認。画像は合成データで既存shot方式、PR番号と姿勢を名前に入れる。

## PR1：六曜の表と検証済みデータを導入する

- 作業／ファイル・関数：チーム `data/rokuyo/app-proposal/` の `rokuyo-table.js/rokuyo.js` を `app/js/`、`rokuyo.test.mjs` を `app/test-unit/`、同proposalのfixtures2件を `test-unit/fixtures/` へ配置。`rokuyoOf` は日本旧暦・2000〜2050、範囲外／不正はnull、2033は閏11月。
- 橋なし・偽装据置。テストの**両importとハッシュ読取先**を `../js/` に変更し、表のバイトは変えない。検証済SHA256は `b0612a2626e1eb4bd7694fef40c1baecbcaa246ad1c0a975f4e7f09f41f60a20`。
- 読み替え／追加：sw.specに2モジュールのキャッシュを追加。全18,628日、NAO独立fixtureとの2,191日、閏境界、不正、ハッシュ、性能200ms未満を既存テスト案で確認。東京・NYに加え±日付境界TZも同じ値。
- 完了：RK-3/4/5/6/7/8のデータ側を固定、JSディレクトリのビルド対象を確認。画面変更なし、共通チェック成功。

## PR2：六曜の表示設定を保存する

- 作業／変更先：`app/js/app.js` の `loadUi/saveUi/openMenu/syncModeMenu`、`app/index.html` の表示設定、`app/css/app.css`。`rokuyo` はbooleanのみ、未保存・破損・欠落はtrue。44高の行、51×31のスイッチ、10 §6.5の説明。
- 橋なし・偽装据置。バックアップv4への接続はPR10へ渡し、このPRではUI保存だけを完結させる。
- 読み替え／追加：既存persist・設定テストに既定／false保持／壊れた値／再起動を追加。既存月時刻・大文字設定の保存値を落とさない。
- 完了：開閉・回転後も設定保持、既存設定全件と共通チェック成功。

## PR3：月と日の見出しに六曜を表示する

- 作業／変更先：`app.js` の `weekInner/weekRow/chead/shead/rightHead/timelineHtml`、CSS。共通の六曜断片（新設）を使用。月は左3・8pt、前後月薄色、1日はオン時11/1、日見出しは間8・13pt、週は9pt。小さな月には出さない。
- 橋なし・偽装据置。日付→六曜→件数のaria-label、見た目の六曜はaria-hidden。2026/11/1赤口・11/9仏滅・11/16大安を表から得る。
- 読み替え／追加：ref-layoutの月初文字列とaria期待をオン／オフ別に。新規rokuyo.specで全姿勢・範囲端・NY・オフライン・pageerror0、数字／+N／チップとの非重複。
- 完了：RK-1/2/5/7の現存画面を満たす。新ページの日見出しはPR4〜7が同断片を再利用。

## PR4：左右ページの状態と描画を分離する

- 作業／変更先：新規 `app/js/pages.js` に `normalizePages/selectPage`（新設）、`app.js` の `loadUi/saveUi/spread/rightWidth/timelineHtml/initTimeline/render`。`pages={left:'month',right:'time',portraitBottom:'time',portraitShown:false}` を既定、同種選択は交換。描画をページid付き `renderPage`（新設）へ抽出。
- 月・時間の既存表示を同じに保ち、左右の時間軸の幅・スクロール・now線をペイン単位へ。タスク／メモは実装待ちの説明のみ、保存先を捏造しない。橋なし・偽装据置、pages.jsをSWへ。
- 読み替え／追加：旧home/viewは閉画面・縦の従来表示用に保持。pages単体で重複・不正値・交換、timeline既存で抽出前後の寸法とスクロール一致。
- 完了：初期の月｜時間が回帰せず、後続が左右を決め打ちせず描画できる。

## PR5：左右ページの切替と時間の表示を作る

- 作業／変更先：`app.js` の `tabs/spread/ctl/rightHead` とrootのdata-act処理、`pages.js`、CSS。左右各「月｜時間｜タスク｜メモ」、最後に触ったページを記録し＋の行き先を分岐。月／時間は予定、他2種はPR9/17で入力へ接続するまで説明へ。
- 時間カプセルを1日・3日・週・一覧（幅120、行44）へ。週・一覧もそのペイン内で描き、旧「週で左右を分割」を読み替える。閉画面の既存タブは維持。橋なし・偽装据置。
- 読み替え／追加：helpersにpage選択／timeMode操作、timelineの旧tl3トグル期待をメニューへ。全12組合せ、交換、左右の時間・右月、再読込、＋の行き先、64余白・折り目・240幅を新規pages.specで確認。
- 完了：10 §3.1が全組合せで動き、既存CRUDは適切なページを選んで全成功。

## PR6：共通の日付移動と小さな月を作る

- 作業／変更先：`app.js` の `move/set/rightHead/swipeMove/openNotifyTarget`、`pages.js`、CSS。非月ページの日付・‹ ›・今日を共通選択日へ。週は7日移動、時間／メモの横50ptスワイプは起点ペインで判断、編集中メモは除外。
- 日付タップで280×260の月、40×36の視覚セル（隣接hitは重ねず読み上げ／選択可能）、外側閉じ。メモ線の差込口を作る。橋なし・偽装据置。
- 読み替え／追加：swipe・notify-uiの固定rp選択をページ型で探索。月なしの時間｜メモ等で同期、週送り、日付選択、外側tapの貫通なし、通知タップ時の日付と対象表示を確認。
- 完了：左右の選択日が分裂せず、小さな月は六曜なし。狭幅は既存fallbackの2段見出しで44hitを確保。

## PR7：開いた縦に下パネルの土台を作る

- 作業／変更先：`app.js` の `open/closed/updateLayoutMetrics/monthCfg/monthGridAll`、`pages.js`、CSS。縦上は月、下は時間｜タスク｜メモ、表示ボタン・×・つまみ上下操作、0.25秒、表示状態と種類を保存。時間は既存timelineを再利用。
- 橋なし・偽装据置。月タブ時のみ利用、他タブへ移っても設定は消さない。＋は下パネルが有効ならその種類へ。メモfocus時の拡大口を準備。
- 読み替え／追加：open-portraitの「下段なし」期待は閉状態に限定。panel.specで520境界、6/5/4週3/3/5件、+N、全表示、全セル44以上、表示・閉・回転・保存、safe0とT82を確認。
- 完了：閉状態は既存106〜880に戻り、表示中も最終週と内容末尾へ到達。既存タブと操作ボタンが重ならない。

## PR8：日付メモの保存領域を追加する

- 作業／変更先：`app/js/db.js` の `SCHEMA_VERSION/MIGRATIONS/run` にv4とmemosストア（keyPath:id、date索引）。`getMemo/putMemo/deleteMemo/memoDates/listMemoDays`（新設）。型 `Memo={id:Day,date:Day,text:string,createdAt:MS,updatedAt:MS,ink:null}`、id=dateの1日1件。
- 橋なし・偽装据置。空白だけは削除、日付文字列をUTC変換しない。memoDatesはdate索引の範囲キー、一覧はprevカーソル。既存3ストアは変更しない。
- 読み替え／追加：persist.specで新規／v1/2/3→4、既存予定・カテゴリ・outbox・通知移行保持、端日・範囲・削除・abortを確認。純粋な日付／空白規則はunitへ。
- 完了：旧データを保ってv4へ上がり、再読込でも日付ごとに1件。古いDB版へ戻す操作は試験しない。

## PR9：メモ編集と自動保存をつなぐ

- 作業／変更先：新規 `app/js/memos.js` に `flushMemo/recoverMemoDraft`（新設）、`app.js` の `render/set/boot`・visibility処理、CSS。罫線28、文字16、余白6、説明「自動で保存」、空欄「この日のメモ」。＋でfocus、縦はfocus中y106まで拡大しキーボード終了で戻す。
- 橋なし・偽装据置、memos.jsをSWへ。入力ごとlocalStorage下書き（namespace付き）、1秒debounce、日付／ページ変更・hidden時flush。日付別の保存直列化と世代を持ち、古いackで新下書きを消さず、renderでIME・caretを壊さない。
- 読み替え／追加：memo.specでIME確定・高速日付切替・遅延保存・空への変更・hidden・再起動下書き復元・DB失敗の下書き保持。本文はHTMLエスケープ。既存予定下書きはsessionStorageのまま。
- 完了：1秒後／再起動後に同じ本文、保存失敗を表示し再試行可能。左右・縦の同じ日に同じメモを表示する。

## PR10：メモと表示設定をバックアップに含める

- 作業／変更先：`app/js/backup.js` の `VERSION/SCHEMA/READABLE/buildBackup/checkSettings/validateBackup/planAppend`、dbの `applyImport`、appの `doExport/onPicked/finishImport/renderBackup`。v4にmemos・settings.rokuyo・settings.pagesを格納、タスクは含めないと明記。
- 橋なし・偽装据置。エクスポート／インポート前にメモflushをawait。v1〜3は読める、memos欠落の置換で既存メモ保持、v4空配列なら置換で消す。同日同文は追加なし、異文は空行で連結して1件維持。date/id不一致・重複・不正本文／時刻は読み込み全体を拒否する。
- pages不正はその設定だけ捨て、rokuyo不正はエラー、古い設定欠落は現在値保持。予定・カテゴリ・メモ・outbox更新は1DBトランザクション、成功後にUI設定更新・下書き失効・印キャッシュ破棄。サイズ10MB等は維持。
- 読み替え／追加：backup unitの既定versionを4へ、v1〜3 fixtureは残す。全設定false／全組合せ、v5拒否、同日連結、失敗rollback、未保存メモの書出、タスク不混入をsearch-backup.specへ。
- 完了：RK-8の設定復元とメモ復元を満たし、既存カテゴリ／linkedの読込後処理を維持。

## PR11：メモの印と一覧と検索を追加する

- 作業／変更先：`app.js` の `weekInner/openSearch/renderSearch/hitHtml`、memos.js、`app/js/search.js` の `normalize/highlight/excerpt` を使う `searchMemos`（新設）、CSS。月全姿勢／小さな月に12×2、上端15.5〜17.5、中央の線。保存・削除・importで無効化。
- 一覧カプセルは新しい日順・56行・検索欄。帯検索は別「メモ」段（全期間、200件上限を明記）で本文AND検索し日付へ移動。予定の検索範囲／200件上限はそのまま。橋なし・偽装据置。
- 読み替え／追加：検索の予定件数assertを段で限定。memo/search-backup.specで正規化・XSS・日付遷移・空削除・import後の印・六曜/+N/チップ非重複、一覧56行を確認。
- 完了：メモは必ず検索対象、月の印は点でなく線。全メモ機能が左右・下パネルで使える。

## PR12：リマインダーの許可とリスト取得を作る

- 作業／変更先：Swift `statusString/ensureAccess/listCalendars/hexColor` を参照し `statusString(for:)/ensureReminderAccess/reminderPermission/requestReminderPermission/listReminderLists`（新設）。Info.plistにNSRemindersFullAccessUsageDescriptionとNSRemindersUsageDescription、両方に次行の確定文を設定。
- 「iPhone のリマインダーを Duo カレンダーのタスクとして表示し、Duo でのタスクの追加・変更・完了・削除をリマインダーに反映するために使います。」
- 型つき契約：`reminderPermission({})/requestReminderPermission({})->{status:'notDetermined'|'granted'|'denied'|'restricted'}`、`listReminderLists({})->{lists:ReminderList[]}`、`ReminderList={id:string,title:string,color:string,sourceId:string,source:string,sourceType:string,allowsModify:boolean,isDefault:boolean}`。
- iOS17+ fullAccessToReminders、それ未満requestAccess(.reminder)、notDetermined時のみ要求、直後reset。予定のcheckPermissionは.eventのまま。拒否PERMISSION_DENIED／RESTRICTED。native.jsにタスク専用errText相当を新設、既存予定文言は変えない。
- 偽装／試験：reminderPermをcalendar permから独立、3メソッドと全状態・空リストを追加。既存native.specの起動時request回数を維持。Macビルド＋両OS経路実機、plist完全一致。
- 完了：起動時に新許可要求0回、既存カレンダー許可の回帰なし、共通チェック成功。

## PR13：タスクページに許可の案内を出す

- 作業／変更先：新規 `app/js/reminders.js` に `checkReminderAccess`（新設）、appの `renderPage/initNative`・前面復帰、HTML/CSS。10 §4の説明・許可ボタン、拒否は設定案内、非nativeはiPhoneで利用する旨を表示。
- 橋はPR12型のまま、設定は既存 `openSettings({})->{opened:boolean}`。初回タスクを表示しても状態確認だけ、ボタンだけrequest。カレンダー許可拒否／連携オフと独立。reminders.jsをSWへ。
- 偽装／読み替え／追加：reminderPermissionとopenSettingsの呼出し記録、前面での権限取消、granted復帰、restricted、nativeなし、左右／縦で説明とfocusを確認。既存initNativeの予定権限早期returnから独立した初期化にする。
- 完了：拒否時は入力不可でローカルタスクへ切替なし。他ページは使用可能、共通チェック成功。

## PR14：リマインダーの一覧取得を実装する

- 作業／変更先：Swift `listEvents/msOrNull` を参照し `listReminders/serializeReminder`（新設）。未完了全件＋完了completedSince以降、nil期限も取得。非同期fetchをqueueへ戻し、前要求のtoken取消・世代管理、古いcallもエラーで解放する。
- 型つき契約：`listReminders({listIds:string[],completedSince:Stamp})->{reminders:Reminder[]}`。`Reminder={itemId:string,externalId:string,listId:string,title:string,notes:string,due:null|{date:Day,time?:string},done:boolean,doneAt:Stamp|null,alarms:{at:Stamp}[],alarmsExtra:number,priority:number,recurring:boolean,createdAt:MS|null,modifiedAt:MS|null,readOnly:boolean}`。
- hourなしは日付だけ、TZ付き期限は端末日付へ、書く際は浮いた日付を使う。未知通知はalarmsExtra、priority0〜9、見えない欄は返さない。空listIdsは空結果（「すべて」はJSが全idを渡す）。許可エラーはPR12、取消はCANCELLED。
- 偽装／試験：期限なし／日付／時刻・完了31日前・繰返し・優先度・readOnly・null日時・遅い旧応答・取消を追加。直接callで契約検証、既存listEventsは不変。
- 完了：Macビルド・実機で未完了／完了取得と識別子確認。タスク本文をIndexedDBへ書かない。

## PR15：タスクの分類と完了履歴を表示する

- 作業／変更先：reminders.jsに `loadReminders/groupReminders`（新設）、appの `renderPage/initNative` のcalendarChangedとvisibility。300ms間引き・世代破棄。リスト色、rm:itemId、44／期限あり56行、赤い!、繰返し表示、readOnlyを描く。
- 橋はPR14型、偽装はcalendarChanged送信・取得遅延。分類は期限切れ→選択日→この先→期限なし（createdAt昇順、欠落は題名・id）→完了。期限切れは実際の現在日時、過去の選択日と重複させず、分類外になる既往期限も期限切れへ。完了は初期閉・30日、もっと前で30日ずつ。
- 読み替え／追加：新規reminders unit/specで今日前後の選択、時刻期限、過去選択、未来選択、nil日時、履歴境界、リスト変更中の旧応答、権限取消時のメモリ消去を確認。
- 完了：左右・下パネルで同じ分類、起動・前面・外部変更で更新、完了全履歴を初回取得しない。

## PR16：リマインダーの追加処理を作る

- 作業／変更先：Swift `loadCreated/saveCreated` の方針を使い `createReminder/findReminder`（新設）。本文を保存しない専用UserDefaultsキー、requestId・識別子・SHA256指紋だけ、上限500。URL印は使わない。list既定はOS既定→書ける先頭、送信されたlistIdは再検査。
- 型つき契約：`createReminder({requestId:string,listId:string,title:string,notes:string,due:Reminder['due']})->{reminder:Reminder}`。同requestId同内容は既存を返し、異内容INVALID_ARGUMENT。優先度・繰返し・URL等の入力は不可。通知既定の実装はPR21で追加。
- 偽装／試験：requestId別の作成記録・同id再試行・READ_ONLY／LIST_NOT_FOUND／UNAVAILABLEを追加。実機で保存後の識別子と2回目不変、端末内オフライン保存を確認。
- 完了：Macビルド、共通チェック成功。作成処理はまだUIへ公開せず、通知を含む完成はPR22。

## PR17：タスクを続けて追加できるようにする

- 作業／変更先：reminders.jsの追加制御（新設）、appのページ＋、HTML/CSS。高さ44の入力、選択日の期限チップ／×で期限なし、既定リスト、改行保存後は次を入力、IME変換中Enterは保存しない。
- 橋はPR16型、偽装に保存遅延・応答喪失・同requestId再試行を追加。保存中は同一入力を排他し、失敗で本文を残し、新タスクのrequestIdと再試行を混同しない。追加先なしはdisabled＋理由。
- 読み替え／追加：reminders.specで連打・連続別タスク・IME・失敗・リスト既定消失・＋focus、DB/outbox/backupにタスク0を確認。
- 完了：追加したものがリマインダーから再取得されても二重行にならず、共通チェック成功。

## PR18：タスクの差分更新と完了処理を作る

- 作業／変更先：Swiftに `updateReminder/setReminderDone`（新設）、findReminder共用。最新オブジェクトの変更欄だけ更新、未知のタグ・添付・startDateComponents等を組み直さない。繰返しは完了以外NOT_EDITABLE、readOnlyは全書込拒否。
- 型つき契約：`RTarget={itemId:string,externalId?:string}`、`updateReminder(RTarget & {expectModifiedAt:MS|null,patch:{title?:string,notes?:string,listId?:string,due?:Reminder['due']}})->{reminder:Reminder,conflicted:boolean}`、`setReminderDone(RTarget & {done:boolean})->{reminder:Reminder}`。
- 更新は1秒超の変更を検知し差分上書き＋conflicted、完了は衝突確認なし、戻しも同API。不在NOT_FOUND、externalId複数UNAVAILABLE、無効値INVALID_ARGUMENT。見えない通知はまだ触らない。
- 偽装／試験：patchの省略とnull、同定変更・衝突・繰返し拒否・完了戻しを追加。既存extのexpectModifiedと混同しない。Macビルド、実機で未知欄保持・繰返し完了後の次回を確認。
- 完了：繰返し規則・優先度を書き換えず、最新の非変更欄を保持、共通チェック成功。

## PR19：タスクの編集と完了の操作をつなぐ

- 作業／変更先：reminders.jsに `openTaskEditor/saveTask/toggleDone`（新設）、appのパネル・inert/focus管理、HTML/CSS。予定シートと同じ見た目で題名・期限・リスト・メモ、保存先説明。優先度!のみ、繰返しは表示・完了だけ。
- 橋はPR18型。差分のみpatch、conflictedは指定のリマインダー版お知らせ。不在は削除済み案内で再作成しない。完了は即nativeへ送り、1.5秒後に完了段へ移す。再tapの順序を直列化、失敗は表示を戻す。
- 偽装／読み替え／追加：reminders.specで即保存と1.5秒の視覚、素早い完了戻し、遅い応答・再取得競合・差分上書き・権限取消・繰返し/readOnlyを確認。既存予定シートのdismiss試験は維持。
- 完了：全ペインで編集・完了を操作可能。実機でサブタスク／タグ等が消えないことを別途確認。

## PR20：タスクの削除と四秒の取消を作る

- 作業／変更先：Swift `deleteReminder`（新設）、reminders.jsの遅延削除、appの `notice` を期間指定可能にし既存4秒を既定維持。左スワイプ／シート削除で即非表示、4秒取消、hiddenで即native削除。再作成による取消は禁止。
- 型つき契約：`deleteReminder(RTarget & {expectModifiedAt:MS|null})->{deleted:true,missing?:boolean}`。最新が変更済みならCONFLICT、forceなし。不在は成功。繰返し／readOnly削除はNOT_EDITABLE／READ_ONLY。
- 偽装／試験：4秒内はnative0・4秒後1・hidden時1、失敗時復帰、外部変更で残す、取消後再読込、連続削除の各タイマーを確認。画面文「リマインダーから削除しました」は4秒猶予中で実削除は後という仕様を採る。
- 完了：取消で見えない項目を壊さず、失敗を成功扱いしない。Macビルド・共通チェック成功。

## PR21：タスクの通知を期限に合わせる

- 作業／変更先：SwiftのPR16/18とserializeReminderに通知変換（新設）。新規は期限時刻ちょうど、日付のみ8:00の絶対EKAlarm、期限なしはなし。既存の表現不能通知は保持、未操作欄を全置換しない。
- 型つき契約拡張：createに `notify?:boolean`（省略true）、updateのpatchに `notify?:boolean`、戻り値Reminderは既存alarms/alarmsExtra。due変更時は旧期限に一致する表現可能な既定通知だけ新期限へ移す。明示notify=falseはその通知だけ外し、未知通知は残す。
- Duo通知・予定通知設定は流用しない。期限なし＋notify=trueはINVALID_ARGUMENT。既存タスクの通知を開いただけで補わない。due変更時のstartDateComponents整合は実機で確認し、勝手に削らない。
- 偽装／試験：期限変更・日付のみ⇔時刻・なし、未知アラーム保持、Duo notifySyncにタスク0。Macビルド・実機で8:00／期限に1回だけ鳴るか、TZ変更・繰返し次回通知も確認。
- 完了：期限と通知が一致、権限取消でもDuo通知で代行しない、共通チェック成功。

## PR22：タスク編集に通知の選択を追加する

- 作業／変更先：reminders.jsの追加／編集、HTML/CSSに通知あり／なしと期限の説明、表現不能通知の印。既存アラームを表示するだけではnotifyを送らず、ユーザー操作時だけ差分を送る。
- 橋はPR21型。偽装のunknown通知とnotify省略検査を画面から使用。新規の既定はON、期限なしへ変えたら通知不可、戻した時は明示操作状態を反映する。
- 読み替え／追加：reminders.specで既存の通知なしに既定が足されない、時刻変更／日付のみ8:00、未知通知警告、通知取消、書込拒否時の復帰。既存notify-uiの予定期待は変えない。
- 完了：タスクの追加・編集・完了・通知が一通り完成し、共通チェック成功。

## PR23：タスクのリスト設定と月の件数を作る

- 作業／変更先：reminders.jsの設定正規化・リスト絞込、appの `openMenu/weekInner/renderBackup`、HTML/CSS。初期すべて、追加先OS既定→書ける先頭、設定はnamespace付き `duo-native-rem`。消えたidを除去し読み取り専用は表示だけ。
- 橋はPR12/14型、偽装はリスト追加消失・既定なしを追加。「月にタスクを表示」は初期off、on時のみ開画面に✓N（未完了・選択リスト・due日）、閉画面は出さず、タスク名は常に出さない。
- 読み替え／追加：reminders unit/specでフィルタ・追加先と表示リストの独立、日付変更・完了で件数更新、日付右14・8ptと+N非重複。リストid・追加先・月件数設定とタスク本文はバックアップ対象外。
- 完了：10 §4の画面と設定が完成、実機でiPhone側の変更・権限復帰・共有リストを確認、共通チェック成功。

## PR24：長押しとドラッグの共通制御を作る

- 作業／変更先：新規 `app/js/direct-input.js` にpointer状態機械と日付／分の量子化（新設）、`app/js/swipe.js` の `initSwipe` に明示cancel口、appの `SWIPE_ZONE/SWIPE_EXCLUDE/tlTap`。待機→350ms確定→drag→up/cancel、ペンは即確定。
- 橋なし・偽装据置、direct-input.jsをSWへ。長押し前の移動は通常scroll/swipe、確定時はswipe取消と後続click抑止。2指・pointercancel・lostcapture・hiddenで清掃。既存予定上は時間入力しない、月チップは後続コピー用に別の起点種別。
- 読み替え／追加：swipe既存は維持。direct-input unit/specで349/350ms境界、移動／2指／取消／click二重反応、ペイン独立・15分境界を確認。画面への本接続は次PR。
- 完了：ジェスチャー所有権を競合なく引き渡せ、通常スクロール／月送りを変えない。

## PR25：時間軸のドラッグから予定を入力する

- 作業／変更先：direct-input.js、appの `timelineHtml/initTimeline/tlTap/openEditor/showEditor`、CSS。実際のTL.hh・scrollTop・起点日から15分丸め、長押し初期30分、上下伸縮、最小15分・日境界clamp、開始／終了札と時間長を表示。
- 短tapは1時間の仮枠、再tapでシート、外側で消去。仮枠の開始／終了取っ手12・hit44、長押しdragは離すと即シート（シート中は取っ手なし）。終日段長押しは当日の終日シート。最後のカテゴリ、iPhone追加初期onは既存規則へ渡す。
- 閉じた日・週は現行 `calendarBody/dayList/weekRow` が一覧形式なので、空き時刻を選べる時間軸を同タブの本文に導入する（日1列／週7列、狭幅は横スクロールで列幅を確保）。閉画面の4タブ自体と一覧タブは残す。時刻座標がない行の余白を時間入力として扱わない。
- 橋なし・偽装据置。描画のみではDB/native書込0、保存は既存commit経路。入力タイトルへfocus、cancelで枠を消す。
- 読み替え／追加：timeline.specの「1tap即シート」を仮枠→2tapへ。direct-input.specで左右時間・下パネル・閉じた日/週の時間領域、逆方向・端時刻・既存予定除外・cancel・1回保存を確認。
- 完了：10 §1の基本操作と表示色・2pt線・6角丸・44×18札を満たし、共通チェック成功。

## PR26：月のドラッグから期間予定を入力する

- 作業／変更先：direct-input.js、appの `weekInner/monthGrid/monthGridAll/openEditor`、CSS。空白／数字から350msで期間選択、2.5pt枠・内側2・角6、日数の札、逆方向を正規化し週またぎ、離すと終日ON・開始日〜含む終了日のシート。
- 橋なし・偽装据置。通常tapは日選択、チップ起点は期間選択しない。全表示仮想化の再描画にも日付キーで追従。VoiceOver向け「期間を選ぶ」は開始／終了をボタン操作できる代替を用意。
- 読み替え／追加：month-all/swipeの通常操作を維持。3姿勢・右月・4/5/6週・週末／月末・逆方向・1日・スワイプ取消・cancelを確認。取消・編集前はDB0。
- 完了：10 §2の基本期間入力が全月で動き、既存月送りを妨げない。

## PR27：直接入力の端スクロールと触覚を仕上げる

- 作業／変更先：direct-input.js、appのページ破棄・回転処理、Swiftに `selectionHaptic`（新設）。時間上下40ptは毎秒120pt（基準60pt/時）、月上下40ptに600ms滞在で前後月、移動後も起点・日付を保持。
- 型つき契約：`selectionHaptic({kind:'light'|'warning'})->{performed:boolean}`、SwiftはmainでUISelectionFeedbackGenerator／UINotificationFeedbackGenerator。非nativeは無操作、JS側は刻み変更時だけ呼ぶ。kind不正はINVALID_ARGUMENT。
- 偽装／試験：haptic呼出し・non-nativeを追加。端の時間進行・逆戻り・1回の月送りと再滞在・ペン即入力・ペンでscrollしない・回転取消・タイマー解放・reduced motionを確認。
- 完了：VoiceOverの「新しい予定」「期間を選ぶ」と通常操作、実機で指／Pencil・振動・スクロール競合を確認。Macビルド・共通チェック成功。

## PR28：コピーする予定の型紙と貼付計画を作る

- 作業／変更先：新規 `app/js/paste.js` に `shiftTo/planPaste/PASTE_MAX`、appの `resolve/defaultCatId` とiphone.jsの `pickAddCal/toDisplay` を参照。DuoはoccurrenceAt後、extはrawEnd／occurrenceDateで日数差を保ち、単発・新id/rid・updatedAt共通。
- 橋なし・偽装据置、paste.jsをSWへ。Duoだけ→Duoだけ、linked→元の書ける先→設定既定→OS既定→先頭、不可／連携offはDuoだけ。書けるext→同じiPhone先だけ、読取専用ext→Duo（題名・終日・日時だけ、既定カテゴリ／未設定その他、通知[]）。読取専用コピーへ自動iPhone追加は行わない（最新10 §6.6・CP-3優先）。
- 読み替え／追加：paste unitで31/32、月末・閏日・NY DST・日またぎ・翌0時・帯3日・変更済みの回・alarms欠落[]・入力不変・既定先消失。書けるextのURLはJSへ渡さない。
- 完了：CP-1/3/5/7/8/10の計画側を固定、通常予定の新規追加既定にコピー先が左右されない。

## PR29：ネイティブで予定をまとめて追加する

- 作業／変更先：Swift `createEvent/parseAlarms/loadCreated/saveCreated/createdReply` を抽出共有、`createEvents`（新設）に型Aだけ導入。全入力先検査、1〜31・rid重複拒否、recurrenceキー拒否、queue上save(commit:false)→commit1回、記録はcommit成功後。
- 型つき契約：`A={requestId:string,calendarId:string,title:string,start:Stamp,end:Stamp,all:boolean,place:string,notes:string,alarms:({before:number}|{day:number,at:string})[]}`、`createEvents({items:A[]})->{results:CreateResult[]}`。`CreateResult={requestId:string,ok:true,itemId:string,externalId:string,eventId:string,modifiedAt:MS|null,calendarId:string}|{requestId:string,ok:false,code:string}`。
- 個別READ_ONLY等はその件だけ失敗、commit失敗はresetして保存待ち全件UNAVAILABLE。既存rid／URL印で回収。単発createEventの旧契約・作成記録移行を維持。
- 偽装／試験：createEvents分岐・rid別失敗・commit一括失敗・保存済み再試行、ブリッジ契約を追加。既存native.specのcreateEvent期待は不変。Macビルド、実機31件・二重なし・commit後ID。
- 完了：まとめAPIが単発と同じ内容を作り、共通チェック成功。

## PR30：iPhone予定を出席者なしで複製する

- 作業／変更先：Swift `createEvents/findExtTarget/getEvent/editReason` に型B。書込可否は**カレンダー**で判定し、出席者ありによるeditReason拒否をコピーに流用しない。新EKEventへ題名・場所・メモ・URL・相対通知を複製、出席者／繰返し／絶対・場所通知は写さない。
- 型つき契約：`B={requestId:string,copyFrom:{itemId?:string,externalId?:string,eventId?:string,occurrenceStart:Stamp,currentStart:Stamp},start:Stamp,end:Stamp,all:boolean}`、`createEvents({items:(A|B)[]})->{results:CreateResult[]}`。戻り値はPR29、URL値は返さない、endは既存nativeの終日包含最終日規約に変換する。
- 型Bは利用者URLを残すため印なし。資料の代案を採り、型Aの一括commit後、Bを1件ずつcommit:true→直ちにrid記録。失敗再試行でも記録済みは再作成しない。commit成功〜記録直前の強制終了による型B重複リスクは実機結果と共に明記する。
- 偽装／試験：Bの元特定・READ_ONLY／NOT_FOUND／曖昧・参加者除外・通知選別・同ridを追加。既存getEventの編集不可期待は維持。Macビルド、実機URL保持・相対通知3件・招待送信0。
- 完了：CP-5/8/10を満たし、相対以外の通知が省かれる制約を引渡しに残す。

## PR31：貼付結果と失敗分の再試行をまとめる

- 作業／変更先：appの `commit/createNative/abandonCreate/giveUpCreate/initNative`、dbの `applyChanges/applyAck` に `pasteCommit`（新設）。Duo分を1TX→native1回→同id/rid/pendingのみack、xBusy排他、まとめrender・通知再計画。ext分はDBに保存しない。
- 橋はPR29/30型。retryは失敗だけ同rid、hardは即unlinked、放棄は残pendingをunlinkedへ。Duoに残る型AとDuoにも無い型Bの失敗文を分ける。DB失敗ではnative0、ack遅延中の編集・削除は既存差分outboxで処理。
- 起動時pendingは全件まとめて提示、31超なら31件ごとのAPIに分け集計。型BはDBにpendingを置かないため起動再送対象外（再試行は同セッション）。1回だけ再試行し再失敗は閉じるのみ。
- 偽装／読み替え／追加：native.specの最初1件だけ再試行を全件へ。paste.specで3件一部失敗・同rid・hard・放棄後通知復帰・多件pending・遅いack・DB abort・描画回数を確認。
- 完了：CP-3、pending通知欠落の放置なし、失敗日が正しく集計され共通チェック成功。画面接続はPR34。

## PR32：貼り付けた予定を六秒以内に取り消す

- 作業／変更先：paste.jsに取消計画、appの `notice/commit/planNativeOps/requestNotifySync` とext削除経路へ `undoPaste`（新設）。メモリ記録だけ、成功したDuo id＋貼付updatedAt／ext識別子＋modifiedAtを保持し6秒で破棄。失敗dialog中は開始せず閉じた後6秒。
- 橋：ext取消は既存 `deleteExternalEvent(Target & {span:'this',expectModified:number|null,force:false})->{deleted:true,missing?:boolean}`、TargetはPR30 copyFromと同形。linkedは既存outboxのdeleteEvent経路。DuoはupdatedAtが貼付時と一致したものだけ消す。
- linked取消用outboxに `undoOnly:true` と貼付後のexpectModifiedを持たせ、`sendOp/onSendFail` はこの操作のCONFLICTでforce再送せず残す。削除前に最新nativeを確認し、競合時のDuoレコードも保持／復元する。通常削除の競合確認とは分離し、遅いackでも貼付後に編集した本文を復元値で上書きしない。
- 偽装／試験：編集済みDuoを残す、ext CONFLICTはforceなしで残す、linked側の外部変更も最新取得と削除直前の競合検査で残す。6秒後／再起動不可・通知入替・DB失敗・取消連打を確認。
- 読み替え／完了：notice既定4秒を維持し貼付だけ6秒。残した件数を説明、バックアップに取消記録0。CP-2を満たし共通チェック成功。

## PR33：コピー開始と貼る日の選択画面を作る

- 作業／変更先：appの `weekInner/showEditor/xdFoot/openExtDetail`、direct-input.js、paste.js、CSS。チップ350msは幅160・行44のコピー／編集／削除、ポップアップにコピー44。書込不可の編集・削除はdisabled、コピー可。VoiceOverにコピー操作。
- 橋は既存getEventでext型紙取得、型はV13のDetail（title/start/raw end/all/識別子等）。偽装は読取専用・招待のgetEventを使用。コピーした型紙とDay集合はメモリ、貼付中はチップ操作・＋・他ページをinert、他ページ10%暗くする。
- 月見出しに緑帯、0件disabled、日tapで追加解除・長押しなぞり選択・元日も可、31上限・警告触覚・3秒文言・31数字黄。月送り・開閉回転で日集合を保持、右月にも対応。
- 読み替え／追加：popup-dismissのコピー行追加とfocus復帰、swipeの貼付中は月送り可。paste.specで空白期間選択との分岐、全姿勢、31/32、キャンセルDB/native0、VoiceOver代替を確認。
- 完了：CP-6/7、コピー選択状態を完成。確定は次PRで接続し、それまでは実行未接続の入口を公開しない。

## PR34：貼付の見本と失敗画面を仕上げる

- 作業／変更先：appの `weekInner/weekData/monthGridAll`、paste.js、HTML/CSS。空きレーンにコピーの見本、複数日帯は全体・選択日始まり・週またぎ、帯題名8字省略・日数・補足、複数日は高さ60。コピー元枠1.5・コピー元9pt、選択枠＋16丸✓。
- PR31/32を確定ボタン・6秒トーストへ接続、途中失敗dialogは日付3件まで／ほかN、再試行→再失敗は閉じるだけ。型A失敗は「Duoには保存」、型B失敗は「Duoにも入っていない」と明記し10の一律文を適用しない。成功分取消はdialog終了後。
- 橋・偽装はPR29〜32のまま。読み替え／追加：paste.specで31件・変更済み回・帯・招待・readOnly・一部失敗と取消、search-backupで通常単発として検索／書出。perf unitで貼付後の月展開・検索を既存基準内に。
- 完了：CP-1/2/3/5/6/7/8/10、見本はDBに入らず操作1回で1回保存。全姿勢の矩形と画像、共通チェック成功。

## PR35：前面で通知が鳴ったら予約を補充する

- 作業／変更先：Swift `willPresent`、appの `initNative/requestNotifySync/runNotifySync`。Duo通知に限り `notificationPresented` を発火、既存表示オプションを維持。JSはfired理由で既存500ms debounce・直列・世代処理を使う。
- 型つき契約：native→JS `notificationPresented:{}`（本文・予定識別子なし）、JS→nativeの既存 `notifySync({items:NotificationItem[]})->{scheduled:number}` は不変。native.jsのlistenは汎用のまま。
- 偽装／読み替え／追加：listenersから発火しnotifySyncが再度呼ばれる、連続発火は間引き、オフ／権限なし／古い応答・hidden復帰は既存どおり。notify.specとnotify unitに31日×通知2つを追加。
- 完了：CP-4、実機で前面発火後に次の通知が入る。Macビルド・共通チェック成功。

## PR36：通知を更新する最後のお知らせを予約する

- 作業／変更先：`app/js/notify.js` の `planNotifications` とappの呼出し・設定説明。返り値を `{items:NotificationItem[],truncated:boolean}` に変更、実通知が上限／30日窓で切れるとき59実件＋duo.refreshで計60。非切捨てなら実通知だけ最大60。
- 実通知切捨て時は最後の実通知の1分後、窓のみなら30日後9:00、eventId空・dayを設定、題「Duo カレンダーを開いてください」、本文は第6弾§6.2。窓外有無は有限の単発／繰返し／例外と有効通知から判定し、無限展開せず、実際に残りがない場合は出さない。
- 橋はPR35の既存 `NotificationItem={id:string,fireDate:Stamp,title:string,body:string,thread:string,eventId:string,day:Day}` で不変、refreshにもthreadを渡し、notifySyncの60上限・duo.検証を維持。偽装にduo.refreshとタップを追加。通知オフ・権限なし・linked/pending・タスクには作らない。
- 読み替え／追加：notify/perf/backfill各unitの配列期待を.itemsへ、切捨て時は実通知59件と分ける。60/61境界・窓外単発・有限／無限繰返し・例外・全部過去・なし、通知tapでその日を開く、再計画時のrefresh消去を確認。
- 完了：CP-4/9、実機で最後のお知らせとタップ後補充を確認、共通チェック成功。最終同期PRは作らず指揮役へ渡す。

## Xcodeで手作業が要る点

- 新規Swiftファイルの登録・Capabilities追加・バンドルID変更は **なし**。Info.plistのリマインダー2キーはPR12のソース変更で対応し、Xcodeで別文言を二重設定しない。BGAppRefreshは導入しない。
- 指揮役の最終SW増分後、既存 `npm run build:www` → `npx cap copy ios` で同期し、www／iOS publicとソースの一致を確認。Macの既存Appターゲットをビルドして実機導入。LinuxのparseやJS偽装はSDK型検査／EventKit／通知の代わりにならない。
- iOS17以降と15/16の許可分岐、許可取消→設定→復帰、EventKit変更通知、未知のタグ／添付／サブタスク保持、繰返し完了の次回・通知、日付のみ8:00の二重通知なしを実機確認。問題があれば規則や未知欄を自動作り直しせず、対象PRを修正して再検証する。

## QAと実機確認の対応

QA正本はチーム `qa/verify-ref-layouts.md` の末尾RK/CP。旧6639bb7のrail・時刻既定・最大件数より現行V13式と10を優先。結果は合成データで、姿勢・safe・TZ・iOS版を記録する。

| QA | 実装PR・自動確認 | 実機での操作と合格条件 |
|---|---|---|
| RK-1 | PR2/3/10、persist・rokuyo | 既定オン→オフ、開閉・回転・再起動・バックアップ復元後も保持 |
| RK-2 | PR3〜7/15/19、layout | 全姿勢・左右各ページ・下パネル・週に表示、数字/+N/メモ線と非重複 |
| RK-3 | PR1、NAO独立fixture2,191日 | 実機の数日照合で全日自動検証を代替しない。2026〜2030の不一致0 |
| RK-4 | PR1/3、閏前後unit | 2025/7/25閏6月・2028/6/23閏5月、前後の月境界が一致 |
| RK-5 | PR1/3、null・pageerror | 1999/12・2051/1は空欄、2000/1・2050/12の範囲内は表示、固まらない |
| RK-6 | PR1、2033境界unit | 2033/12/22閏11月1日大安、2034/1/20旧12月、2/19旧正月先勝 |
| RK-7 | PR1/3、NY・日付境界TZ | 端末TZをNYへ、同じ日付の日本旧暦が同じ |
| RK-8 | PR1/10、SHA256・backup | オフ設定とページ組合せをv4から復元、メモも同じ日付へ |
| CP-1 | PR28/30/34、paste | Duo・linked・extを複数日へ、時刻・色・メモ・表現可能通知が同じ。読取専用例外は10どおり |
| CP-2 | PR32/34、undo | 6秒内だけまとめて取消、Duo/iPhone/通知へ反映。編集済みは残り、再起動で取消なし |
| CP-3 | PR28〜31/34、pending | DuoだけはiPhoneに増えない、linkedとextは規則どおり。一部失敗日・再試行・起動時全pendingを確認 |
| CP-4 | PR35/36、notify | 31日×2通知、最大60（切捨て時59実件＋1）、近い順・前面発火で補充、二重なし |
| CP-5 | PR28/30/34、帯・回単位 | 変更済み繰返し回は変更後の単発、3日帯は開始基準、日またぎ／月末／翌0時の長さ保持 |
| CP-6 | PR33/34、姿勢・swipe | 選択中に月を送り、開閉・回転してもDay集合と選択数が維持、他ページと＋は無反応 |
| CP-7 | PR28/33、31/32 | 31日は可、32日は選ばず文言・揺れ・触覚、31の数字は黄 |
| CP-8 | PR28/30/34、回・参加者 | 元の回だけ写り、規則・例外・出席者が複製されず、招待通知が相手に届かない |
| CP-9 | PR36、refresh | 通知が尽きる条件で最後のお知らせ、タップでその日を開き先を補充。不要なら予約されない |
| CP-10 | PR30/34、招待コピー | 読取可・同カレンダー書込可の招待会議→出席者なしの自分の予定、元の招待は不変 |

追加の実機確認：PR5〜7で全12組合せ・交換・月なし日付移動・縦下段とキーボード、PR9〜11で入力直後の強制終了／下書き復旧・全消去・検索・v1〜4読込、PR12〜23で拒否・既定リストなし・4秒取消・外部変更・完了履歴30日刻み・機内モード、PR24〜27で指／Pencil・長押しとscrollの分離・端送り・VoiceOver代替を確認する。PR30型Bのcommit直後終了とURL保持、PR31途中終了後の全pending再送、31件反映までの時間も記録し、既存V13の予定編集削除・帯タップ・タッチ確認終了を最後に回帰確認する。
