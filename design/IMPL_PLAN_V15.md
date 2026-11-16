# 第15版 実装計画

| 順番 | 内容 | 第7弾との対応 | SW（順次適用） |
| --- | --- | --- | --- |
| PR1 | カテゴリの一度きりの安全な移行 | PR1 | v79 |
| PR2 | 旧バックアップと最後の表示カテゴリ | PR2 | v80 |
| PR3 | 表示・検索・通知の可視性統一 | PR3 | v81 |
| PR4 | 新規追加先の保存と旧設定の移行 | PR4 | v82 |
| PR5 | 新規予定のカレンダー選択を一本化 | PR5前半 | v83 |
| PR6 | 編集時のカレンダー移動と色・札 | PR5後半 | v84 |
| PR7 | 設定の階層と既存項目の移設 | PR6前半 | v85 |
| PR8 | カレンダー設定のリスト別表示切替 | PR6中盤 | v86 |
| PR9 | カレンダー内のカテゴリ編集 | PR6後半 | v87 |
| PR10 | リマインダー同期とリスト選択 | PR7 | v88 |
| PR11 | Google カレンダーの設定案内 | PR8 | v89 |
| PR12 | 通知の既定と既存端末の移行 | PR9前半 | v90 |
| PR13 | 通知設定画面・権限・コピー通知 | PR9中盤 | v91 |
| PR14 | タスクの通知を既定なしに統一 | PR9後半 | v92 |
| PR15 | 日時編集の状態と未操作値の保持 | design/12 基盤 | v93 |
| PR16 | 時刻カプセルと長さ・翌日表示 | design/12 §1–2 | v94 |
| PR17 | 日付カプセルと小さな月 | design/12 §3 | v95 |
| PR18 | 数字入力と読み上げ・大文字対応 | design/12 §4・6 | v96 |
| PR19 | 繰り返し終了日とタスク期限の共通化 | design/12 §5 | v97 |
| PR20 | 月の「全」の回帰試験と不足修正 | AE-1〜5 | v98 |

## 共通の前提と検証規約

- 基準は依頼指定 main=5f63b93、第14版、現行 `app/sw.js` は v78。git コマンドは使わず作業ツリーを読んだ。実装順は表の上から、Claude Code 1回につき1 PR、目安30分以内。最後の www 同期・指揮役の最終 SW 版上げ・全件テストは PR にしない。
- 本計画の作成で書くのは本ファイルだけ。実装担当の変更対象は以下の各節に記す。実装時も bundle ID `com.maskeykim.duocalendar` を維持し、新規 Swift ファイルは作らない。
- 資料は `/workspace/duo-calendar-team/` の第7弾全文、design/11・12、両設計の該当図5枚、FirstSeed見本2枚、指定QA3本。以下は行番号でなく現行関数名で参照する。設計11 §4 は更新済みで、予定があっても旧2カテゴリを残さない。
- 現行は DB schema=4、backup `VERSION=4 / READABLE=[1,2,3,4]`。`memos`、六曜、pages、ドラッグ・コピー、outbox と再送を保持する。カテゴリ移行で schema・backup版を上げない。
- 各PRは `app/` で `npm run test:unit`（東京・NY両方）と `npx playwright test tests/<関係するspec>` を単独で成功させる。下記specはすべてこのコマンドで指定する名前。各PRで `app/sw.js` の CACHE を直前から+1、新規JSは ASSETS に登録し `tests/sw.spec.js` も実行する。生成先 `ios/App/App/public` は指揮役が同期する。
- 各PRの「テスト」は追加・更新すべき検査であり、本計画段階で実行済みという意味ではない。共有ヘルパー変更で影響する既存specは同じPRで直して走らせる。旧UIを残すためだけの隠し入力やテスト専用の保存経路は作らない。
- 「偽装」は既存 `tests/native.spec.js` の `mock / window.__mock / calls`、`ext-edit.spec.js` と各 `reminder-*.spec.js` の `nativePromise` 偽装を指す。実際の引数による絞込・状態遷移を再現し、呼出ログと保存データの両方を検査する。
- データ移行なしのPRでも予定・メモ・例外・既存通知を削除しない。カテゴリ削除の明示操作、バックアップの明示置換、既存の取り消しは従来の操作契約を維持する。

## 現行との差分と共通ブリッジ契約

