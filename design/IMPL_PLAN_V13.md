# 第13版 実装計画（Claude Code：PRごとに1件ずつ）

基準：依頼指定 main `87069ab`、第12版B案済み、`app/sw.js` は v31。参照は旧行番号でなく関数名。本書は計画のみで、コード変更・テスト実行・git操作は行っていない。
正本は `/workspace/duo-calendar-team/data/連携_第3弾_iPhone予定の編集削除.md` 全文。配置は同プロジェクトの `design/09-iphone-events-edit.md` と `design/img/iphone-edit.png`、横月は `design/08-no-side-rail.md` §6.4、品質指摘は `qa/review-87069ab.md`。現行寸法式は本リポジトリの `design/IMPL_PLAN_V12.md` を参照。

## 共通・確定事項

- PR1→7を直列実装。各PRで `app/` の `npm test` と `npm run test:unit`（東京・NY）を全件成功させる。既知skip/todoは報告し、追加skip・assert削減で通さない。
- 各PRで `app/sw.js` のCACHEを1増分：PR1 v32、PR2 v33、PR3 v34、PR4 v35、PR5 v36、PR6 v37、PR7 v38。`tests/sw.spec.js` の更新・オフライン検査を維持。
- 各PRの共通変更先はSWと該当テスト。iOS引き渡し時は `npm run build:www` → `npx cap copy ios` で既存生成物を同期し一致確認（生成物を直接編集しない）。本計画担当の書き込みは本ファイルだけ。
- ext＝iPhone由来の表示予定、linked＝Duo由来でiPhoneと結びついた予定。extはIndexedDBのevents・outbox・バックアップへ入れず、EventKitを直接awaitする。既存linkedのrequestId・URL印・outbox経路は維持。
- 出席者ありは主催者でも読み取り専用。変更競合は差分上書き＋4秒のお知らせ、削除競合は再確認後だけforce。ext→Duoだけ、規則変更（単発⇔繰り返し含む）、既存Duoへの後付け連携は実施しない。正本の任意PR7は不採用、本書PR7は横月修正。
- 09の「触る→ポップアップ→編集」を採用。正本の「書けるextは編集シート」は編集ボタンからの遷移として実現。データ・エラー意味は正本を優先。
- 「書けるカレンダーなし」は正本§8のdisabled案より具体的な09 §4.1を採用：新規シートでは段を隠し、連携パネルだけdisabled＋案内。
- Swiftは既存 `app/ios/App/App/DuoNativePlugin.swift` 内、既存queue・ensureAccessを使用。新Swiftファイル・バンドルID変更なし。JS偽装はSwiftの実動作の証明にはしない。

## PR1：ネイティブ・読む側（v32）

**やること／ファイルと関数**：`DuoNativePlugin.swift` の `pluginMethods/listCalendars/listEvents/findTarget/parseAlarms/makeRule` を参照し、`getEvent`、詳細直列化、通知・規則の逆変換、編集可否判定を追加。list/getで本文と日時の直列化を共通化する。

**JS↔Swift契約（JSON型。Stamp＝端末ローカルのYYYY-MM-DDTHH:mm、MS＝Unixミリ秒number）**：

```ts
type Reason = 'readOnlyCalendar'|'birthdays'|'invitee'|'organizerWithAttendees';
type Alarm = {before:number} | {day:number, at:string}; // before:分、at:HH:mm
type Rule = {freq:'daily'|'weekly'|'monthly'|'yearly', byDay?:number[], count?:number, until?:string};
type Target = {itemId?:string, externalId?:string, eventId?:string,
  occurrenceStart:string, currentStart:string}; // 有効な識別子は最低1つ必要
// listCalendars({}) -> {calendars:Calendar[]}
type Calendar = {id:string,title:string,color:string,sourceId:string,source:string,
  sourceType:string,allowsModify:boolean,isDefault:boolean};
// getEvent(Target) -> Detail（ラッパーなし）
type RawEvent = {id:string,eventId:string,calendarId:string,title:string,start:string,end:string,
  all:boolean,place:string,notes:string,recurring:boolean,requestId:string|null,
  itemId:string,externalId:string,occurrenceDate:string|null,modifiedAt:number|null};
type Detail = RawEvent & {alarms:Alarm[],alarmsExtra:number,rule:Rule|null,ruleText:string,
  detached:boolean,allowsModify:boolean,sourceType:string,hasAttendees:boolean,
  isOrganizer:boolean,hasUrl:boolean,editable:boolean,reason:Reason|null,
  seriesStart:string|null}; // seriesStartは先頭判定用の補足（規則から推測しない）
```

