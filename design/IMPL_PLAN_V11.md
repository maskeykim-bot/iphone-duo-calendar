# 第11版 実装計画：通知・再予約・iPhone 反映・ekIdentifier

## 前提・共通の完了条件

正本は `/workspace/duo-calendar-team/data/連携_第2弾手順_v2.md` 全文（以下「手順書」）。削除文言は同プロジェクトの `design/07-delete-confirm-text.md`（以下「07」）、通知の寸法・文面は `design/02-notifications.md`（以下「02」）。指定された資料のみ例外として読み、他プロジェクトへの書き込み・探索はしない。本書の基準は依頼指定 main `6639bb7` の作業ツリー。git による照会・操作は行っていない。今回の成果は本ファイルだけで、以下の変更・コマンドは後続の Claude Code 用。

- **順序を固定**：PR 1→2→3→4→5→6→7→8→9（任意）→10。手順書の並行可という記述は採用しない。PR 9を見送ってもPR 10は実施する。
- 各PRで `cd app` から `npm test` と `npm run test:unit` を全件成功させる。後者は既存スクリプトが東京・NYの両TZで実行する。新たなskip/todoやassertの削減で通さない。既存のtodoは結果に明示する。
- 各PRで `app/sw.js` のCACHEを次の未使用版へ上げる（現状 `duo-static-v13`）。新規JSはASSETSにも追加。`npm run build:www` は `app/www` を生成するだけで、iOSのpublicへ同期しない。後続実装では続けて既存の `npx cap copy ios` を使い、publicへの反映を確認する。依存変更時だけ必要なsyncを行う。公開・pushは本計画の対象外。
- Swiftを触るPRは `swiftc -parse app/ios/App/App/DuoNativePlugin.swift` を構文検査とする。AppDelegate/SceneDelegateを変更した場合はそれぞれもparseする。LinuxでUIKit/EventKitの型検査・ビルド・動作確認が済んだとは扱わず、Mac/Xcodeと実機の結果を別記する。
- JS↔Swift試験は既存 `tests/native.spec.js` の `window.Capacitor.nativePromise/nativeCallback` 偽装を拡張。通知用にも共用できるfixtureへ抽出し、呼出し記録・遅延応答・コード別失敗・イベントを制御する。Swiftを変更しないPRはparse追加不要。
- 全PRで第10版の `closed-tabs/open-portrait/ref-layout/layout-metrics/timeline/safe-layout/month-all/swipe/sw` 等を維持する。466×678、626×890、669×951、890×626、951×669、light/dark、非対称safe area、キーボード、4タブ、右操作列、中心±10pxの無描画域を回帰させない。

## 現状との差の読み替え

| 手順書の参照（旧a67df36） | 現状で使う箇所・方針 |
| --- | --- |
| app.js:594以降のフォーム | `readForm` 807、`showEditor` 849、`updateXUi` 874、`valuesFrom` 902、`openEditor` 910、submit 968付近、`boot` 1857。行番号より関数名を優先 |
| commit 744、範囲808、削除857 | `commit` 958、`openScope` 1022、scope click 1049、`askDelete` 1071、delete handler 1101付近。単発削除はすでにcommit経由 |
| commitCats 953、import1244 | `commitCats` 1196、`doExport` 1445、`finishImport` 1487。カテゴリundoもcommitCatsに集約されるか確認 |
| loadExt1356、resume1384、連携1444 | `loadExt` 1583、`afterExt` 1613、`resumeExt` 1627、visibility1636、`enableLink` 1687、`lkRequest` 1694、`createNative` 1755、`initNative` 1777 |
| 旧ホームの次の予定カード／開いた縦の月＋下部一覧 | 現状は `listHtml/listView`、`closed`、全幅月の `open`。旧hero/nextや下部agendaを復活させない |
| 02§2の見開き左ページの通知パネル | 第10版の全dialogが右本文 `--right-start〜--right-end` に収まる契約を優先。通知も既存 `dialog.panel.full` と `openPanel/closePanel` を使い**右ページ**へ。入口だけ左見出し／右操作列等の既存「その他」から到達 |
| 02§4の開いた縦「月＋その日の一覧」 | 全幅月を維持し、通知タップ時は選択日の日表示へ。閉じた画面も日表示。見開きは左の選択日を更新し、右時間軸を対象時刻へ |
| 02§1のiPhone由来予定の通知編集 | 正本§1.6を優先：`origin:'iphone'` は既存readonly詳細のままで通知行なし。Duo由来linkedのみ通知編集を出す |
| §1の既存予定に既定を付けない仮定／末尾の未決事項 | 15:52追記とオーナー決定で確定。PR 10だけで限定移行。PR 1〜9の通常読込・正規化は既存alarmsを補完しない |
| §3内の「recurrenceはPR8（任意）」等 | 末尾のPR順が正。新規繰り返しのiPhone追加はPR 9。既存linked単発→繰り返しへの更新はPR 6/7で対応 |