- `app.js` の `boot` はカテゴリ取得→通知backfill→予定取得→通知同期。PR1でカテゴリ移行を取得前へ、PR12で既存端末の証拠採取を新しい印・種・UI保存より前へ置く。移行で新しく作った印を初回起動の「既存」の証拠にしない。
- `reminders.js` の実設定は `{lists:null|string[],addTo:string,monthTasks:boolean}`。資料の想定する selectedIds/selectionInitialized に改名しない。現行 `shownListIds` は `[]` を全件へ戻し、`resolveAddList` は表示と独立なのでPR10で直す。
- `monthCfg('spread')` は現在すでに `allCap:large?4:5`。`cap` は高さで3〜4になるが「全」と別。043df61後のコード上の修正を確認したためPR20は試験中心とし、描画まで実測して不足だけ直す。
- CT-5/CS-3の「追加先から消える」は初期選択から除外と読む。手動選択一覧には非表示も出す（設計11 §1.1）。全体連携スイッチは新設しない。最後の✓禁止はDuoカテゴリに適用し、外部カレンダー・リマインダーは全オフ可能。
- CT-8は端末固有の**選択設定**（calendarIds、lists、addTo、defaultDest）をバックアップへ入れない検査。既存 `exportEvent/shape` が保持する `nativeLink` の照合情報まで削らない（別端末再照合を維持）。移行印・タスク本文も書き出さない。
- 共通型：`Stamp=string(YYYY-MM-DDTHH:mm、端末ローカル)`、`Day=string(YYYY-MM-DD)`、`Dest={type:'duo'|'iphone',id:string}`、`Alarm={before:number}|{day:number,at:string}`。
- 読取API（既存維持）：`listCalendars({})->{calendars:Cal[]}`、`listReminderLists({})->{lists:Cal[]}`。`Cal={id,title,color,sourceId,source,sourceType:string,allowsModify,isDefault:boolean}`。
- `listEvents({from:Stamp,to:Stamp,calendarIds:string[]})->{events:object[]}`、`listReminders({listIds:string[],completedSince:Stamp})->{reminders:Reminder[]}`。空id配列は空結果。Calのsourceで段分けする。
- `checkPermission/requestPermission/reminderPermission/requestReminderPermission({})->{status:string}`、`openSettings({})->{opened:boolean}` は既存。許可要求は利用者の操作からだけ。Google案内のopenSettingsは現在アプリ設定を開くもので、アカウント設定への直行を保証しない。
- 作成契約C：`createEvent({requestId,calendarId,title,start,end:string,all:boolean,place?,notes?:string,alarms?:Alarm[],recurrence?:object|null})->EventReply`。
- `EventReply={itemId,externalId,eventId,calendarId:string,modifiedAt:number|null,occurrenceDate:Stamp|null}`。`createNative` の既存requestIdによる冪等化・失敗時pending/再送を維持。
- 編集契約E：`updateEvent({requestId:string,itemId?,externalId?,eventId?,calendarId?:string,span:'this'|'future'|'all',occurrenceStart?:Stamp,...差分})->EventReply`。
- extは `updateExternalEvent({itemId,externalId,eventId:string,occurrenceStart,currentStart:Stamp,span:'this'|'future'|'all',expectModified:number|null,base?:{start:Stamp,end:Stamp,all:boolean},calendarId?:string,...差分})->EventReply & {conflicted?:boolean}`。実際の既存識別・競合用引数を省かず、日時が不変ならstart/end/allを送らず、変更時は一組で送る。alarmsも未操作なら省略。
- タスク契約R：`createReminder({requestId,listId,title:string,notes?:string,due:null|{date:Day,time?:string},notify?:boolean})->{reminder:Reminder}`。`updateReminder` は既存itemId/externalId:string・expectModifiedAt:number|nullと差分を維持、戻り値 `{reminder:Reminder,conflicted:boolean}`。Reminderは既存serializeReminderのdue/alarms/alarmsExtra等を保持。
- 通知契約N：`notifyStatus/requestNotifyPermission({})->{status:string}`、`notifySync({items:{id:string,title:string,body:string,fireDate:Stamp,thread:string,day:Day,eventId:string}[]})->{scheduled,removed,skipped:number}`、`notifyClear({})->{removed:number}`。既存項目のID・発火日時・本文の形は変更しない。
- 触覚H：`selectionHaptic({kind:'light'|'warning'})->{performed:boolean}`、JSは `native.js/haptic`。新規ブリッジ不要。設計の0.5秒は操作間隔の扱いとして、軽い単発タップを送り、Web処理を0.5秒止めたり振動を連続させたりしない。実機で感触を照合する。

## PR1：旧カテゴリを予定を消さず一度だけ移し替える

- やること／ファイル・関数：`js/categories.js` に移行純粋関数を追加、`js/db.js` の `run/open` に専用移行関数、`js/app.js/boot` とトーストを接続（以降パスはapp相対）。
- 移行：categories/events/metaの1 readwrite transactionで印確認→DEFAULTS_NEWを不足分だけ追加→親と `Object.entries(overrides)` の旧固定idをotherへ→旧2カテゴリだけ削除→残るhiddenを全false→`categoryRetargetV1={at,moved,toast}`。予定レコードの削除・id変更はしない。movedは変更した親の数。
- 仕事#2F5F8A・プライベート#8A4B6B・家族#2E6B5A・外出#87500F・その他#5A5E62。既存同idの名前・色・順序、同名別idは保持。印ありなら再移行せず、その後のhidden操作を尊重。
- トースト：moved>0だけ6秒「ゴルフ・経済指標の予定を「その他」に移しました」。pending→表示完了でdone、0件はskip。表示前の中断は次回再表示可。保存失敗時に成功表示しない。
- JS↔Swift：なし。偽装：DB移行前状態・transaction abortを作るseedを追加、ブリッジ変更なし。
- テスト／読み替え：新規 `test-unit/category-retarget.test.mjs`、既存categories試験に0件/複数/overrideだけ/同名別id/改名/再実行を追加。新規 `tests/category-retarget.spec.js` で実IndexedDBのabort・再起動・件数と全非カテゴリ項目不変・toast一回を検証。
- 完了条件：CT-1/2/7。成功時件数一致、失敗時印も変更も残らず再試行できる。既存端末判定に使う「移行前証拠」をPR12から取得できるよう戻り値に保持する。