- Swift入力はString／Double?／Bool、出力は `[String:Any]`、nullはNSNull。RawEventの終日endは現行listEvents同様「含む最終日の00:00」、EventKit内部は排他的end。時刻ありの翌日00:00も保持し、表示用23:59と混同しない。
- `findTarget` にext専用モード（URL利用なし）とcurrentStartを追加。itemId→externalId→eventId、externalId複数はURL・開始一致で絞らずUNAVAILABLE。回はoccurrenceDateで照合、occurrenceStartとcurrentStart各前後[-1日,+2日]の窓を和集合・重複除去。動かした回をstartで同定しない。既存linked呼出しの既定挙動は変えない。
- seriesStartはEventKitから一意に取れた系列先頭だけ。判別できなければnullとし、「最初の回のfollowing→all」を憶測で行わない。allで先頭を特定できなければUNAVAILABLE。
- 通知逆変換：時刻ありoffset≤0・分単位・最大40320分、終日はday=ceil(-offset/86400)、at=offset+day×86400、day 0〜30・分単位。最大2件、絶対日時・場所・範囲外・3件目以降はalarmsExtraへ。変換不能を黙って削除しない。
- 規則は完全に表現できる場合だけrule、interval>1や複雑な規則・複数規則はnull＋freq/intervalを含むruleText。編集可否は誕生日を一般readOnlyより優先し、出席者ありも明示reasonを返す。URL値は返さずhasUrlのみ。
- ensureAccessでWRITE_ONLY／PERMISSION_DENIED／RESTRICTED、引数不正INVALID_ARGUMENT、見つからないNOT_FOUND、曖昧UNAVAILABLE。getEventは読み取り専用でも詳細を返す。

**native.jsの偽装／読み替え**：製品の `app/js/native.js` は汎用 `call` のためメソッド追加不要。`app/tests/native.spec.js` の `mock()`（window.Capacitor.nativePromise）にgetEvent、isDefault、詳細fixture、詳細エラー・遅延を追加。後続用に `tests/ext-edit.spec.js` から再利用できるfixtureへ抽出可。旧fixtureの識別子欠落を補い、既存listEvents期待は維持。

**追加テスト／完了**：JSブリッジ直呼びで全フィールド・null・権限エラー・移動回の引数をassert。Macビルドと実機で通知逆変換、誕生日／出席者理由、曖昧拒否、3日動かした回の取得を確認。画面はまだ変えず、共通チェック成功で完了。

## PR2：ネイティブ・書く側（v33）

**やること／変更先**：同Swiftの `pluginMethods/updateEvent/deleteEvent/findTarget/isConflict/createdReply/parseAlarms`。`updateExternalEvent/deleteExternalEvent` と本文・日時・通知の共通適用関数を追加。`app/js/native.js` の `errText` にNOT_EDITABLEの日本語分岐（reason別表示はPR4）を追加。

**型つき契約（PR1の型を使用）**：