既存のbackup v3、DB schema v3/metaストア、カテゴリ上限20、recurのalarms継承・配列比較は実装済み。再実装やschemaの無用な更新はしない。backupの1ファイル50カテゴリ許容と総数20を混同しない。

## 共通データ・API契約

日時stampは端末ローカル `YYYY-MM-DDTHH:MM`。`modifiedAt/ekModified/syncedAt` はepoch ms、作成記録のatだけepoch秒。終日Duo内部は最終日23:59、既存create入力は最終日00:00、list出力も含む最終日00:00をtoDisplayで23:59へ戻す契約を維持する。

```js
// localStorage['duo-notify' + suffix]。バックアップはsettings.notify。
{ version:1, enabled:true, showTitle:true,
  defaultTimed:{before:30}, defaultAllDay:{day:0,at:'08:00'} }
// alarms：最大2件。[]は明示的な「なし」。undefined/nullは予約なし。
// overrideのnull/undefinedだけ親から継承する。
[{before:30}] // before = 0,5,10,15,30,60,120,1440,2880
[{day:0,at:'08:00'}] // day = 0,1,2,7。保存形式は妥当なHH:MMを許す。

nativeLink: { v:2, state:'pending'|'linked'|'unlinked', requestId, calendarId,
  itemId, externalId, eventId, seriesStart, ekIdentifier,
  ekModified, syncedAt, matchedBy:'id'|'url'|'external'|'fallback',
  warn:null|'missing'|'writeOnly'|'conflict',
  calName, calSource, fallbackDeleteConfirmed:false }
// calName/calSource：復元時の一意照合用に作成・同期時点の値を保存する追加項目。
// fallbackDeleteConfirmed：最初の削除確認を確定した時だけtrueにする追加項目。
// 旧v1は受け入れ、成功・照合時に補完。不明値を捏造しない。
// externalIdが空ならekIdentifierを作らず、非空なら `${externalId}@${seriesStart}`。

// IndexedDB meta（バックアップには出さない）
{key:'nativeOutbox',items:[{
  opId,kind:'update'|'delete',eventKey,link,span:'this'|'future'|'all',
  occurrenceStart:null /* またはoccKey */,payload:{/*変更した対応項目のみ*/},
  newParentId, newRequestId, createdAt, tries:0
}]}
{key:'notifyBackfillV1',value:'<ISO日時>'}
```

nativeLink追加項目はbackupの既知検証にも加える。5回失敗などの永続エラーに新たなwarn値は増やさず、解除できる対象はunlinkedにし、表示用の失敗理由は別途保持する。削除済み親の通知はoutboxのlink写しから判断する。

作成記録v2はUserDefaultsの `duo.native.created.v2`：`[requestId: [itemId:String,eventId:String,fp:String,at:Number]]`。fpは元fingerprintのUTF-8に対する**通常のSHA256の小文字hex**（暗号化・HMACではない）。予定名・場所・メモ・fingerprint原文は保存しない。v1をload時にハッシュ変換してv2へ保存後、`duo.native.created.v1` を削除。上限500件をatの古い順に除く。

## PR 1：通知の純粋関数・既定値（手順書§1、§2データ形式）

- **変更**：新規 `app/js/notify.js` に `NOTIFY_DEFAULTS/TIMED_BEFORE/ALLDAY_DAYS/MAX_PENDING=60/WINDOW_DAYS=30`、`normNotify/defaultAlarms/alarmsFor/fireAt/notifyText/planNotifications` と共通alarm検証を置く。`app.js loadNotify/saveNotify/doExport`、`util.js validateDraft`、`backup.js` のalarm検証・buildBackupを接続。新規値だけ既定を写し、既存undefinedを[]や既定へ正規化しない。
- **計画**：全イベント（非表示カテゴリも含む）を37日先までexpandし、発火がnowより後かつ30日以内のものを発火時刻→安定id順に60件。`expand.make` はnativeLink/originを回にコピーしないので、**展開前の親で除外するかparentId索引で判定**する。iphone・linked・pendingは除外しunlinkedは許す。移動override・exdates・alarm継承を尊重。DSTで発火ローカル時刻が欠落する場合はDateの補正時刻を使う。系列の欠落回をスキップするrecurの既存規則は変えない。
- **API/形式**：Swift呼出しなし。戻りitemsは `{id:'duo.<parentId又はid>@<occKey又はstart>#<n>',title,body,fireDate,thread:'duo.YYYY-MM-DD',day,eventId:<Duo親id>}`。文面は02§3、予定名40文字＋…、showTitle:falseでは本文にも予定名・場所なし。
- **テスト**：`test-unit/notify.test.mjs` 新設。既定・不正値・全alarm・範囲境界・61→60・安定id・繰り返しlinked除外・移動例外・同時刻・DST・文面・冪等性・1万件の性能（100ms目安）を両TZで検査。backup.testに設定既定の書出しとalarms往復、validateDraftの不正値・undefined保持を追加。Playwrightはsearch-backup.specで未保存でもsettings.notifyが書き出されること。
- **完了**：既存データを変えず、常に既定込みの通知設定を書き出せる。新モジュールのSW登録と共通チェック完了。
- **読み替え**：recurのBODY/make/pickは既にalarms対応。util→notify→recur→utilの循環を作らないよう、検証は独立した小モジュールへ分離するか、notify側のrecur依存と検証の依存関係を整理する。