## PR2：古いバックアップの復元と表示の下限を守る

- やること／ファイル・関数：`categories.js/legacyToId,planDeleteCategory` 付近に `canHideCategory/ensureOneVisible`、`backup.js/validateBackup,planAppend`、`app.js` の取込→`db.applyImport` と既存カテゴリ表示切替を修正。
- 移行：v1〜4すべてで旧catキー・親・overridesをotherへ、旧2カテゴリを除去。追加は現一覧を保持、置換はファイルを基準に不足する家族/外出/その他を補う。仕事/私用は参照解決に必要なら補完。実際に書く合成結果へensureOneVisibleを適用する。
- 全hiddenならsortCategories先頭だけfalse、他のhiddenは尊重。report.retargetedを追加し旧2種でlegacyAddedを増やさない。validate後に原子的applyImport、入力不正時はDB不変。メモ・pages・六曜・リンク照合を保持。
- JS↔Swift：なし。偽装：v1/v2/v3/v4、メモ付き、all-hidden、custom-onlyの取込fixture。ネイティブ変更なし。
- テスト／読み替え：`test-unit/backup.test.mjs,categories.test.mjs` のgolf復活期待をotherへ。関係spec `categories.spec.js,search-backup.spec.js,memo.spec.js,category-retarget.spec.js`。最後の✓に書込なし・0.2秒揺れ・3秒案内、置換/追加両方の件数・例外保持を追加。
- 完了条件：CT-3。移行印の有無に関係なく古い復元で旧カテゴリが復活しない。明示置換の仕様以外で予定を削除しない。

## PR3：画面と検索と通知に同じ表示条件を適用する

- やること／ファイル・関数：`iphone.js` に可視性判定、`app.js/occIn,visExt`・検索の `searchEvents` 呼出・`runNotifySync`、必要な `search.js/notify.js` の展開後絞込へ接続。`occcache.js` のキャッシュ失効を確認。
- ローカルはカテゴリhidden、linked/pendingは追加先calendarIdの✓を正とする。id消失時は非表示のまま既存reconcileに任せ、unlinkedに戻った失敗予定はカテゴリ判定へ戻す。extとlinkedの重複除去は全親データを使う。
- 親を先に落として可視overrideを失わない。繰り返し展開後の実効categoryIdで画面・検索・通知を判定。設定変更時に検索snapshot・外部cache・通知予約を失効/再計画する。
- 移行：なし、読み出し条件のみ。JS↔Swift：共通読取/N、listEventsには✓付きidだけ。EKAlarmを更新・削除しない。
- 偽装：native mockにhiddenローカル、同じlinked/ext、pending、消失id、overrideの混在を追加。listEventsは引数どおり絞る。
- テスト／読み替え：新規 `test-unit/calendar-visibility.test.mjs` と `tests/calendar-visibility.spec.js`、関係spec `search-backup.spec.js,notify.spec.js,native.spec.js,recur.spec.js`。非表示検索ヒットの旧期待を変更。
- 完了条件：CT-4/6。月・時間・閉画面・検索・Duo予約の対象が一致、表示切替でデータ件数・既存EKAlarmは不変。

## PR4：新しい予定の追加先を一つの設定として移行する

- やること／ファイル・関数：`iphone.js/normSettings,pickAddCal`、`app.js/loadLink,setLink,refreshCalendars,resumeExt,boot,confirmPaste`、`paste.js/planPaste` にDestの解決関数を追加。
- 移行：`duo-native-cal.defaultDest` 未設定だけ旧addByDefault/defaultCalendarIdから変換。許可・一覧取得後に確定し保存、権限なしならDuo。旧enabled=falseかつ許可ありはenabled=true/ids=[]/selectionInitialized=trueへ一度だけ移す（版印を設定内に持つ）。
- 非表示の既定先は同じsource内の表示中→表示中other→表示中Duo先頭、全部非表示だけotherを仮選択。消失・読取専用化は代替へ。旧キーは変換成功まで保持し以後参照しない。予定自体は移さない。
- JS↔Swift：共通読取のみ。偽装：遅延一覧・権限なし・旧オフ・消失/増加カレンダーを追加、初回全選択と再取得を区別する。
- テスト／読み替え：`test-unit/iphone-link.test.mjs,paste.test.mjs`、関係spec `native.spec.js,paste.spec.js`。DuoコピーはDuoのまま、書込可能な元カレンダー優先、代替のみdefaultDest→表示中Duoとし、31日制限・再送・Undoを保持。
- 完了条件：再起動で移行を反復しない。オフ先は初期選択にならず、取得遅延で利用者の既定先を上書きしない。

## PR5：新規予定のカレンダー選択を一行にまとめる