```ts
type Span = 'this'|'future'|'all';
type Body = {title?:string,place?:string,notes?:string,start?:string,end?:string,
  all?:boolean,alarms?:Alarm[],calendarId?:string};
type UpdateExt = Target & Body & {span:Span,expectModified:number|null,
  base?:{start:string,end:string,all:boolean}};
// updateExternalEvent(UpdateExt) -> Reply & {conflicted:boolean,alarmsApplied:number}
type Reply = {itemId:string,externalId:string,eventId:string,modifiedAt:number|null,
  calendarId:string,occurrenceDate:string|null};
type DeleteExt = Target & {span:Span,expectModified:number|null,force?:boolean};
// deleteExternalEvent(DeleteExt) -> {deleted:true,missing?:boolean}
type NativeError = {code:string,message?:string,reason?:Reason};
```

- `base` はall日時差分のための本計画の補足：開いた回の未変更start/end/all。Target.currentStartだけでは元の長さが分からないため必要。日時変更all時は必須検証、その他では省略。本文の変更項目ではない。JSの純粋計算とSwiftの計算は同じ仕様、変換はSwiftで一度だけ行う。
- this＝対象回.thisEvent、future＝対象回.futureEvents、all＝一意な系列先頭.futureEvents。all日時は開始差Δsと長さ差Δdをbaseから計算し、先頭startにΔs、先頭の長さにΔdを加える。開いた回の絶対日付を先頭へ代入しない。終日の排他的end変換・DST・終日切替も共通化。
- 最新を読み直し、編集可否を保存／削除直前にも確認。READ_ONLYまたはNOT_EDITABLE(reason)で拒否。calendarId移動は書込可能な存在する先のみ、繰り返しはallのみ。他spanの移動をINVALID_ARGUMENTで拒否。
- `recurrence` はnullでも存在すればINVALID_ARGUMENT（既存hasはnullを無視するのでキー存在で検査）。requestId・URL探索・URL上書き・作成記録の保存はext経路に入れない。
- updateはisConflict同様1秒以上新しければ上書きしconflicted:true、force再送なし。送られていない項目・規則・URL・通知は最新値を残す。alarms送信時だけ置換し、保存後の通知実数をalarmsAppliedへ。
- deleteは競合かつforceなしでCONFLICT、force:trueで再取得・可否再検査後に削除。不存在はdeleted:true,missing:true。update不存在はNOT_FOUND。
- 共通エラー：INVALID_ARGUMENT／READ_ONLY／NOT_EDITABLE／NOT_FOUND／UNAVAILABLE／CALENDAR_NOT_FOUND／WRITE_ONLY／PERMISSION_DENIED／RESTRICTED、削除のみCONFLICT。失敗を自動再試行しない。

**偽装／読み替え／追加テスト**：mockに独立したext操作分岐を追加し、旧updateEvent/deleteEventのrequestId必須を流用しない。引数検証・差分反映・ID変更・missing・conflicted・削除force・alarmsApplied減少を再現し、ブリッジ直呼びで契約を検証。既存 `native.spec.js` のlinked競合→forceや `test-unit/native-ops.test.mjs` のoutbox期待は維持。

**完了**：共通チェック＋Macビルド。実機でURL・未変更通知・規則の保持、全範囲の保存削除、先頭差分、権限／出席者再検査、ID変更を確認。JSモックでEventKit成功と断定しない。

## PR3：JS純粋ロジック（v34）

**やること／変更先**：`app/js/iphone.js` の `toDisplay/writable/bodyDiff/planNativeOps` を参照し、`extEditable/buildExtArgs`、範囲正規化、all日時差分計算、offset逆変換の純粋関数を追加。DOM・native呼出し・DB書込は入れない。既存linkedのplanNativeOps契約は変えない。