## PR 2：Swift通知API（手順書§1 DuoNative API）

- **変更**：既存 `DuoNativePlugin.swift` にUserNotifications import、`NotificationHandlerProtocol`、5メソッドのpluginMethods登録、loadでnotificationRouterのハンドラと時刻変更observerを登録しdeinitで解除。既存calendarChangedを維持。AppDelegate/SceneDelegateはcold startでrouterへ届かない場合だけ既存の起動引数転送を補う。新Swiftファイルなし。
- **API**：`notifyStatus({}) / requestNotifyPermission({}) → {status:notDetermined|denied|granted|provisional|ephemeral}`。許可要求はnotDetermined時のみalert/sound。`notifySync({items}) → {scheduled,removed,skipped}`、61件以上・構造不正はINVALID_ARGUMENT、未許可PERMISSION_DENIED。過去・解釈不能fireDateはskipped。`notifyClear({}) → {removed}`、`notifyTest({}) → {scheduled:true}`（60秒、id duo.test）。`notificationTapped → {day,eventId}` はretainUntilConsumed、`timeChanged → {reason:'timeZone'|'significant'}`。
- **動作/データ**：専用 `app.duo.calendar.notify` キューで、非同期add完了まで次のsync/clearを進めない。queue.asyncだけで非同期処理の直列化が済んだとしない。全件検証後にduo.のpending（test除く）を削除、Calendar triggerを追加しDispatchGroup等で完了を待つ。clearはduo.のpending/delivered両方、test含む。他アプリ・他prefixは触らない。sound/thread設定、userInfoはday/eventIdだけ。前面はbanner/list/sound。本文のログ出力なし、meta/UserDefaultsへの通知本文保存なし。
- **テスト**：Swift parse。Playwrightのbridge契約試験で5メソッドの引数・状態・エラーと2イベントを偽装し確認（これはSwift実動作の証明にはしない）。純粋関数の追加なし、PR 1単体を全件継続。Macのシミュレータでtestの60秒後到着、タップ・前面表示を確認。
- **完了**：parseと共通チェック成功、Macでprotocol適合・router型をビルド確認。実機未確認は明記。
- **読み替え**：今のMainViewControllerがcapacitorDidLoadでプラグインを登録済み。別プラグインやUNUserNotificationCenter.delegateの二重設定を増やさない。

## PR 3：再予約の全起点（手順書§2の表全部）

- **変更**：`app.js` に `requestNotifySync/runNotifySync`、通知状態N、直列Promise chainを追加。`native.js call/listen` を使用。公開呼出し名 `syncNotifications(reason)` はrequestNotifySyncへ委譲する別名としてこのPRで定義し、PR 10の指定名を満たす。
- **制御**：500ms trailing debounce、要求ごとに世代加算。開始前、status取得後、計画後、応答をNへ適用する前に世代を照合。古い応答は表示へ適用しない。既に送信済みの呼出しは完了まで待ってから最新世代を送る。失敗でchainを切らない。オフのclearも同じchainで順序保証し、古いsyncがclearの後に残らないようにする。通知許可はここでは要求しない。granted/provisional/ephemeralだけsync。

| 起点 | 現状の追加位置／reason |
| --- | --- |
| 起動 | initNativeのcalendar権限確認による早期returnより前で2イベント購読、bootのDB読込後にlaunch。連携オフでも動く |
| 前面復帰 | visibilitychangeでresumeExtと独立してresume |
| 保存・範囲編集・削除・作成結果 | commitのDB成功・state更新・bumpRevisionの後にedit |
| カテゴリ変更・削除・undo | commitCatsの成功後にcategory |
| 追加／置換import | finishImportでstateと置換notify設定が確定してからimport（失敗時なし） |
| サンプル | loadSample成功後にsample |
| 通知許可取得 | PR 4の許可処理が許可状態へ移った後にpermission（ここでは共通ヘルパーを用意） |
| カレンダー許可・store.reset後 | lkRequest→enableLink完了後にcalendarAccess（Swift resetはPR 5） |
| 結びつき変化 | 共通の状態更新後にlink（PR 7のoutbox結果もここへ接続） |
| TZ／大きな時刻変更 | timeChangedでbumpRevisionとtime。外部キャッシュも無効化 |
| 通知設定変更 | オン・既定・showTitle変更はsettings、オフは直列clear（PR 4から接続） |