- やること／ファイル・関数：`index.html,css/app.css,app.js/fillCatSelect,readForm,showEditor,openEditor,updateXUi,hiddenNotice`。新規予定のみにDestピッカーを導入、旧編集経路はPR6まで動かす。
- UI：設計11の44pt行・296幅popover、Duo→source別iPhone/Google。書込可だけ、非表示は各段の後方・色40%・別の「非表示」札、✓とフォーカス復帰。全非表示の案内と保存後6秒の名前入りトースト＋「表示する」。
- 保存：DuoはcategoryId、iPhoneはnone＋nativeLink。新規の旧xadd/xcal行は除去。設定のdefaultDestを初期値にし、シート内の一時選択で設定値を勝手に変更しない（QA CS-2の旧「前回選択」期待は設計11に読み替え）。
- 移行：旧session下書きcategoryId/xadd/xcalをDestへ読み替える。本文・日時・alarmsを保持。JS↔Swift：C、Duo選択時createEventを呼ばない。
- 偽装：iCloud/Gmail/表示のみ/非表示・create失敗と同requestId再試行を追加。tests/helpers.jsのfillEditorはカテゴリ選択を新規ピッカー経由へ。
- テスト／読み替え：関係spec `crud.spec.js,categories.spec.js,native.spec.js,paste.spec.js,persist.spec.js` と新規 `calendar-picker.spec.js`。新規入力が旧selectを触る各specも同PRで更新。
- 完了条件：新規シートにカレンダー1行、選択先に1件だけ保存される。非表示でも手動保存でき、表示する操作で✓が戻る。

## PR6：既存予定の移動と色を保存先カレンダーに揃える

- やること／ファイル・関数：`app.js/applyExtUi,updateXUi,readForm,submitExt,runExtSave,catVar,tagText,createNative`、`iphone.js/planNativeOps` と既存外部差分作成を修正。旧f-cat/f-xadd/f-xcal/f-ecalの分岐を統一する。
- Duo→iPhone、ext→別iPhoneを許可。linkedの別カレンダー移動もEの既存更新経路へ接続し、Swift updateEventのcalendarIdが検索用か移動用か確認して、移動未対応なら同ファイル内で対応する。ext/linked→Duoは選べない。extの移動範囲は現行extCanMoveどおり単発/系列全体のみ（この回/以降の移動を増やさない）。読取専用の現在先は表示して編集禁止。
- linked/pendingの色・札はカレンダー情報を使用、未取得時は保存済み名/安全色。既存categoryIdは移行対象以外保持、Duo→iPhone時のみnone。ネイティブ失敗で予定を消さず再送・解除の既存UIへ。
- 移行：なし。JS↔Swift：C/E、calendarIdの変更を差分として送り返却IDでnativeLinkを更新、日時・alarms未操作は送らない。必要なSwift変更は `ios/App/App/DuoNativePlugin.swift/updateEvent` 内のみ。
- 偽装：移動でcalendarId/識別子が変わる応答、権限喪失・競合・欠落・失敗/再送を追加。helpers.fillEditorを全編集経路で新UIへ移す。
- テスト／読み替え：`test-unit/native-ops.test.mjs,ext-edit.test.mjs`、関係spec `ext-edit.spec.js,native.spec.js,calendar-picker.spec.js,crud.spec.js,categories.spec.js`。旧「カテゴリ色」のlinked期待を変更。
- 完了条件：二重作成なしで移動、編集しなかった時刻・アラームが不変。全編集でカレンダー1行となり旧スイッチが残らない。

## PR7：設定を見本の一覧と階層に組み替える

- やること／ファイル・関数：`index.html,css/app.css,app.js/openMenu,placeMenu,syncMonthMenu,syncTaskMenu,syncRokuyoMenu,syncModeMenu` と設定クリック処理を再編。
- 設計11図の8項目を順番どおり配置。一般へ週始まり/六曜/卓上、表示形式へ月/文字/時刻/時間軸、詳細へサンプル/タッチ/寸法診断。カレンダーは既存カテゴリ/連携を内包、リマインダーは現行設定を内包して後続で更新。GoogleはPR11の説明を仮表示できる。
- 角丸22・48pt行、帯の×/下層‹、戻り先・Escape・フォーカスを統一。横は左ページ内で右ページを残す。タスク月印など第14版の項目を落とさない。
- 移行：保存キー/値は変更しない。JS↔Swift：既存入口を引き継ぐだけ。偽装：変更不要、既存ネイティブ入口の呼出は維持。
- テスト／読み替え：helpersのopenMenu/loadSample/setStyle/modeStates/toggleDeskを階層へ。関係spec `panel.spec.js,rokuyo-setting.spec.js,reminder-settings.spec.js,touch-check-tap.spec.js,ref-layout.spec.js,layout.spec.js` および旧menu直下操作の全specを更新・実行。
- 完了条件：項目の重複・行き止まりなし。3姿勢で帯や折り目に隠れず全既存設定が操作できる。

## PR8：設定のカレンダーをアカウント別に切り替える

- やること／ファイル・関数：`app.js/openLink,renderLink,refreshCalendars,enableLink,dropLink` とPR7の設定画面、`index.html,css/app.css`。Duo/iPhone各source/リマインダー段の枠、新しい予定の追加先を配置する。
- 設計11の32pt段見出し・40pt行・青✓・14pt色丸、表示のみ札。DuoはcanHideCategoryを通す。iPhoneはcalendarIdsへ保存し全オフ可。defaultDestのピッカーを再利用。権限別案内・初回全選択・以降増加分未選択、削除先の掃除を維持。
- リマインダー段は既存listReminderListsと既存設定を接続し、全オフの意味の修正はPR10。再読込/最終取得はカレンダー末尾に小さく置く。一括オンオフは作らない。
- 移行：PR4の設定を使用、予定・外部本体に書込なし。JS↔Swift：共通読取/権限/openSettings。表示変更時のlistEventsは選択idのみ。
- 偽装：同名source・Gmail・readonly・カレンダー増減/改名、拒否後復帰、空一覧・失敗を追加。
- テスト／読み替え：関係spec `native.spec.js,calendar-visibility.spec.js,calendar-picker.spec.js,categories.spec.js,ref-layout.spec.js`。旧全体スイッチの期待を✓方式へ変更。
- 完了条件：CT-5の予定側。回転・再起動で✓/既定先が保持され、選択OFFでEventKit変更APIを呼ばない。