- `extEditable(x,cal,detail)` はJSとnativeのどちらかの拒否でreadOnly、詳細未取得／カレンダー不明も許可しない。4理由を返し、主催者でも拒否。誕生日は固有理由を優先。
- `buildExtArgs(before,after,scope,detail)` はTarget＋span＋expectModifiedと変更項目だけ。occurrenceStart=occurrenceDate||start、currentStart=開いたときのstart。日時変更はstart/end/allを一組、rawEndと終日の含む最終日規約を保持。all日時時だけbaseを添える。
- followingはseriesStartとの元の回日付一致でallへ。recurringはrule:nullでも維持し、規則を再構築しない。calendarId変更は単発かallのみ。requestId・recurrence・カテゴリ・nativeLinkを出力しない。
- 通知未操作ならalarms省略。通知操作後は[]も明示し、未表現通知を置換する。既存通知なしへ既定を補わない。未知の20分前は値を保持。

**JS↔Swift／偽装**：PR1・2型そのまま。native.js／mockの新機能追加なし、純粋関数出力を既存mockへ渡して契約整合を確認。

**読み替え／追加テスト**：`app/test-unit/iphone-link.test.mjs/native-ops.test.mjs` のdedupe・linked spanを維持し、新規 `test-unit/ext-edit.test.mjs` に4理由＋矛盾、差分、全span、先頭following、移動回、空差分、calendar移動制約を追加。all差分は+1時間／+1日／長さ変更／終日⇔時刻あり／NY DSTを検証。
通知はoffset 0,-1800,-86400、終日+28800,-57600,+86399、非分単位・正の時刻あり・3件目を検証。`notify-backfill.test.mjs` にext風入力を変更しない回帰を追加。Swiftは同fixture値を実機確認しJS成功で代用しない。

**完了**：純粋関数の入力不変・差分のみ・正本規約が固定され、共通チェック成功。

## PR4：画面・編集と削除（v35）

**変更先**：`app/js/app.js` の `openEditor/openExtDetail/showEditor/readForm/editSnap/editorDirty/saveDraft/closeEditor`、form submit、`openScope/deleteNotice/askDelete/showConfirm/cancelConfirm` とscope・削除ハンドラ、`editLinked/updateAlarmUi/afterExt/loadExt/initNative/MSG`。`app/index.html` のxdetail/editor/scope/confirm、`app/css/app.css` の対応部品。

- extを開くたびgetEventで確認。取得中／失敗時は編集・削除を出さず、応答世代を確認して別予定／閉じたシートへ遅い応答を適用しない。ポップアップは09の17pt見出し、22pt札、44pt操作（削除赤・編集緑、隙間8・左右16）、小さい「カレンダーで開く」。readOnlyでは理由＋大きい「カレンダーで開く」だけ。
- 編集は別のext編集状態と詳細の不変snapshotを保持し、Duoのresolve/commit/outboxへ流さない。カテゴリを44ptカレンダー選択へ、見出しにも札、規則はruleSummaryかruleTextの表示だけ。単発にも規則切替を出さない。
- 繰り返しのカレンダーを変えたらscopeのonly/followingをdisabled＋「カレンダーの変更は『すべて』でのみできます。」。他scopeでcalendarIdを送らない。単発は移動可、返却IDで対象を更新してloadExt(true)後も古いIDを使わない。
- 通知はiPhone値のまま、20分等もalarmOptionsへ一時追加。`editLinked`相当の案内をextにも適用し、alarmsExtraの件数と置換注意。下段は「変更は iPhone のカレンダーに保存されます。」＋「カレンダーで開く」。
- 保存／削除はPR3引数でPR2 APIをawait、連打を防ぎ、失敗時は入力保持・再操作可能。成功は閉じてloadExt(true)で即表示、通常成功トースト・反映待ち表示なし。calendarChangedと保存後再読込の重複／古い世代を捨てる。再読込失敗を「保存失敗」にして再送させない。
- `afterExt`は入力・snapshot・expectModifiedを更新せず、対象消失時だけ09の36pt注意帯。保存は有効。権限喪失時もDuoだけへの保存／削除へフォールバックしない。
- dirty判定はextのcalendarIdも含む（現行editSnapのxcal除外をそのまま使わない）。外タップ・下スワイプ・✕の破棄確認、inert・focus復帰を維持。ext本文をローカル下書きとして永続化しない。