- **API/形式**：PR 2契約のみ。N.scheduled/N.lastReasonはメモリ、予約そのものはバックアップ/metaへ入れない。settings.notifyなしの置換では現在設定を維持。通知未許可の復元ではパネルでの許可案内を出す。
- **テスト**：notify.spec新設、全起点をモックで検査。UI未実装の設定・許可分岐は共通ヘルパーの契約試験を先に追加しPR 4で操作試験を接続する。3連続commit→1送信、status/同期遅延中の世代更新、古い応答破棄、同時実行数1、オフ→clearのみ、例外後の次要求成功、同一backup二重追加でも予約件数不変。純粋計画の冪等単体はPR 1を継続。
- **完了/読み替え**：全起点が配線済み。500msは「最後の要求から送信を開始できるまで」の待ちでありOS完了まで500ms保証ではない。通知同期をextActiveに従属させない。

## PR 4：第10版画面へ通知UI（手順書§1・§1.6、02§1〜6）

- **変更**：`index.html` 編集の終了.pair直後・repeat直前へ通知行／条件付き第2行、新規 `#notify.panel.full` とメニュー `data-m=notify`。入口はカテゴリの次等に置き、既存「iPhone カレンダー連携→バックアップ」の隣接は保つ。app.jsのpanels配列・Esc・inert・focus復帰・openMenu分岐へ登録。app.cssは既存safe/右ページ枠を利用。
- **フォーム**：readForm/showEditor/valuesFrom/openEditor/saveDraft/boot復元/validateDraftにalarmsを貫通。新規だけdefaultAlarms、既存未定義を開いて保存しても勝手に既定を付けない。終日切替はbefore>=1440→前日08:00、他→当日08:00、戻すとdefaultTimed。明示[]は維持。2件同値を禁止。行44px、文字15px（select本体の入力16pxによるiOSズーム対策は維持）、注記12px、linked注記13px。
- **許可/API**：Duo通知を持つ保存のDB成功後、notDeterminedならrequestNotifyPermissionを一度だけ要求（範囲保存も対象）。拒否しても保存成功。パネルのオン操作でも要求可、起動では要求しない。通知パネルは52pxスイッチ、既定2行、showTitle、予約中n件・30日/60件の説明、notifyTest、拒否/仮許可案内・openSettingsを02どおりに実装。linkedはEKAlarm案内と、フルアクセスなしの無効化・設定誘導。iPhone由来は通知行なし。
- **配置/描画**：ベルはcard/dayList/weekEvent/tlBlock等の時刻横に12px、月weekInnerのチップ・帯には付けない。VoiceOverに通知値を追加。第10版は旧「次の予定」カードを描いていないので、閉じた一覧の最初の未来予定の時刻行へ「HH:MM に通知」を補足する。全体オフ時も編集行を残しパネルへの案内を出す。Webは入口・行・ベルすべてなし。
- **タップ**：通知イベントはDB読込まで保留し重複処理を防ぐ。dayを検証後、home:false、閉じた／縦はview:day、見開きは月＋右時間軸となるview:monthへ。対象のoccKey又はday内の回をDuo親idから解決、右時間軸はrender/initTimeline後にスクロールし1.5秒2px琥珀枠。月チップでなく表示された一覧／時間軸を強調。削除済みは日だけ開く。詳細・編集は開かない。
- **テスト**：notify.specで全選択肢、2件・なし・下書き復元・終日変換・初回許可一回/拒否時保存・パネル設定/clear/test・linked/writeOnly/Web・3姿勢タップ/削除済みを検査。safe-layout/ref-layout/timelineに通知パネルの右本文内収容、枠/影の折り目非交差、回転、フォーカス復帰、ベルによるoverflowなしを追加。単体は変換・重複検証を追加。
- **完了/読み替え**：通知UIが第10版の4タブ／操作列と共存。EKAlarmの実送信はPR 5/7で接続する段階差を記録し、PR 7まで連携更新の新文言を先行させない。共通チェック成功。

## PR 5：Swift識別子・権限・作成記録v2（手順書§3.2・§3.5・§1.6）