## PR9：カレンダーの編集からカテゴリを管理できるようにする

- やること／ファイル・関数：`app.js/openCategories,renderCats,commitCats` とカテゴリクリック処理、`categories.js/planDeleteCategory`、`css/app.css`。カレンダー右上の編集/完了でDuo段だけ編集表示。
- 赤−、並替ハンドル、名前/色、追加を既存検証・DB関数へ接続。削除はotherを既定の移し先にし、親/overridesを同transactionで付替、5秒Undo。other自体は他の移し先があれば削除可。外部の名前/色は編集しない。
- 移行：なし。削除/並替後も表示中カテゴリを最低1つ保つ。既存の操作取消・カテゴリ削除後のdefaultDest代替も更新。
- JS↔Swift：なし。偽装：変更不要、外部変更APIが呼ばれないことをログで検証。
- テスト／読み替え：`test-unit/categories.test.mjs`、関係spec `categories.spec.js,calendar-picker.spec.js,calendar-visibility.spec.js`。旧カテゴリ独立画面への導線を新編集へ読み替え、改名/色/並替/取消/最後の✓を追加。
- 完了条件：予定を失わず編集・削除・Undo、最後のカテゴリ/最後の表示の両制約を守る。

## PR10：リマインダーの同期とリストの表示を分ける

- やること／ファイル・関数：`reminders.js/REM_SETTINGS_DEFAULT,normRemSettings,shownListIds,pruneRemSettings,resolveAddList,taskAccessHtml`、`app.js/loadTasks,scheduleTasks,monthTaskCounts,refreshReminderAccess,syncTaskMenu` と設定UI。
- 移行：同じduo-native-remにenabledを追加（欠落/不正はtrue）、lists:nullは初回未選択、初回一覧成功で全idを保存、lists:[]は意図した全オフ。以後増加分は選ばない。addTo/monthTasksを保持。空取得の一時失敗で選択を失わない。
- リスト✓はカレンダー内、同期/新しいタスクの追加先/固定「完了したタスク：30日分を表示」はリマインダー内。追加先は✓付き書込可のみ、なければ追加不可と案内。同期OFFは一覧取得しない、タスクページは指定文言、✓N/検索も空にする。
- JS↔Swift：共通読取/R。OFF前の進行中応答は世代番号で捨てる。実行済み書込やUndo待ち操作は二重送信しない。権限取消でもenabled/選択を消さない。
- 偽装：遅延listReminders、全オフ、増減、権限復帰・読取専用を追加。同期OFFで呼出0、再オンで復帰を検査。
- テスト／読み替え：`test-unit/reminders-settings.test.mjs` の空選択→全件・非表示追加先可の期待を変更。関係spec `reminder-settings.spec.js,reminder-gate.spec.js,reminder-list.spec.js,reminder-tasks.spec.js,reminder-add.spec.js,reminder-create.spec.js,reminder-edit.spec.js`。
- 完了条件：CT-5のタスク側、全オフも保持。EventKit削除・アラーム変更をせず、再起動/回転で同期と各✓が残る。

## PR11：Google カレンダーへの案内を設定へ移す

- やること／ファイル・関数：`app.js/renderLink` のGoogle説明を設定Google画面へ、`index.html,css/app.css`。設計11のアカウント追加手順と「iPhone の設定を開く」を表示。
- 移行：なし。直接ログイン/OAuth/新規通信なし。JS↔Swift：openSettingsのみ、opened=falseの既存案内を維持し、手動でiPhoneのカレンダー/アカウントへ進む説明を添える。
- 偽装：openedのtrue/false、Gmail追加後calendarChangedを追加。
- テスト／読み替え：関係spec `native.spec.js,calendar-picker.spec.js`。Google案内の旧表示場所を変更、Gmailがsource別一覧と新規追加先に出る検査。
- 完了条件：案内から設定を開け、アプリ復帰後にEventKit経由のGoogle予定を選べる。

## PR12：通知の既定をなしにして既存の通知を保持する