**表示・削除契約**：

| 場面 | 動作・文言 |
|---|---|
| 単発削除 | 「この予定を削除しますか？」／予定名＋改行＋「iPhone のカレンダーから削除されます。」／キャンセル・赤「削除する」 |
| 繰り返し削除 | 「削除する範囲」／同本文。only/followingは直実行、allだけ2段目 |
| allの2段目 | 「すべての繰り返しを削除しますか？」／「iPhone のカレンダーから削除されます。」／キャンセル初期focus・赤「すべて削除」 |
| update conflicted | 閉じて4秒「iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。」 |
| update NOT_FOUND | 「この予定は iPhone のカレンダーで削除されています」・本文なし・「閉じる」だけ。押すまで編集シート保持、押すと両方閉じる |
| delete CONFLICT | 「iPhone のカレンダーで内容が変わっています」／「それでも削除しますか？」／キャンセル初期focus・赤「削除する」。承認時のみ同一対象・spanでforce:true |
| delete missing | 閉じて4秒「この予定はすでに iPhone のカレンダーから削除されていました。」 |
| 通知2件→1件 | 4秒「このカレンダーでは通知は1つだけ保存されました。」（正本§6の文言）。競合もあれば両通知を順に見せる |
| 一般失敗 | 保存「iPhone のカレンダーに保存できませんでした。もう一度お試しください。」／削除「iPhone のカレンダーから削除できませんでした。」を4秒 |
| UNAVAILABLE保存 | 「iPhone のカレンダーに保存できませんでした。カレンダーで開いて変更してください。」＋開く導線、入力保持 |

**偽装／読み替え／追加試験**：`tests/ext-edit.spec.js` で書込可／4理由、get遅延・失敗、全span・移動制約、差分・base・元のoccurrenceStart、通知0／未知値／extra保持と置換、全競合・missing・force取消、二重送信防止を検査。mockは返却ID変更とcalendarChanged、開いている間の外部変更・削除を操作できるようにする。
旧 `tests/native.spec.js` の「全extに編集削除なし」をreadOnly fixtureに限定し、書込可にはポップアップ→編集を追加。linkedの「からも」・既存scope期待は維持。`popup-dismiss/notify/search-backup`各specに破棄・focus・ext除外の回帰を追加。保存削除前後でIndexedDB events/outbox不変、バックアップにextなし、notifySyncにextなしをassert。

**完了**：共通チェック成功、09の書込可／不可／編集／範囲／競合状態を合成データで撮影。実機でdetachedのall操作後を記録し、個別変更が消えるなら「個別に変えた回も元に戻ることがあります。」を範囲注意文へ追加。

## PR5：「iPhoneにも追加」を標準オン（v36）

**変更先・やること**：`app/js/iphone.js` の `DEFAULTS/normSettings` と追加先選択純粋関数、`app/js/app.js` の `openEditor/showEditor/updateXUi/saveDraft/renderLink/setLink/createNative` とLKハンドラ、`app/index.html` のxadd/xcal、`app/css/app.css` のswitch/card。
- addByDefaultは未保存・不正値true、明示falseだけfalse。新規初期値はextActive()&&addByDefault&&writable.length>0。復元下書きの明示xadd:falseを優先、シートでオフにしても設定は変えない。
- スイッチ51×31、44pt行を繰り返し直後・場所の上へ。オン時だけ44pt追加先行（色丸8pt・名前13pt）。既存f-xaddをcheckboxとしてswitch外観にすれば既存check操作を維持可能。
- 候補優先：シート内xSel→書けるdefaultCalendarId→書けるisDefault→書ける最初。xSelは次の新規へ持ち越さない。現行createNative成功時の `setLink({defaultCalendarId:…})` は外し、シート選択で設定を暗黙変更しない。
- 連携パネル一覧の上に09 §6.3「新しい予定」カード、標準オンスイッチ・オン時追加先・説明。設定操作だけdefaultCalendarId/addByDefaultを永続化。書込先なしはdisabled＋案内、新規側は段を隠す。
- 通知オン時はEKAlarm、オフでDuo通知、選択値は維持。新規既定30分前／終日08:00と、失敗確定→unlinked・Duo通知復帰は既存動作を維持。カテゴリ色はDuoのまま。