- **変更**：DuoNativePlugin.swiftのensureAccessにWRITE_ONLY、requestPermissionのgranted完了時はEventKit直列queueでstore.resetしてからresolve。load/loadCreated/saveCreated/createEvent/listEventsをv2対応。CryptoKitをimport、新ファイルなし。
- **API**：listEvents既存各要素に `{itemId,externalId,occurrenceDate,modifiedAt}`（occurrenceDateはstamp又はnull、modifiedAtはms又はnull）。createEventは既存 `{requestId,calendarId,title,start,end,all,place,notes}` に `alarms?` を追加し `{itemId,externalId,eventId,modifiedAt,calendarId,occurrenceDate}` を返す。calendarIdは移動先更新にも使う追加戻り値。旧JSは追加フィールドを無視できる。
- **データ**：前掲作成記録v2へ移行。createの新fingerprintはalarmの有無/[]/内容も安定した形式で含め、同じrequestIdの異なる作成内容を拒否。v1から移した旧ハッシュはalarm未指定の旧リクエストとの照合を維持し、変換のため本文を残さない。v2再呼出し・URL印回収のどちらでも同じ識別子の戻り形式に揃える（必要ならEventKitから取得）。alarms未指定は変更なし、[]は明示解除。時刻ありrelativeOffset=-before*60、終日は-day*86400+h*3600+m*60。
- **テスト**：Swift parse。native.specのモック戻り値をv2へ拡張し、旧eventIdのみの応答もJSが壊れないこと、alarm引数、WRITE_ONLYを契約検査。ハッシュ移行/件数間引き/URL回収の実動作はMac/実機で確認し、JSモックで検証済みとはしない。既存単体全件。
- **完了/読み替え**：v1キー消去、v2に本文なし、at順500件、許可直後に一覧取得可。PrivacyInfoのCA92.1、Info.plistの既存3カレンダー説明キーは維持。

## PR 6：Swift更新・削除・範囲（手順書§3.1〜3.4）

- **変更**：DuoNativePlugin.swiftへfindTarget、対応項目適用、recurrence変換、updateEvent/deleteEventを追加しpluginMethodsへ登録。EventKit既存queueで直列実行。
- **API**：`updateEvent({itemId,externalId?,eventId?,requestId,calendarId,occurrenceStart?,span,expectModified?,force?,title?,start?,end?,all?,place?,notes?,alarms?,recurrence?,newRequestId?}) → {itemId,externalId,eventId,modifiedAt,calendarId,occurrenceDate}`。payloadは差分なので本文項目は任意。`deleteEvent({itemId,externalId?,eventId?,requestId,calendarId?,occurrenceStart?,span,expectModified?}) → {deleted:true,missing?:true}`。失敗はNOT_FOUND/updateのみ、CONFLICT、WRITE_ONLY、PERMISSION_DENIED、RESTRICTED、READ_ONLY、CALENDAR_NOT_FOUND、INVALID_ARGUMENT、UNAVAILABLEを区別。
- **特定**：itemId→externalId（複数ならURL、次に開始）→eventId→開始±1日のURL検索。occurrenceStartありは同系列のoccurrenceDateを照合してその回を取る。曖昧な候補を勝手に選ばない。allは現在回ではなく系列先頭を検索するため、JSはlink.seriesStartをoccurrenceStartに渡す。
- **範囲**：単発/only=this→.thisEvent、following=future→対象回から.futureEvents、all/最初のfollowing=all→先頭から.futureEvents。future更新では保存前にnewRequestIdのURLへ変更、保存後の新系列idを返す。取れなければ保存後±1日をURL再検索。alarmsは渡された時だけ差替え、recurrence:nullは規則解除。daily/weekly（曜日0→EKの1等）/monthly/yearly、count/untilをDuoと対応させ、31日・2/29・DSTは実機照合する。
- **競合**：lastModifiedDateがexpectModifiedより1秒以上新しければCONFLICT。updateのforceだけ比較を迂回。deleteにforce経路を作らない。見つからないdeleteはmissing:true成功、readOnlyは拒否。calendarIdは見つかった実カレンダー値を返す。
- **テスト**：Swift parse。native.specで新APIの差分/空配列/null/各span/新requestId/全失敗をモック契約検査、単体のJS→EK規則期待表を追加。Swiftの探索・分割・競合動作はMacで型検査し実機で確認。
- **完了/読み替え**：単発更新・削除が実機で反映。PR 9前でもlinked単発を繰り返しへ変更するupdate経路を実装しておく。

## PR 7：JS送信待ち・反映・削除文言（手順書§3、07全文）