- やること／ファイル・関数：`notify.js/NOTIFY_DEFAULTS,normNotify,defaultAlarms,convertAlarms,planNotifyBackfill`、`db.js/backfillNotifyOnce`、`app.js/boot,loadNotify,saveNotify`、`backup.js/checkSettings`。null対応と旧既定移行を同PRで通す。
- 起動の最初に旧events/既存meta/旧LSキー/旧固定カテゴリの証拠を採取。PR1でこの起動中に作ったcategoryRetargetV1や新notifyBackfillV1、種カテゴリ、初回saveUiを既存証拠に含めない。メモだけの既存端末もDB内既存データで判定する。
- 一度だけ `duo-notify-policy.v15+suffix` 未済ならdefaultTimed/defaultAllDay=null。enabledは保存booleanを優先、未保存の旧端末はtrue、新規false、showTitleは保持。設定書込成功後にだけ印。失敗時は実効値を保持して再試行し、次回新規/既存を誤判定しない。
- 旧backfillは新規付与せず印だけ。既存親/overridesのalarms・EKAlarmは一切変更しない。初回からN.ready/予約前に政策適用し、付与→取消の一瞬の予約も防ぐ。バックアップ復元の既定値は再移行で消さない。
- JS↔Swift：Nは既存、起動では権限要求しない。偽装：旧印だけ/LSだけ/予定だけ/保存済みfalse/まっさら/書込失敗を追加。
- テスト／読み替え：`test-unit/notify.test.mjs,notify-backfill.test.mjs,backup.test.mjs`、関係spec `notify-backfill.spec.js,notify.spec.js,notify-ui.spec.js,native.spec.js,search-backup.spec.js`。旧自動30分付与期待を「変更なし」へ。
- 完了条件：NO-1/2/7。既存未保存はオン、新規オフ、全員新規既定なし、更新・再起動で既存アラーム完全不変。

## PR13：通知設定の操作と許可と復元を仕上げる

- やること／ファイル・関数：`app.js/renderNotify,askNotifyPerm,runNotifySync` と通知保存時処理、`notify.js/planNotifications`、`backup.js/buildBackup,checkSettings`。既定selectに「なし」、30分前/当日8:00を残す。
- 移行：なし。バックアップのenabled/showTitle/既定を尊重し、nullも旧オブジェクトも通す。notify欠落ファイルは現在値維持。オン操作だけで既定を復活させない。
- JS↔Swift：N。全体OFFはnotifyClear、ONは付け済みを30日/60件以内で再予約。許可要求はON・ON中の明示アラーム/既定選択・テスト通知から。OFF中の保存では求めない。外部EKAlarmは触らない。
- 偽装：権限要求回数・pending・notificationPresented・notifyClearのログを拡張し、CP-9もOFFで0件を検査。
- テスト／読み替え：`test-unit/notify-ui.test.mjs,notify.test.mjs,backup.test.mjs`、関係spec `notify-ui.spec.js,notify.spec.js,native.spec.js,paste.spec.js,search-backup.spec.js`。暗黙の通知が必要だったfixtureはalarms/ONを明示する。
- 完了条件：NO-3/4/5/7、予約0→再予約・許可拒否/復帰・復元後再起動で値が維持される。

## PR14：新しいタスクにも通知を自動で付けない

- やること／ファイル・関数：`app.js/newDraft,remSubmit,tkNotifyUi`、`reminders.js/createReminder,createAddController,buildTaskPatch`、`DuoNativePlugin.swift/createReminder` の既定notifyをfalseへ。既存のJS/Swift双方で省略時もなしに揃える。
- 移行：なし。既存タスクに更新を送らない。新規はnotify:false、明示ONなら期限時刻/日付だけ8:00。期限なしは通知なし、通知を触らない既存編集はnotify/alarmsを省略し、alarmsExtraも保持。
- 全体設定はloadNotify().enabledだけ。OFF時に新規通知を自動生成しない。既存のiPhone予定/リマインダーのEKAlarmはOFF切替でも消さない（Duo予約だけが0になる）。
- JS↔Swift：R、notify:booleanの明示・省略を区別。新規既定変更に合わせ既存requestIdの再試行が異内容にならないよう送信中引数を固定する。
- 偽装：省略時falseをSwiftと一致させ、旧アラーム/特殊アラーム・再試行を追加。
- テスト／読み替え：関係spec `reminder-create.spec.js,reminder-add.spec.js,reminder-notify.spec.js,reminder-notify-ui.spec.js,reminder-update.spec.js` と関連単体。旧期限あり通知自動ON期待を変更。
- 完了条件：NO-6、予定/タスクで設定が一つ。既存EKAlarmを保ち、新規保存で自動通知が付かない。

## PR15：日時を丸めず扱う編集状態と計算を用意する

- やること／ファイル・関数：新規 `js/datetime.js` に純粋な編集状態/操作関数、`app.js/readForm,showEditor,saveDraft,onFormChange,applyAllDayUi,startKey` へ接続。まず旧入力でも同じ状態を通す。`util.js/parseInput` の保存形は維持。
- 状態に元start/end/allと日付/時/分の変更有無・終日前時刻・長さを持つ。開始時刻変更は長さ維持、日付変更は暦日差で複数日数維持。終了時刻が開始より前なら日付を進め、明示的な終了日で開始前は拒否。年末/月末/閏日/DSTを区別する。
- 移行：既存ISO保存・旧スラッシュ下書きを読むだけ、未操作の10:07を再整形/丸めしない。extのrawEndと表示用23:59変換も保持し、未操作でraw値を上書きしない。
- JS↔Swift：E/Rの差分規約維持。start/end/allが不変なら送らず、時だけ変更なら元の分を保持した結果を一組で送る。通知・繰返しは変更した日時から既存処理で再計算。
- 偽装：10:07、日跨ぎ、rawEnd翌日00:00、既存通知付き外部予定を追加。
- テスト／読み替え：新規 `test-unit/datetime.test.mjs`、関係spec `crud.spec.js,ext-edit.spec.js,direct-input.spec.js,recur.spec.js,persist.spec.js`。開始変更後の終了手動修正前提を長さ維持へ。
- 完了条件：DT-2/3/5/10の計算基盤。無操作保存/時のみ変更で分・通知が失われないことを引数まで確認。