**JS↔Swift／偽装**：新APIなし、PR1のisDefaultと既存createEventを使用。mockにisDefaultが複数／なし、読取専用の既定、書込先なしを追加。
**読み替え／追加試験**：native.specの新規オフ期待をオンへ、連携有効なDuoだけ作成試験は明示オフにする。normSettingsのdeepEqual期待にaddByDefaultを追加。単体で既定・不正・候補4段階、Playwrightで旧設定更新／標準オフ再起動／1件だけオフ／次回オン／下書きfalse／候補消失／未連携・権限なし・Web非表示／追加失敗通知復帰・シート選択非永続を検証。
**完了**：共通チェック成功、09の新規シート・設定カードを撮影、実機チェック14成功。

## PR6：文言（v37）

**変更先・やること**：`app/ios/App/App/Info.plist` のNSCalendarsFullAccessUsageDescriptionと旧NSCalendarsUsageDescriptionを正本§10どおり **「iPhone のカレンダーの予定を Duo カレンダーに表示し、Duo から予定の追加・変更・削除をするために使います。予定は端末の外に送りません。」** へ。WriteOnly文言は維持。
- `app/js/app.js` のrenderLink紹介文を表示・変更に対応させ、許可説明を「Duo から iPhone のカレンダーの予定を変更・削除できます（書き込めるカレンダーのみ）。」へ。旧「編集・削除することはありません」を除去。
- `app/index.html` の#xd-noteを固定の開く説明から理由表示枠へ整理し、openExtDetailでreason別文言を確定。PR4時点から理由は表示し、このPRまで機能を待たせない。birthdays文言は正本§4「誕生日は『連絡先』から変更してください。」の意味に合わせる。
- PrivacyInfo.xcprivacy・収集データ項目・Capabilities・バンドルIDは変更不要。審査説明に変更削除が分かることを引き渡し事項に記す（外部表の編集・送信はしない）。

**JS↔Swift／偽装**：新引数・戻り値なし。既存reason fixtureを使用、native.js変更なし。
**読み替え／追加試験／完了**：native.specの許可説明・全4理由の完全一致を更新し、旧説明が出ないことを検査。plist構文と両キー、WriteOnly不変を確認。共通チェック成功・www/iOS同期、Macで許可画面を確認（既許可端末では再表示されないのでテスト端末で確認）。

## PR7：開いた横・月の最下段をタブの上へ（v38）

**変更先・やること**：`app/js/app.js` の `updateLayoutMetrics/monthCfg/monthGrid/monthGridAll/needOf/measureMonthPane/calendarBody`、`app/css/app.css` のspread左月・scroll.msc/scroll.all・week.named/simple/all。機種別固定分岐は設けない。
- 入力は既存の安定W=L.w,H=L.h、safe T/R/B/Ls。q=(H−T−B)/669、gridTop=T+96q、実際のtabsTop=min(T+611q,H−B−46)、gridBottom=tabsTop−8q、G=gridBottom−gridTop、weekH=G/n。基準ではy96〜603、G=507。旧573qを置換し、CSSの実スクロール領域もGへ制限、線をそこで止める。
- 基準951×669は6週84.5、5週101.4、4週126.75。890×626ではq=626/669、gridTop≈89.83、bottom≈564.26、6週≈79.07。余白も比率で算出し、CSS pxをDPRで割らない。
- 通常文字は6週cap=4、5/4週cap=5、5件目／6件目から+N。全モードも同じ上限に合わせ、仮想化・週アンカー・+Nから全予定に到達を維持。simpleも同じ件数上限、既存largeは1件減の設定を維持。
- 既存needOf(4)=19+4×16+2=85で84.5を超える。spreadではCSSのmax(--week-h,--need)で行を広げない。レーン位置19・間隔16、文字9.5・チップ14＋間2と横幅を維持し、描画が収まる段数をcap以下へ下げる（縮尺時・largeも実測確認）。全部表示も領域を越えて線を描かず内部スクロールで到達可能にする。
- タブy611〜657、下と左右の紙色、左境界Ls+8〜W/2−10、右本文・時間線・帯の位置は維持。閉／縦／卓上の寸法式は変更しない。