- **変更**：iphone.jsに純粋な `planNativeOps(prev,plan,scope,occKey,form)` とoutbox統合。db.jsに `applyChangesWithOutbox/getOutbox/putOutbox`、結果反映用の原子的ack更新を追加。app.js commit/submit/scope click/削除/createNative/initNative/resumeExt/enableLinkに接続。native.js errTextへWRITE_ONLY/NOT_FOUND/CONFLICT等。index.htmlとapp.cssの確認表示も変更。
- **原子性**：イベントputs/delsと `meta.nativeOutbox` 更新は同一events/metaトランザクション。commitのDB成功後にrequestNotifySync('edit')とflushOutbox。送信結果のqueue削除とlink更新も同一tx、opIdでackし、古い結果で新しい編集の本文やqueueを上書きしない。replace importはevents/categories/meta同一txで、eventKeyとrequestIdが両方一致する待ちだけ残す。実行中はimportとの競合を制御し、置換によるdeleteを生成しない。
- **計画/API**：単発this、only this+occKey、following future+occKey、最初のfollowing/allはall+seriesStart。本文対応8項目（title,start,end,all,place,notes,recurrence,alarms）差分のみ。カテゴリだけなら0件。futureのnpに新requestId/pendingを付け、元親link/seriesStartを維持。成功はnewParentId側へ新idを埋める。作成は既存pending＋createNativeの冪等経路を維持し、alarmsとv2戻り値を保存する。
- **送信**：flushは1本のchainで1件ずつ。保存直後・起動・復帰・許可取得で再送。連続保存は短い待ちでまとめる。同一eventKey/spanのupdateでも**occurrenceStartの異なるonly/futureは別操作**とし、同じ対象だけ最新へ統合する。差分は前の未送信項目を合併して値を最新にする。deleteは実際に削除する範囲の先行updateを除く（別の回の更新は消さない）。依存するfuture分割→np編集は新linkが確定してから送る。
- **結果**：成功はid/ekModified/ekIdentifier/syncedAt/warnを更新してack。NOT_FOUND updateはunlinked/missing、Duo予定を残し「iPhone のカレンダーに元の予定が見つからないため、結びつきを外しました。Duo の予定はそのまま残っています。」、link再予約。missing deleteは成功。CONFLICT updateはforce:trueでDuo内容を上書きし「iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。」。**CONFLICT deleteだけは手順書§3.4の明示例外**でiPhoneを残し、解除して「iPhone 側で変更されていたため、iPhone の予定は残しました」。WRITE_ONLYは待ち保持/warn:writeOnlyとフルアクセス案内、denied/restrictedは待ち保持/dropLink。READ_ONLY/CALENDAR_NOT_FOUNDは解除・警告。その他はtries++、5回で待ちから除き解除・警告。失敗を同一flush内で5回連打せず次の起点で再試行。
- **削除UI**：07の本文をtextContentで表示（改行保持、13px #68716A）。Duoのみは予定名、linkedは予定名＋「iPhone のカレンダーからも削除されます。」、繰り返しは「削除する範囲」に同じ本文と赤い3範囲。現状の範囲→最終確認の安全な流れを維持し、最終確認にも警告を表示。権限なし/書込不可は「Duo からだけ削除されます。iPhone のカレンダーには残ります。」＋「Duo から削除」。この明示選択ではnative deleteを積まず、対象範囲の未送信updateも止める。通常の反映失敗は待ちに残し、4秒トースト「iPhone のカレンダーに反映できませんでした。次に開いたときにもう一度試します。」。キャンセル左・初期focus、削除右。Googleとは書かない。
- **表示の整合**：updateXUiの `!cur.occKey` を外して親linkを見る。linked案内/連携説明の「反映されません」を「Duo で変えた内容は iPhone のカレンダーにも反映されます。」へ変更（iPhone由来readonlyと区別）。linked通知はcreate/updateのEKAlarmへ送りDuo通知から除外。pending失敗が確定して解除した時だけDuo通知へ戻す。待ちupdateの間もdedupeする。削除待ちの外部予定はoutboxのlinkと範囲を使って一時的に非表示とし、失敗解除後は再表示できるようにする。
- **テスト**：新native-ops.testで全scope/最初のfollowing/npの別requestId/alarmsだけ/カテゴリ0件/差分統合/別回維持/delete順序。backup.testで分割2親の再読込と異なるrequestId。native.specで全結果、再起動後再送、3連続編集1回、権限なし削除のnative呼出し0、全削除後再起動、inflight中の編集・置換、tx abortで本文/待ち両方rollback、EKAlarm引数、文言/focus。単体のみでIndexedDB原子性を検証済みとしない。
- **完了/読み替え**：ローカル保存と送信待ちが分離しない。失敗・競合を利用者に通知、本文の古いスナップショットで新編集が失われない。07の権限なし削除は通常の権限エラー再送とは異なる明示操作として扱う。共通チェック成功。

## PR 8：端末をまたぐ照合（手順書§4、§3のbackup検証）