## PR16：時刻をカプセルと時分のマスで選べるようにする

- やること／ファイル・関数：新規 `js/datetime-ui.js`、`index.html,css/app.css,app.js/showEditor,readForm,applyAllDayUi`。設計12図に合わせ開始/終了/長さを配置、時刻のみ新部品へ切替。
- 44pt行、58×32時刻、長さ30/60/90/120/180分、時6列×4行・分5分刻み12個。7〜21時を強調、時→分で閉じる。07分はどの分も選ばず「いま 07分」、時だけ変更でも保持。
- 同時に開く部品は一つ、再タップ/他欄で閉じる。終日ONは時刻非表示、OFFで元の時刻復帰。終了日が進んだら日付も更新し「翌日」/「+2日」の札、2日以上は実日数を表示。
- 移行：PR15状態のみ、保存形不変。JS↔Swift：H/E、マス押下ごとlight、Webはperformed:falseでも動作する。
- 偽装：触覚呼出ログ、時だけ変更・開いて閉じただけの差分送信を追加。
- テスト／読み替え：helpers.fillEditorにUI経由時刻設定を追加、直fillしていた全specも変更。関係spec 新規 `datetime.spec.js`、`crud.spec.js,ext-edit.spec.js,direct-input.spec.js,notify-ui.spec.js,popup-dismiss.spec.js` と変更した入力spec。
- 完了条件：DT-1/2/3/5。23時台＋2時間の保存成功、未操作分を保持、部品を開閉しただけではdirtyにならない。

## PR17：日付をチップと小さな月で選べるようにする

- やること／ファイル・関数：`datetime-ui.js,datetime.js`、`app.js/showEditor,onFormChange,updateRepeatUi`、`css/app.css`。開始/終了日カプセル120×32、今年以外の年を表示。
- 今日/明日/来週同曜日、週始まり設定、祝日/日曜の赤、前後月、選択日丸/今日輪、6週表示。44pt月送りと50pt横スワイプ、日選択で閉じる。終了日で開始前のマスはdisabled。
- 移行：なし。開始日操作は日数/時刻を保持。終日の保存は現行の両端含む形式を維持し、EventKit境界の変換を二重にしない。
- JS↔Swift：Eのみ既存差分。偽装：不要、Hを使う場合はPR16と同じ。日時入力のイベントをシートdismiss・親の月送り・ページ切替へ伝播させない。
- テスト／読み替え：helpers.fillEditorを日付もUI経由へ、関係spec `datetime.spec.js,crud.spec.js,recur.spec.js,persist.spec.js,swipe.spec.js,popup-dismiss.spec.js` と直fillを書換えたspec。DT-7の祝日は既存祝日データ源を使い、ローカル新規予定で代用しない。
- 完了条件：DT-1/2/6/7。3姿勢で部品がシート内に収まり、明日14:30→長さ1時間が日付1＋時分2＋長さ1の選択で済む（開く操作数は別記）。

## PR18：数字の短縮入力と読み上げ操作を加える

- やること／ファイル・関数：`datetime.js` の短縮パーサ、`datetime-ui.js` の長押し/確定/取消/キー、`css/app.css`。930/1430/9/21、1114/20270105を受け、数字キーだけで完結。
- 年なしMMDDは編集中の値の年を使うと本計画で固定（11月の0105も同年1月5日）。不明な推測で来年へ送らない。2560/1332/0230等は厳密検証し元値へ復帰、0.2秒揺れ、本文エラーは出さない。
- VoiceOverの年月日/開始終了/ボタン名、時/分のadjustable操作、上下で1時間/5分、キーボード等価操作とフォーカス復帰を実装。大文字では時4列×6行、幅52pt以上、部品内縦スクロールを許す。
- 移行：なし、未確定数字を保存せず元の状態を維持。JS↔Swift：Hだけ、VoiceOver実ジェスチャは実機検証で補う。
- 偽装：長押し後pointercancel・IME/Enter・touchとclickの二重発火を再現、触覚は既存mock。
- テスト／読み替え：`test-unit/datetime.test.mjs`、関係spec `datetime.spec.js,touch-check-tap.spec.js,safe-layout.spec.js,popup-dismiss.spec.js`。3姿勢・大文字・折り目・キーボード表示の矩形と操作結果を追加。
- 完了条件：DT-4/6/8、入力形式の誤りで予定/編集中値を壊さず、読み上げと上下操作は実機でも確認。

## PR19：繰り返し終了日とタスク期限に同じ部品を使う

- やること／ファイル・関数：`app.js/updateRepeatUi,readForm,openTask,remSubmit` とタスク期限操作、`reminders.js/addRowHtml,taskEditorHtml,buildTaskPatch`、`datetime-ui.js`。f-runtilを日付カプセルへ、タスク期限に日付＋「時刻を入れる」を提供。
- 移行：旧runtil/タスク下書きを読替、タスクdue:null・日付のみ・時刻ありを区別。未操作due/notify/alarmsExtraは保持し、期限だけ変更して通知ONにしない。繰返し曜日はautoDaysの時だけ開始に追随し、明示曜日を上書きしない。
- JS↔Swift：R、due:{date:Day,time?:'HH:mm'}|null、変更時だけpatch。タスク本文をIndexedDB/バックアップへ複写しない。期限変更時の既存通知再計算は従来の明示通知設定に従う。
- 偽装：日付のみ/10:07/期限なし/特殊通知付きタスク、dueの省略とnullを別々に記録。
- テスト／読み替え：helpers.fillRepeatとタスクの期限直接fillを共通UIへ。関係spec `recur.spec.js,reminder-add.spec.js,reminder-edit.spec.js,reminder-update.spec.js,reminder-notify-ui.spec.js,datetime.spec.js`、関連単体にpatch未操作検査。
- 完了条件：DT-9/10。新規・編集・下書き復元で同じ日付入力、通知と繰返し範囲が保持される。