**JS↔Swift／偽装**：変更なし。native.jsの偽装追加不要、既存ext fixtureを表示件数検査にも使う。safe注入は既存setSafe（--sat/--sar/--sab/--sal）を使う。
**読み替え／追加試験**：`tests/layout-metrics/ref-layout/layout/band-layout/safe-layout/month-all/screenshots.spec.js` の横573q・通常5段期待を新式へ。951×669／890×626、R84／0、T/B非0、safeのみ変更、4/5/6週で実DOMのgrid底・各行高・tabとの間隔をassert。数値だけでなく最終行（2026年11月30日）のtapとelementFromPoint、同日5件→4件＋+1、帯予定レーン、全モード・large・simple、回転後アンカー、light/dark・overflowを検査。
**完了**：共通チェック成功、基準で6週がスクロールなしに全露出、全nで線がtab上8qで止まる。横2寸法×safeありなしの画像、4/5/6週とdarkを撮影し実機で末尾tapを確認。

## Xcodeで手作業が要る点

ソース登録・ターゲット所属・Capabilities・バンドルIDの手動変更は **なし**。PR1/2のpluginMethods登録とPR6のplistは既存ファイル編集で完結。同期後、Macの既存AppターゲットでSDK型検査を含むビルド・実行が必要（Swift parseだけでは不可）。実機EventKit・許可ダイアログ・アカウント間移動は手動確認し、既存署名設定を使用する。

## 正本§11の実機チェック14項目との対応

| 番号 | 確認内容 | 主担当PR |
|---|---|---|
| 1 | iCloud単発のタイトル・時刻・場所の編集反映 | 1–4 |
| 2 | 単発削除と「から」の確認文 | 2・4 |
| 3 | 毎週thisの時刻変更、その回のみ | 2–4 |
| 4 | futureの時刻変更、前の回は不変 | 2–4 |
| 5 | 途中の回からallで日付を飛ばさず時刻差分、detached結果記録・必要なら注意追加 | 2–4 |
| 6 | all削除の2段目と過去回も消えること | 2・4 |
| 7 | 3日動かした回を取得・編集（occurrenceDate≠start） | 1–4 |
| 8 | 外部で場所変更＋Duoタイトル変更の両立と競合お知らせ | 2–4 |
| 9 | 外部削除後の保存で削除済み表示・閉じる | 2・4 |
| 10 | 祝日・誕生日・閲覧共有・Outlook招待の理由とreadOnly | 1・3・4・6 |
| 11 | extの10分前がiPhoneのみ1回、Exchange通知2→1のお知らせ | 1–4 |
| 12 | URL欄のZoomリンクを編集後も保持 | 2・4 |
| 13 | 単発iCloud→Google移動、元から消え返却IDで再取得 | 2・4 |
| 14 | 新規標準オン・既定先・設定オフ・権限剥奪で非表示とDuo通知復帰 | 1・5・6 |

14項目に加え、主催者＋出席者のreadOnly、削除競合の取消／force、全3範囲の削除、終日／DST、PR7の最終週露出・tap・開閉回転を確認する。合成データを使い、実予定・URL値・秘密情報をログや画像へ残さない。