- **変更**：iphone.js toDisplayにitemId/externalId/occurrenceDate/modifiedAtを保持、`refreshLinks/relink` 新設、dedupeを拡張。app.js createNative/flush成功/loadExt/finishImportへ接続。backup.js linkOkにekModified/seriesStart/matchedBy/conflictと前掲追加フィールドの型・長さ検証。v1/v2/v3バックアップ読込互換は維持。
- **API/データ**：PR 5/6のAPIを使用、新規Swift APIなし。refreshLinksはrequestId又はitemId一致でexternalIdが空→非空又は変化したときだけ更新し、同一値で毎回commitしない。seriesStartは原系列先頭を保持、splitではnpの先頭。calName/calSourceも作成・照合時に記録。対応確定時はitemId/eventId/calendarId/ekModifiedも実値へ更新。
- **照合順**：現在端末にitemIdがないlinkedのみURL→externalId＋開始（系列はseriesStart/回の対応）→fallback。fallbackは復元中だけ、trim済タイトル・開始・all・calName/calSourceが一致する未使用候補ちょうど1件に限る。旧linkに名前の記録がなければfallbackしない。復元対象idをメモリで追跡して外部読込後にも再試行できるようにする。通常表示時にタイトル推測しない。取得範囲外で見つからないだけならlinkedのまま、勝手に解除しない。二重requestIdの復元は先の1件だけlinked、後はunlinkedとして警告。
- **重複除外**：eventId/requestId/itemId、又はexternalId一致＋単発の開始一致。系列はoccurrenceDateがseriesStart〜until（終了日含む）およびcountの実在範囲に入るかを判定。UIDだけで分割前後や別単発を隠さない。unlinkedの古いrequestIdを使って隠さない。pendingと待ちupdateは既存の二重表示抑止を維持。
- **安全な適用**：loadExtの世代確認後に照合し、DBへの保存時にも現イベント/requestIdとの一致を再確認。照合によるlink更新はnative updateを生成しない。fallback最初の削除だけ07本文に追加で「iPhone のカレンダーの『○○』も削除されます」を表示し、確定した時にfallbackDeleteConfirmedを保存する。cancelでは消費しない。
- **テスト**：新iphone-link.testで全キー、同UID別開始、分割範囲/count、externalId遅延・変更・同値、URL優先、一意fallback/複数拒否/使用済拒否/通常時禁止。backup.testでv2全項目往復、別id/requestIdでも同ekIdentifierは重複。native.specで別端末id・URLなし復元・二重requestId・fallback削除名・cancel・再起動・古いload応答を検査。復元前の重複警告文も実装に合う説明へ更新。
- **完了/読み替え**：バックアップのr:/k:重複キーは既存を拡張利用。iCloud/Googleで入れ直し・別端末復元後に二重表示なしを実機確認。externalIdが常に直後から不変とは仮定しない。

## PR 9（任意）：新規繰り返しの「iPhone にも追加」（手順書末尾PR 9、§3エッジケース）

- **変更**：app.js submitの `!item.recurrence` とupdateXUiのrepeatingによる無効化を外す。createNativeからrecurrenceを渡す。DuoNativePlugin.swift createEventでPR 6の規則変換を再利用し、作成ハッシュにも正規化recurrenceを含める。旧・単発再試行のハッシュ互換を維持。
- **API/データ**：createEventに `recurrence:null|{freq,interval:1,byDay,count,until}` を追加。戻り値・nativeLink v2/outbox形式は変更なし。開始・終日・系列先頭を既存契約へ揃える。既存の例外入り系列を丸ごと新規書込する機能へは広げない。
- **テスト**：規則正規化/安定ハッシュ入力の単体、native.specでチェックボックス・作成payload・再試行の同requestId・作成後全scope反映・二重通知なし。Swift parse。実機で毎日/毎週複数曜日/毎月31日/毎年2月29日/count/until/DSTをDuo展開結果と照合し、future分割の新URL・idも確認。
- **完了/読み替え**：Mac/EventKitとDuoの回が一致し、PR 1〜8の全チェックも成功。見送る場合は無効化と案内を維持したままPR 10へ進む（既存linkedの規則更新はPR 6/7で実装済み）。

## PR 10：一度だけの既定通知付与（手順書15:52追記）