## PR20：月の全表示を実測し五つの品質条件を固定する

- やること／ファイル・関数：`tests/month-all.spec.js,pages.spec.js` を中心に追加。現行 `app.js/monthCfg,weekData` と全表示描画・スクロール復元、および `css/app.css` は試験が不足を示す場合だけ最小修正。
- 通常文字allCap=5、大文字4は全姿勢で共通。通常capの高さ制限を全へ再利用しない。5/6週月、1日6件以上、帯重複で実DOMの件数/+N/週高/末週到達と文字重なりを測る。
- 全の再押下は同じ週へ復帰、開閉/回転/再起動の状態保持。左右の月/時間/タスク/メモの組合せ・左右とも月も確認し、月でない反対ページの寸法/スクロール位置を保持する。
- 移行：なし、予定件数・monthExpand保存仕様不変。JS↔Swift：なし。偽装：既存リマインダーmockと5/6週・複数日帯のseedだけ。
- テスト／読み替え：関係spec `month-all.spec.js,pages.spec.js,band-layout.spec.js,open-portrait.spec.js,month-bottom.spec.js,allbtn-look.spec.js`。通常文字5/大文字4を正とし、閉/開縦の期待値を下げない。
- 完了条件：AE-1〜5。既にすべて合格なら試験追加＋SW更新のみの小PRで完了し、043df61と同じ修正を重ねない。

## Xcodeの手作業と実機確認の対応

- Xcodeで手作業が要る点：新しいファイル登録・権限・Capability・bundle ID変更はなし。Swift変更は既存DuoNativePlugin.swift内だけ。指揮役が最後にwww同期と既存プロジェクトのビルド/実機インストールを行う。ブラウザ偽装ではEventKit・通知発火・VoiceOver・触覚を保証できないため以下を実機で確認する。

| 品質 | PR | 実機での確認 |
| --- | --- | --- |
| CT-1 | 1/2 | 旧親/例外の件数が不変、全予定がその他へ。0件でも旧カテゴリが消える |
| CT-2 | 1 | 固定5種補完、仕事/私用の改名・色と自作カテゴリを保持 |
| CT-3 | 2 | v1〜4の追加/置換で旧2種が復活せず、メモ・例外が残る |
| CT-4 | 1/3/8/12 | 移行で一度全表示、その後の非表示が検索・Duo通知にも反映 |
| CT-5 | 4〜10 | ✓と同期を切替、全画面/検索/✓N/初期追加先に反映、再起動・開閉・回転で保持。iPhone本体は残りEKAlarmは鳴る |
| CT-6 | 3/8/10 | hidden/外部OFF/linked/例外が検索とDuo予約に漏れない |
| CT-7 | 1 | 再起動で重複・再移行なし。中断/abortの網羅は実DB自動試験 |
| CT-8 | 2/4/10/13 | 別端末へ復元しても元端末の選択idを移さず、先の選択を維持/初回は全選択。nativeLinkは再照合 |
| NO-1 | 12/13 | 新規相当で全体OFF、起動時許可なし、ON操作でのみ要求 |
| NO-2 | 12〜14 | 更新で新規既定なし、既存Duo/外部/タスク通知は残って鳴る |
| NO-3 | 13 | OFFでDuo保留0、ONで付け済みを30日/60件以内で再予約 |
| NO-4 | 13 | OFFで多数貼付してもCP-9が出ない |
| NO-5 | 12/13 | 再起動・開閉・v4復元後もenabled/既定を維持 |
| NO-6 | 14/19 | 新タスクは通知なし、明示設定時だけ期限ちょうど/当日8時 |
| NO-7 | 12〜14 | 旧端末の全体ON/保存済OFFを維持、新端末OFF。30分前/当日8時を選べる |
| AE-1 | 20 | 横の全で通常5/大文字4、週高が増え末週までスクロール可能 |
| AE-2 | 20 | 5/6週・大文字・帯重複で欠け/重なりなし |
| AE-3 | 20 | 全解除で同じ週、回転/再起動でも全の状態保持 |
| AE-4 | 20 | 左右各ページの月だけ拡張、反対ページ・折り目・ステータス領域が正常 |
| AE-5 | 20 | 閉/開縦の全表示に回帰なし |
| DT-1〜3/5 | 15〜17 | 操作数、10:07未操作/時だけ変更、23時台・翌日/+2日、終日往復 |
| DT-4/6〜8 | 17/18 | 数字入力/無効値、6週/祝日/週始まり、3姿勢・大文字・VoiceOver/触覚 |
| DT-9/10 | 15/19 | 繰返し/タスク期限/通知追随、旧下書き復元・未操作値の保持 |