- **変更**：notify.jsに純粋な `planNotifyBackfill(events,now)`、recur.jsに必要なら `hasFutureOccurrence(parent,now)` を追加。db.jsへ `backfillNotifyOnce(now)` を追加し、events/metaの1トランザクションでマーカー確認→カーソルで対象更新→マーカーput。app.js bootのDB成功後・initNativeのlaunch同期より前に実行。成功後state再取得/bumpRevisionし `syncNotifications('backfill')` を**一度だけ**呼ぶ。通常launchと同一debounceにまとめ、2回OSへ送らない。
- **対象/値**：origin !== iphone、nativeLinkがない、alarms === undefined、未来の予定だけ。nativeLinkがunlinkedであってもオブジェクトがあるものは対象外。alarms:null、[]、既存配列、overrideの値、過去は触らない。移行で付けるのは固定の時刻あり[{before:30}]／終日[{day:0,at:'08:00'}]（利用者が変更した新規用既定へ読み替えない）。親にだけ付けoverrideの[]/独自alarm/null継承を壊さない。
- **未来判定**：単発・複数日はローカルend > now（等しい場合は対象外）。系列は現在以降に有効な回が1つでも残るか、開始が過去でも終了が未来の回があるかで判定。count/until・exdates・移動override・欠落DSTを尊重。予約の30/37日窓では判定しない（次が4年先の2/29や翌年でも対象）。有限系列は上限9999の実在回を数え、無期限系列は次の有効候補を調べる。無効なuntil外overrideを未来の証拠にしない。既存recur.testのゴーストoverrideのtodoをこの判定に持ち込まず、候補の実在性を検証する。
- **データ/API**：meta `{key:'notifyBackfillV1',value:<ISO日時>}`。対象0件でも正常終了なら記録。abortなら予定・マーカー双方rollback、次起動で再実行。readwrite tx内で判定とマーカー参照を行い多重起動にも一度だけ。Swift/API変更なし。Webでもローカルの移行・マーカーは実施し、syncNotificationsはnativeでないので呼出し先で何もしない。
- **import境界**：finishImport/validateBackup/withDefaultsからは絶対に呼ばない。既存ファイル値をそのまま採用し、置換でもmetaマーカーを消さない。初回起動時に移行完了を待ってready/ファイル操作を有効にし、初回復元の直後に意図せず一括付与が走らないようにする。
- **テスト**：新notify-backfill.testで対象/非対象、終日・複数日end境界、null/[]、unlinked、非表示カテゴリ、翌年/閏年/全回除外/移動override/count打切り/until打切り/DST、固定既定、2回実行同値。Playwright notify.specで実DBのマーカー・tx失敗rollback/再実行・2タブ競合・起動時1回同期・未許可時要求なし・マーカー後の通常新規既定・追加/置換import時無付与を検査。
- **完了/読み替え**：追記以前の「付けない」はこの限定移行でのみ置換。バックアップv3のバージョンやDB schemaは上げず、SW版だけ更新。共通チェック成功。

## Xcodeで手作業が要る点

**ソース登録・設定変更はなし。** 新Swiftファイルを作らず、既存AppターゲットのDuoNativePlugin.swift（必要時は登録済AppDelegate/SceneDelegate）へ収める。project.pbxprojのCompile Sources、ターゲット所属、Build Phasesへ追加なし。UserNotifications/CryptoKitはSDKのimportで利用し、追加パッケージなし。ローカル通知だけなのでPush Notifications/Background ModesのCapabilities、APNs設定、通知用Info.plistキーは不要。既存のNSCalendarsUsageDescription/NSCalendarsFullAccessUsageDescription/NSCalendarsWriteOnlyAccessUsageDescription、PrivacyInfo CA92.1は維持する。

後続担当がMacで行う検証は、既存プロジェクトを開く→Appターゲットでビルド→シミュレータ/実機へ実行。protocol適合・availability・SDK型検査、cold start時のnotificationRouterへの引渡しを確認する。parse成功を代用にしない。

## 実機確認（短縮チェックリスト）

1. 最初の通知付き保存だけで許可要求、拒否でも保存成功。60秒test、30分前、終日当日/前日08:00、前面/ロック/再起動/機内モードで到着。
2. TZ・大きな時刻変更と前面復帰で再予約。同日thread、showTitleオフで予定名・場所が出ない。30日/60件の件数とオフ時消去。
3. 終了状態からタップし3姿勢で正しい日と対象位置へ。4タブ・右列・折り目・safe/キーボードを回帰させない。
4. iCloud/Googleで作成・通知変更・単発/3範囲の編集削除。linkedはEKAlarmだけで鳴る。futureのURL/requestId/新系列idと反映時間を記録。
5. iPhone先行削除、先行更新→Duo上書き通知、先行更新→Duo削除時はiPhoneを残す。writeOnly→fullAccessで待ち再送、許可直後一覧取得。
6. UserDefaultsにv1なし・v2はhexとid/時刻のみ。入れ直し・置換・別端末で二重表示なし、GoogleのexternalIdの直後/同期後とURL往復を確認。
7. 移行は未来Duo/alarms未定義だけ一度付与。[]・iPhone・過去・打切り系列・復元ファイルを変えない。PR 9実施時は31日/2月29日/DSTの回一致も確認。
