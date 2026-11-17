# 第16版 実装計画（Claude Code：1回に1PR）

| 番号 | 題名・範囲 | SW |
|---|---|---|
| PR1 | 候補一覧のスクロールの上書きを直す | v102 |
| PR2 | 非表示の追加先を候補から外す | v103 |
| PR3 | 編集シートの候補を専用ページにする | v104 |
| PR4 | 設定の追加先も専用ページにする | v105 |
| PR5 | タスクの連続入力と失敗表示を直す | v106 |
| PR6 | 日ごとのメモの戻り道を明示する | v107 |
| PR7 | 詳細設定にキーボード計測を置く | v108 |
| PR8 | 祝日表と時差に依存しない参照を導入する | v109 |
| PR9 | 祝日の色と名前と設定を統一する | v110 |
| PR10 | Swiftから折り状態を通知する | v111 |
| PR11 | Webで折り状態と計測値を受け取る | v112 |
| PR12 | 右の帯にタスクとメモの入口を置く | v113 |
| PR13 | ホームと予定リストの経路を分ける | v114 |
| PR14 | ホームに今日のカードを配置する | v115 |
| PR15 | DB v5とタスクの保存操作を用意する | v116 |
| PR16 | タスクをバックアップ v5で守る | v117 |
| PR17 | タスクの正本をDuo内保存へ切り替える | v118 |
| PR18 | タスクの完了と取り消しを統一する | v119 |
| PR19 | タスクの編集と設定をDuo内へ切り替える | v120 |
| PR20 | タスクの検索と各画面の件数をそろえる | v121 |
| PR21 | タスクと予定の通知を近い順に予約する | v122 |
| PR22 | 使わないリマインダー連携を外す | v123 |
| PR23 | ノート変換規則と試作の証拠を取り込む | v124 |
| PR24 | ノート保存と原子的な移行を用意する | v125 |
| PR25 | ノートとフォルダの新形式復元を作る | v126 |
| PR26 | 古いメモの復元を追加専用にする | v127 |
| PR27 | ノートの編集と下書き回復を用意する | v128 |
| PR28 | メモをノートへ切り替えて移行を有効にする | v129 |
| PR29 | フォルダとピン留めの操作を仕上げる | v130 |
| PR30 | ノートのチェック欄と書式操作を作る | v131 |
| PR31 | 全ノート検索と大量一覧を仕上げる | v132 |
| PR32 | 開いた縦に三つの集中モードを作る | v133 |
| PR33 | 集中タスクの四つの見方と詳細を作る | v134 |
| PR34 | 入力欄と本文をキーボードと折り目に合わせる | v135 |
| PR35 | 開閉と回転の前後で編集状態を保つ | v136 |

## 共通の前提と引き渡し

- 基準は依頼指定 main `7528521`、実機SW v101、DB v4、バックアップ v4。現行ファイルを関数名で確認した。計画作成では本ファイルだけ新規作成し、git操作・push・公開・秘密情報参照・他プロジェクトの作業はしない。指定のチーム資料は読み取りのみ。
- PRは表の順に直列、実装約20〜30分／回。各節のファイルは `app/` 相対、新設関数・ファイルは「新設」と記す。各PRには該当試験、`sw.js/CACHE` の直前から+1、新設実行JSの `ASSETS` 登録を含む。
- 各PRで `app/` の `npm run test:unit`（東京・NY）と `npx playwright test tests/<関係spec>` を成功させる。全PR共通の関係specは `sw.spec.js`。共有ヘルパー・偽装を変えた場合は利用するspecも同じPRで実行する。既存skip/todoは報告し、失敗をskipやassert削除で隠さない。本計画では試験は実行していない。
- 最終www同期・指揮役の最終SW更新・全件テストはPRにしない。`scripts/build-www.mjs` と既存プロジェクトを使い、`www`／`ios/App/App/public` 生成物は各PRで編集しない。bundle ID `com.maskeykim.duocalendar` 不変。Swift変更は既存 `ios/App/App/DuoNativePlugin.swift` 内だけ。
- 読んだ正本：チーム `qa/bug-v15-destpop-2026-11-17.md`、`qa/verify-v15.md`、design/11・13〜18、連携第8〜11弾、`data/proto_第11弾/notes-proto.mjs,out-tokyo.json,out-ny.json`、本リポジトリV14・V15計画。図は settings-menu/calendars、sheet-calendar-picker、home-closed/spread、strip-tasks-memo、tasks-memo-v2、portrait-focus-B、focus-tasks/notes を確認。旧図と違う場合はオーナー決定とdesign/18を優先。
- 右の帯は **設定・検索・タスク・メモ・今日・＋** の6項目。旧図の「全」は帯に残さず、月の全表示への入口を月側へ移す。ノート切替後は同じ位置の「メモ」を「ノート」に改称。design/17のタスク・メモ混在／週帯へのカレンダー縮小は採らず、開いた縦のカレンダー本文・操作は現状維持。
- 取り消し以外の自動移行で既存レコードを削除しない。予定・カテゴリ・繰返し例外・outbox・通知既定なし・端末固有のカレンダー選択を維持。旧 `memos` はこの版以降も削除しない。旧リマインダーの取り込み・更新・削除はしない。
- DB v5をPR15で使い始めるため、`tasks/notes/folders` のストアと索引を先にまとめて作る。メモ変換はPR28で有効化する。最終版のv4→v5では `MIGRATIONS[5]` 内、途中版ですでにv5になった端末では起動時の同一移行関数を1 readwrite transactionで実行する。v5の移行定義を足すだけでは既存v5端末に走らない点に注意。schemaをv6へ上げて逃げない。
- バックアップv5はPR16で導入。当面は `memos+tasks`、ノート有効化後は `tasks+notes+folders` を出し `memos` を出さない。同じversion 5の項目欠落を扱い、途中版ファイルも読めるようにする。新形式の読書きと旧形式復元を準備してからノートUIを切り替える。
- ノートの**件数に製品上の上限を設けない**（第11弾の40000件案よりオーナー決定優先）。40000件は負荷試験の基準。本文100000字、フォルダ100・名前30字、バックアップ10MBは推奨採用。ただし移行で付く日付見出し分は本文上限に別枠加算し、旧100000字を切らず保存・再復元できるようにする。容量不足は入力／元DBを残して通知する。
- 型略記：`Day=string(YYYY-MM-DD)`、`Stamp=string(端末ローカルYYYY-MM-DDTHH:mm)`、`MS=number(Unixミリ秒)`。JS↔Swift「なし」は契約変更なし。偽装「据置」はnative偽装の拡張不要。既存 `tests/native.spec.js/mock` と各 `reminder-*.spec.js` の `nativePromise`、`tests/helpers.js` を使い、製品 `native.js` に偽APIを作らない。
- 既存通知契約N：`notifyStatus/requestNotifyPermission({})->{status:string}`、`notifySync({items:{id,title,body,fireDate:Stamp,thread,day:Day,eventId:string}[]})->{scheduled,removed,skipped:number}`、`notifyClear({})->{removed:number}`。完了・期限なしはタスク通知対象外。予定の既存ID・EKAlarmは変更しない。

## PR1：候補一覧のスクロールの上書きを直す

- やること／ファイル・関数：`css/app.css` の二重 `.destpop` を編集用と `#m-destpop` 用に限定。`app.js/renderDestPop,renderCalScreen` の出力に合わせ、双方のoverflow-y:auto・contain・iOS慣性スクロールを保証する。
- 移行：なし。候補・予定・追加先設定を書き換えない。JS↔Swift：なし。偽装：書込可能カレンダー20件を既存mockに足す。
- テスト／読み替え：`calendar-picker.spec.js,calendar-settings.spec.js,popup-dismiss.spec.js` に3姿勢で最後の候補を選択、背景不動を追加。PR3/4で箱の高さ検査を候補ページの到達検査へ読み替える。
- 完了条件：DP-1の切れが即時解消し、設定側の長い候補も下まで操作できる。

## PR2：非表示の追加先を候補から外す

- やること／ファイル・関数：`app.js/destGroups,renderDestPop,renderCalScreen,hiddenNotice` と `iphone.js/resolveDest` を確認し、共通の可視候補抽出（新設）を使う。新規・既定候補は表示中のみ、編集時だけ現在の非表示先を先頭に1件残す。
- 移行：なし。現在値・最後の選択は消さず、非表示の既定先は既存resolveDestで代替。異常な全非表示ではdnoteを残す。JS↔Swift：なし。偽装：hidden・読取専用・消失先を追加。
- テスト／読み替え：`test-unit/iphone-link.test.mjs`、`calendar-picker.spec.js,calendar-settings.spec.js,calendar-visibility.spec.js`。非表示も自由に選べる旧期待と保存後の表示トーストを廃止、現在先だけ例外・全非表示案内・新規の代替を検査。
- 完了条件：DP-2。既存予定の保存先は勝手に変わらず、隠した先への新規誤追加がない。

## PR3：編集シートの候補を専用ページにする

- やること／ファイル・関数：`index.html,css/app.css,app.js/openDestPop,closeDestPop,renderDestPop,showEditor,saveDraft`。新設 `js/destination-ui.js` にシート内候補ページを分離し、戻る44pt・行44pt・見出し28pt、選択行へスクロール、0.15秒後に戻る動作を実装。
- 移行：なし。編集中フォームDOM・値・dirty・フォーカス復帰先を保持。下端の「表示するカレンダーを選ぶ ›」から設定を開き、戻ると未保存フォームへ戻す。外部予定のDuo移動禁止・これ以降の固定は維持。
- JS↔Swift：なし。偽装：PR1/2の20候補・隠した現在先を使用。
- テスト／読み替え：`calendar-picker.spec.js,ext-edit.spec.js,popup-dismiss.spec.js,datetime.spec.js`。箱のoverflow期待をページ全体の末尾到達・選択復帰・取消時値不変・設定往復へ置換。
- 完了条件：design/11 §6・DP-1。閉／開縦／開横でシート内の1本だけがスクロールし、保存時の引数が従来どおり。

## PR4：設定の追加先も専用ページにする

- やること／ファイル・関数：`app.js/renderCalScreen,showMenuScreen,menuBack`、`index.html,css/app.css,destination-ui.js`。`#m-dest` から同じ部品へ入り、既定先選択後にカレンダー設定へ戻す。
- 移行：なし。既定Destの保存キー・設定の✓は保持し、戻るだけでは保存しない。JS↔Swift：なし。偽装：候補20件と許可なしを追加。
- テスト／読み替え：`calendar-settings.spec.js,settings-hierarchy.spec.js,calendar-picker.spec.js`。`#m-destpop` の箱を直接押す手順をページ経由へ更新。Escape・下層から戻る・最後の候補・新規フォームへ反映を追加。
- 完了条件：設定側もDP-1/2を満たし、階層を戻っても✓・既定先・編集中の予定を失わない。

## PR5：タスクの連続入力と失敗表示を直す

- やること／ファイル・関数：`app.js/fillAdd,remSubmit,openAdd,render`、`reminders.js/createAddController,addRowHtml`。常設の入力と追加ボタンへ変え、入力部分を一覧再描画から外す。229だけでEnterを捨てず、実変換中だけ待つ。pointerdownでフォーカスを保ち、確定後1回だけ保存。
- 移行：なし、まだ既存保存経路。成功後だけ同じノードを空にする。失敗時は理由と再操作を欄の近くへ出し文字を残す。題名の日付からdue/doneを推測しない。
- JS↔Swift：既存 `createReminder({requestId,listId,title:string,due:{date:Day,time?:string}|null,notify:boolean,notes?:string})->{reminder:object}` を維持。偽装：遅延・失敗・二重送信・古いcompositionendを再現。
- テスト／読み替え：`reminder-add.spec.js,reminder-create.spec.js` と関連単体に日英3連続・229/13・変換確定前ボタン・blur後再入力・DOM同一・失敗保持・連打1件を追加。native呼出期待はPR17でDB期待へ移す。
- 完了条件：DP-5・TM-1/6の先行修正。実キーボード継続は実機で別確認する。

## PR6：日ごとのメモの戻り道を明示する

- やること／ファイル・関数：`app.js/memoBody,memoRowsHtml,fillMemos,memoSync`、`css/app.css`。「この日｜一覧」、日付と‹ ›、今日以外だけ「今日に戻る」、一覧から本文・戻るを明示。
- 移行：なし。移動前に `memos.js/flushMemo`、失敗時はdraftを残す。再入場で今日へ戻る入口と本文表示を統一する。JS↔Swift：なし。偽装：据置、過去メモ・未保存draftをseed。
- テスト／読み替え：`memo.spec.js,memo-mark-list-search.spec.js,panel.spec.js`。曖昧な一覧トグル期待を明示選択・今日復帰へ。別日へ移動中の入力保持と保存失敗も検査。
- 完了条件：DP-7・TM-5を先行解消。PR28ではこの日単位UIを廃止し、元日付追跡をノートのsourceDateへ移す。

## PR7：詳細設定にキーボード計測を置く

- やること／ファイル・関数：`app.js/diagText,updateDiagnostics,vpTick,updateVars`、`index.html` の詳細画面。一時計測を設定 › 詳細に設置し、innerHeight・visualViewport.height/offsetTop/scale・kbTop・推定キーボード分、devicePosture/segmentsの有無を表示。
- 移行：なし。JS↔Swift：なし。division/frame/angle/statusはPR11まで「未取得」。偽装：visualViewportのresize/scroll・offsetTop・高さを注入可能にする。
- テスト／読み替え：`settings-hierarchy.spec.js,layout-metrics.spec.js,safe-layout.spec.js`。新設 `test-unit/keyboard-layout.test.mjs` でkbTop計算、viewportなしを検査。詳細以外への計測表示を期待しない。
- 完了条件：KB-1の実測を始められる。常時ポーリングせず、計測が編集やキーボードの高さを変更しない。審査版で除外するスイッチを用意。

## PR8：祝日表と時差に依存しない参照を導入する

- やること／ファイル・関数：第8弾 `data/holidays/app-proposal` の検証済み `js/holidays-table.js,js/holidays.js` を導入（新設）。`holidayOf(Day):string|null`、`holidayMeta(Day):{name:string,official:boolean}|null`。1955〜2027公式1067件、2028〜2050予定409件。
- 移行：なし、同期ES moduleで参照しfetchしない。Date.UTCで暦日を検証、範囲外・不正はnull。出典・加工・予定値の説明を表先頭に維持。JS↔Swift：なし。偽装：据置。
- テスト／読み替え：新設 `test-unit/holidays.test.mjs` と `test-unit/fixtures/holidays/` に元CSV・検証用表と出典メタを取り込み、公式全件・振替・国民休日・2019/2020/2021特例・境界を東京/NYで検証。関係spec `sw.spec.js` の新JSオフライン読込。
- 完了条件：1476件が資料と一致。天文計算ライブラリ・検証fixtureをアプリ実行時へ配布しない。

## PR9：祝日の色と名前と設定を統一する

- やること／ファイル・関数：`app.js/holidayDays,holidayMemo,weekInner,dateHead,listHtml`、`datetime-ui.js` の小月、`css/app.css,index.html,backup.js/checkSettings`。赤判定を内蔵表に一本化し、全日付数字を `--holiday`（明#B43C3C／暗#E58A82）へ。
- 移行：既定オン「祝日を赤で表示」を一般の六曜直上へ。欠落設定はオン、保存済falseは尊重しバックアップ往復。日見出しに名前・狭幅は六曜から省略、土曜の地は維持。詳細 › このアプリについてに祝日・六曜の出典と加工主体・予定期間を示す。
- JS↔Swift：なし。偽装：許可なし・祝日購読OFF・偽のholiday題名を追加し、外部予定は通常予定として維持。
- テスト／読み替え：`calendar-visibility.spec.js,calendar-settings.spec.js,rokuyo.spec.js,datetime.spec.js,search-backup.spec.js` と祝日単体。新設 `holidays.spec.js` で3姿勢・設定OFF・読み上げ・ダークを確認。購読OFFで赤が消えるV15 §2-7を変更。
- 完了条件：連携なし／オフラインでも赤と名称が正しく、祝日設定OFFでも日曜は赤のまま。

## PR10：Swiftから折り状態を通知する

- やること／ファイル・関数：`DuoNativePlugin.swift/pluginMethods,load,deinit` に `getPosture` と全画面の非操作・非アクセシビリティprobe（同ファイル内新設）。iOS27.1分岐、`updateConstraints()` でactive divisionを読む。UIHingeInteractionは記録専用、角度を度へ変換する。
- JS↔Swift：`getPosture({}):Promise<Posture>` と `postureChange(Posture)`。`Posture={available,folded:boolean,regionRect:{x,y,width,height:number}|null,axis:'horizontal'|'vertical'|null,angle:number|null,status:'closed'|'fullyOpen'|'partiallyOpen'|'unknown'|null,source:'reservedRegions'|'unsupported',at:MS}`。
- 移行：なし。main queueでWebView原点のCSS pxへ変換、正方形axis=null。旧OS／viewなしはavailable:falseをresolve。起動時設置失敗ならgetPostureで再設置し、終了時解除。同内容・矩形差0.5px未満は重複抑制、初変化を遅延しない。
- 偽装：同契約をnative mockに追加、未実装・null・横縦・同値連発を再現。テスト／読み替え：新設 `posture.spec.js` に契約試験、関係spec `native.spec.js`。Swiftのコンパイル・変化通知・座標は実機で確認する。
- 完了条件：新権限なし、角度をレイアウト根拠にせず、カレンダーAPIとprobeのタッチ透過を壊さない。

## PR11：Webで折り状態と計測値を受け取る

- やること／ファイル・関数：新設 `js/posture.js/startPosture,refreshPosture,applyPosture`、`native.js/call,listen`、`app.js/initNative,diagText`。権限処理より前に購読→取得、前面復帰で再取得。html.folded／軸classと矩形CSS変数を更新する。
- 移行：なし。JS↔Swift：PR10契約。不正値・古い非同期取得で新イベントを上書きしない。外面はlayoutKindでも除外、未対応はclass解除と手動「折り」代替（集中UIで使用）を用意する。
- 偽装：復帰・逆順応答・連発・失敗、viewport座標とregionRectを組み合わせる。詳細にdivision・ヒンジ・取得可否とキーボード上端との差を追加、角度は配置に使わない。
- テスト／読み替え：`test-unit/posture.test.mjs`（新設）、`posture.spec.js,native.spec.js,layout-metrics.spec.js`。当初は本文配置を変えない。関係のない閉画面にfoldedレイアウトを期待しない。
- 完了条件：第9弾、KB-1/5の比較が可能。横は影24pxだけで右面を移動せず、未対応・取得失敗でも起動できる。

## PR12：右の帯にタスクとメモの入口を置く

- やること／ファイル・関数：`app.js/ctl,closed,spread,pickPage,renderPage`、`pages.js,css/app.css`。6項目を指定順に配置、丸48／当たり56。閉は全面表示と再押下で復帰、横は右切替・再押下復帰、左に同種があれば強調だけ。
- 移行：元ページを一時保存し、日付やページ選択の永続値を不必要に上書きしない。「全」の機能は月ヘッダーへ移し全表示状態を保持。メモ入口はPR28まで今日本文へ。JS↔Swift：なし。
- 偽装：既存タスク集合を使用、期限切れ＋今日の未完了を0／99／100件でseed。テスト／読み替え：`pages.spec.js,closed-tabs.spec.js,allbtn-look.spec.js,month-all.spec.js,safe-layout.spec.js`、新設 `strip-tasks-notes.spec.js`。旧帯「全」の場所期待だけ変更。
- 完了条件：DP-3。選択色・99+・0件非表示・VoiceOver・0.8秒名前表示、縦上帯には追加せず既存下パネルから到達できる。

## PR13：ホームと予定リストの経路を分ける

- やること／ファイル・関数：`pages.js/PAGE_IDS,DEFAULT_PAGES,BOTTOM_IDS,TIME_LABELS,normalizePages`、`app.js/tabs,timeBody,renderPage,listShown,pickPage`。homeを独立ページへ、timeMode.listは選択日以降の「予定リスト」へ変える（新設描画）。
- 移行：新規だけ横は左home・右month、既存の有効な左右選択を尊重。既存timeMode.listは値を保ち表示名をリストへ、初めての時間は1日。closed一覧→ホームの選択を一度正規化し、保存済みの日・週・月は保つ。データ移行なし。JS↔Swift：なし。
- 偽装：保存済list・home・未設定をseed。テスト／読み替え：`test-unit/pages.test.mjs`、`pages.spec.js,closed-tabs.spec.js,date-nav.spec.js,timeline.spec.js` と `helpers.js/showView,setTimeMode`。一覧をホーム表示と同一視する期待を分ける。
- 完了条件：DP-4。時間リストにホームが混ざらず、日ごと40pt行で先へ追加読込できる。保存済listの再現条件も表示名で判別できる。

## PR14：ホームに今日のカードを配置する

- やること／ファイル・関数：新設 `js/home.js` の今日集合・次予定・明日選択、`app.js/listHtml,listView,nextBell,bottomBody,renderPage,updateNow` と `css/app.css`。design/14案A：次予定・残り予定最大3・タスク最大3・メモ・明日。20時以降は明日を上へ。
- 移行：なし。ホームは選択日と独立して今日固定。横の予定は9〜19時ミニ時間軸、タップで反対側の当該日／時刻へ、縦下段はカード列。次予定の二重掲載を避け、終日・繰返し・hidden・linked/ext重複は既存集合を使う。
- JS↔Swift：なし。偽装：時刻固定・次予定なし・明日・深夜境界を追加。テスト／読み替え：新設 `test-unit/home.test.mjs,tests/home.spec.js`、関係spec `pages.spec.js,date-nav.spec.js,calendar-visibility.spec.js`。旧長い残り予定一覧期待を3件＋導線へ。
- 完了条件：通知時刻表示・0件案内・全体スクロールと固定タブ。タスク完了はPR18で1.5秒／6秒へ統一し、今日のメモカードはPR28で外す。

## PR15：DB v5とタスクの保存操作を用意する

- やること／ファイル・関数：`db.js/SCHEMA_VERSION,MIGRATIONS,open,run` にv5とtask CRUD（新設）、新設 `js/tasks.js` に検証・分類。notes索引updatedAt/folderId/sourceDate/pinnedAt、folders索引orderも空で予約する。メモの変換・書込切替はまだしない。
- 保存型：`Task={id,title:string,due:{date:Day,time?:string}|null,done:boolean,doneAt:Stamp|null,createdAt,updatedAt:MS,order:number,note:string,notify:boolean}`。titleはLIMITS.title、noteはLIMITS.notes、最大10000。新規done:false/notify:false、order単調増加、日付文字列を維持。done索引にbooleanは使わず分類は配列で行う（IDBの有効キー制約）。dueDate/order/updatedAtを索引にする。
- 移行：containsを確認してストアを追加するだけ、既存4ストアは不変。0→5は1〜5を順実行。JS↔Swift：なし。偽装：fake-indexeddbをdevDependency／lockfileに導入、容量失敗・blockedを再現。
- テスト／読み替え：新設 `test-unit/tasks.test.mjs,tasks-db.test.mjs`、`persist.spec.js` の到達版をv5へ。v1〜4／新規／abortでevents/categories/memos/meta/outbox一致とCRUD再読込を検査。
- 完了条件：TK-1。v4失敗時はv4・旧データのまま、まだ旧UIの動作とバックアップを変えない。

## PR16：タスクをバックアップ v5で守る

- やること／ファイル・関数：`backup.js/buildBackup,validateBackup,planAppend`、`db.js/applyImport`、`app.js` の書出・確認・実行ハンドラ。VERSION/SCHEMA=5、READABLE=1〜5、taskの検証・安定順出力・追加／置換を実装。
- 移行：tasks欠落／旧版はnullで現在保持、v5の[]だけ明示置換で空にする。同ID同内容は無操作、異内容の追加は既存を残し決定的な別IDへ。予定・カテゴリ・outbox・メモと同じtransaction、失敗時は全体rollback。設定はDB成功後に反映する。PR25の対応前にnotes/folders付きv5を渡されたら全体拒否し、黙って落とさない。
- JS↔Swift：なし。偽装：完了／期限なし／通知付き・不正task・空／欠落、旧アプリvalidator fixtureを追加。
- テスト／読み替え：`test-unit/backup.test.mjs`、`search-backup.spec.js,persist.spec.js`。「将来版5」は6へ変更し、固定した旧v4読取器でv5全体拒否を別検証。全項目往復・再取込重複なし・不正1件でDB不変を追加。
- 完了条件：TK-3のtask部分。PR17でローカル新規を有効にする前に、タスクが書出／復元できる。

## PR17：タスクの正本をDuo内保存へ切り替える

- やること／ファイル・関数：`app.js/taskBody,loadTasks,scheduleTasks,remSubmit,fillAdd,initNative`、`tasks.js` にlocal CRUD adapterとadd controller（新設）。一覧・追加だけでなく既存の編集・完了・削除controllerもDB adapterへ接続し、native呼出を残さない。PR18/19では操作仕様・外観を仕上げる。リマインダー許可・list gate・calendarChanged再取得を外し、PR5の入力を再利用する。
- 移行：リマインダーは読込も自動移入もしない。遅い読取で追加済み行を消さず、同一requestの失敗再試行は同じidでput。DB成功まで文字を消さない。JS↔Swift：タスク一覧・追加からの呼出は0、旧メソッドはPR22まで未使用で残す。
- 偽装：旧reminder集合を残したまま呼出カウンタ0、DB失敗・遅延を注入。テスト／読み替え：`reminder-add.spec.js,reminder-create.spec.js,reminder-list.spec.js,reminder-gate.spec.js,reminder-tasks.spec.js` と関連単体をlocal taskへ改称／移設、UI挙動の検査を引き継ぐ。
- 完了条件：DP-5・TK-2・TM-1/4/6/7。許可なし・Webでも日英3件が未完了で入り、229・composition欠け・連打・再起動に耐える。TM-7の許可フロー期待は「許可要求0」へ。

## PR18：タスクの完了と取り消しを統一する

- やること／ファイル・関数：`tasks.js` にdone/delete controller（新設）、`app.js/toggleDone,deleteTask,taskBody` とhomeの操作、`css/app.css`。22pt四角・44×48当たり、✓と打消線、1.5秒残留後に完了へ、6秒undo。削除は既存4秒undoを維持。
- 移行：既存taskを書き換えない。1.5秒内の再タップは最後の状態だけ保存、離脱時も最後をflush。doneAtは未完了へ戻すとnull。完了30日は表示窓で、古い完了は自動削除しない。JS↔Swift：なし、外部更新0。
- 偽装：fake clock、保存失敗、連打、完了直後の画面移動。テスト／読み替え：旧 `reminder-update.spec.js,reminder-delete.spec.js,reminder-tasks.spec.js` をlocal操作へ、`home.spec.js` と新設 `test-unit/task-actions.test.mjs`。即時native送信・home0.6秒消去期待は廃止。
- 完了条件：DP-6・TM-2/3/8。二重完了なし、undoで件数・通知対象も戻り、保存失敗では行が消えず理由が出る。

## PR19：タスクの編集と設定をDuo内へ切り替える

- やること／ファイル・関数：`app.js/openTask,tkNotifyUi,loadRemSettings,renderCalScreen,syncTaskMenu`、`tasks.js` のpatch検証、`index.html,css/app.css,backup.js/checkSettings`。期限チップと既存datetime部品、題名・メモ・期限・時刻・notifyをlocal保存する。
- 移行：旧 `monthTasks` の表示設定だけ新task設定へ一度継承、同期/list/addToの旧設定は削除せず以後読まない。設定 › タスクに固定「30日」と月件数スイッチ。リマインダー設定・カレンダー内のリスト段を外す。
- JS↔Swift：なし。偽装：期限なし／10:07／日付のみ・失敗をDB seed。テスト／読み替え：`reminder-edit.spec.js,reminder-update.spec.js,reminder-settings.spec.js,reminder-notify-ui.spec.js,datetime.spec.js,calendar-settings.spec.js,settings-hierarchy.spec.js` をlocalへ。
- 完了条件：TK-2/4。未操作項目は保持、due:nullならnotify:false、期限変更だけで通知ONにしない。リスト・許可UIはない。

## PR20：タスクの検索と各画面の件数をそろえる

- やること／ファイル・関数：`search.js` に `searchTasks`、`tasks.js` に `dueCounts/todayTasks`（新設）、`app.js/monthTaskCounts,ctl,listHtml` と検索描画。未完了→期限順→期限なし→完了、title/noteの正規化AND・別枠LIMIT200。
- 移行：なし。帯とhomeは期限切れ＋今日、home最大3、月はその日期限の未完了だけ。選択日・現在時刻・完了中overlayを同じ関数へ。JS↔Swift：なし。偽装：10000件・日付／時刻境界・31日前完了をseed。
- テスト／読み替え：新設 `test-unit/search-tasks.test.mjs`、`search-backup.spec.js,home.spec.js,strip-tasks-notes.spec.js,reminder-tasks.spec.js` を更新。リスト✓で件数が変わる旧期待はなくし、保存task集合で比較。
- 完了条件：TK-6/7。検索は古い完了も見つかり、全表示件数が永続データと一致。10000件で追加・表示・書出の所要時間を記録する。

## PR21：タスクと予定の通知を近い順に予約する

- やること／ファイル・関数：`notify.js/planNotifications` にtask候補を追加、`app.js/runNotifySync,onNotifyTap,requestNotifySync`、`DuoNativePlugin.swift/notificationTapped` の既存payload転送を確認。単一待ち行列、30日・最大60、refreshを含む場合は実通知59。
- 移行：なし。task notifyは既定false、時刻ありは期限ちょうど、日付だけは当日8時。IDを `duo.task.<id>` とし予定IDと衝突させない。完了・削除・期限変更・復元・時差変更で直列再計画し、全体OFFは既存notifyClear。
- JS↔Swift：Nを再利用しeventIdに `task:<id>`、dayに期限日を渡す。tapでtask詳細へ、消失taskは一覧へ。新権限なし、明示ON操作だけ既存許可要求。偽装：pending・tap・通知発火・clearログ、予定task混在61件以上を追加。
- テスト／読み替え：`test-unit/notify.test.mjs`、`notify.spec.js,notify-ui.spec.js,native.spec.js` と旧 `reminder-notify.spec.js` をlocal通知へ。EKAlarmの更新期待をなくし、対象外0・近い59件＋refresh・undo再予約・二重なしを検査。
- 完了条件：TK-5。既存予定と外部EKAlarmを保持し、予定とtaskを合わせて60件以内、通知tap後も正しい対象が開く。

## PR22：使わないリマインダー連携を外す

- やること／ファイル・関数：`DuoNativePlugin.swift/pluginMethods` のreminderPermission/requestReminderPermission/listReminderLists/listReminders/createReminder/updateReminder/setReminderDone/deleteReminderと専用補助を除去。`Info.plist` のNSRemindersUsageDescription/NSRemindersFullAccessUsageDescriptionを外す。
- 移行：UserDefaultsの旧作成記録・OS内データ・旧LS設定を消去しない。カレンダーEventKit・共有補助・UserDefaultsのPrivacyInfo宣言は維持。`app.js/refreshReminderAccess,remRequest,setRemState` と `reminders.js` の使用されない橋を外し、残る描画ヘルパーはtasks側へ移す。
- JS↔Swift：廃止した8メソッドと要求メソッドは呼出不可、通常経路の呼出0を静的検索と実行ログで保証。偽装：通常操作で旧メソッドが呼ばれたら試験失敗にし、保存済み外部項目のsnapshotは保持。
- テスト／読み替え：`native.spec.js,calendar-settings.spec.js,settings-hierarchy.spec.js` とlocal移設済task spec。旧bridge専用テストは「経路がなく要求0・外部不変」の回帰へ置換し、予定連携試験を維持。
- 完了条件：TK-4。新規も既存許可端末もリマインダーの許可画面が出ず、純正リマインダーの元データが不変。

## PR23：ノート変換規則と試作の証拠を取り込む

- やること／ファイル・関数：新設 `js/notes-model.js/noteFromMemo,titleOf,memoTextOf,ensureDailyFolder`。第11弾のNote/Folder型を採用、sourceDate/sourceHeading/ink/時刻を保持、日付見出しはDate.UTCで作る。まだ起動には接続しない。
- 移行規則：`memo-<Day>`、固定folder-daily-memos、pinned:false。旧日付見出しがなければ年付き1行を足す。すでに年付き／ISO日付なら足さない。年なし同日見出しは年付きに直し、元の第一行（改行形式も）を `sourceOriginalFirstLine:string`（任意）へ残しmemoTextOfで完全復元する。日付を二重にせず、本文・inkを失わない。
- 試作取り込み：`test-unit/fixtures/notes/` に3008件生成用fixture、旧v4 DB/validatorの最小固定fixture、out-tokyo.json/out-ny.jsonを置く。絶対パス・試作内の別実装はテスト本体に残さず本物の製品関数をimport。時刻・実測msは比較から除外する。
- JS↔Swift：なし。偽装：fake-indexeddb据置。テスト／読み替え：新設 `test-unit/notes-model.test.mjs`、関係spec `persist.spec.js`。年なし題名の旧試作期待だけ年付きへ、元本文指紋は `6a4d19cecd001490ea2554638351ef6b5193722de7661905d5b9251d7b4fffd7` のままを要求。
- 完了条件：東京/NYで3008件の復元本文sha256一致、CRLF・空白・絵文字・100000字・手書きfixture・日付4形式を保持。一般ノートの題名は本文1行目由来、表示100字、空なら新規ノート（空でない後続行を題名に採らない）。

## PR24：ノート保存と原子的な移行を用意する

- やること／ファイル・関数：`db.js` にnote/folder CRUD・folder削除時の付替え・`migrateNotesInTx/migrateNotesOnce`（新設）、`notes-model.js`。PR15の空ストアを使い、まだ通常boot・MIGRATIONSには変換を接続しない。
- 移行：memosカーソル→空白はblank→notes.get固定ID→無い場合だけコピー。初コピー直前だけ固定folder確認・同名時（2）以降で作成。最後に `meta.notesMigrationV1={seen,copied,existed,blank,folderCreated,at}`。外部非同期をtx内で待たず、memosへput/deleteしない。
- JS↔Swift：なし。偽装：20件目abort・容量失敗・同ID既存・folder改名／削除／同名を追加。削除folderはnotes.folderId=nullへ同一txで移しupdatedAtは保つ。deletedAt付きの最近削除・30日回復APIも用意する。
- テスト／読み替え：新設 `test-unit/notes-migrate.test.mjs,notes-db.test.mjs`、`persist.spec.js`。実MIGRATIONS接続用helperを試験版v4→v5へ渡す試験と既存v5のreadwrite試験、再実行・0件・新規・途中abortを検証する。
- 完了条件：NT-1経路①/①'。3008→3008、memos控えも同sha、2回目copied:0・folder1。upgrade失敗はv4、起動移行失敗はv5・元データと印なしのまま、再試行可能。

## PR25：ノートとフォルダの新形式復元を作る

- やること／ファイル・関数：`backup.js/buildBackup,validateBackup,planAppend` にnotes/foldersの検証と計画（新設）、`db.js/applyImport` にnotePuts/folderPuts/置換フラグを追加。Noteは第11弾型＋PR23の原文第一行、titleは読込時再生成、inkも落とさない。
- 移行：notes/folders欠落は現在保持、明示[]は明示置換、notesありfolders欠落では既存folderを保持。参照先は置換後に実在するfolder集合で解決し、不在はnull。追加同ID同内容は無操作、異内容は既存保持＋内容から決まる別ID、folder同IDは現在名を保持する。
- JS↔Swift：なし。偽装：3008件・家folder・ピン2・deletedAt・ink・各項目欠落、不正1件とtx失敗。書出はPR28まで旧方式を既定にして、ノート有効時用関数を先に完成させる。
- テスト／読み替え：`test-unit/backup.test.mjs` と新設 `notes-backup.test.mjs`、`search-backup.spec.js,persist.spec.js`。NT-1経路②を本物build/validate/applyImportで通し全項目sha・フォルダ・ピンを比較、旧v4 validatorはv5を丸ごと拒否。
- 完了条件：復元は予定・カテゴリ・task・note・folder・outboxで原子的。無上限件数でも10MB制限を説明し、移行見出し加算で100000字の旧メモが拒否されない。

## PR26：古いメモの復元を追加専用にする

- やること／ファイル・関数：`backup.js/checkMemos,planMemos,planAppend` に `planLegacyNotes`（新設）、`app.js` の復元確認表示を準備。v1〜4／途中版v5のmemosを同じnoteFromMemoで変換する（新notes項目があるファイルはそちらを正とし二重取込しない）。
- 移行：置換でも旧memos由来は追加のみ。現ノート・folder・ピンを消さない。同日同本文は無操作、異本文は `memo-<Day>-<本文sha256先頭8桁>`、衝突時は桁を伸ばし決定的IDにする。hashはtx外で計算する。
- 固定folderがあれば改名済でも使用、消していたら新規コピーがある時だけ再作成。同名別IDがあれば（2）以降。既存ノートのfolderIdは動かさず、取込済みの削除ノートも勝手に復活させない。
- JS↔Swift：なし。偽装：試作208件と既存9件・編集1件・自由ノート・ピン2、固定folder保持／改名／削除／同名を用意。
- テスト／読み替え：`notes-backup.test.mjs,backup.test.mjs`、`search-backup.spec.js,persist.spec.js`。旧メモ連結・置換消去期待を「追加200・別1・同じ7、2回目追加0」へ。完了条件：NT-1経路③の全指紋包含、前からの全項目不変、確認画面に追加／同じ／別ノート件数が出る。

## PR27：ノートの編集と下書き回復を用意する

- やること／ファイル・関数：新設 `js/notes.js/createNoteStore,flushNote,recoverNoteDrafts`、`js/notes-ui.js` の常設エディタ、`memos.js/createMemoStore` の世代保護を再利用。保存ボタンなし、1行目を20pt題名として同じ本文で編集する部品を用意し、通常入口はまだ切り替えない。
- 移行：入力ごと `duo.note.draft.v1:<id>`、debounce・pagehide・visibilitychange・ノート移動前にflush。DB commitした世代だけdraft削除、失敗は残して欄の近くに表示。新規はUUID、空の作成途中は離脱時に破棄しても、既存本文を勝手に消さない。
- JS↔Swift：なし。偽装：LS容量不足・DB失敗・遅い旧保存・composition中・強制pagehide。テスト／読み替え：新設 `test-unit/notes-store.test.mjs,tests/notes-editor.spec.js` で部品経由の永続化、関係spec `persist.spec.js`。旧memoの世代／回復試験をnoteIdへも適用。
- 完了条件：NF-1。保存直前の終了・再開・ノート切替で最後の文字が戻り、古いsaveが新しいdraftを消さない。最近削除から30日以内の回復UIも部品に用意する。

## PR28：メモをノートへ切り替えて移行を有効にする

- やること／ファイル・関数：`db.js/MIGRATIONS[5]` と `app.js/boot,memoBody,fillMemos,ensureMarks,renderPage,listHtml` をnotesへ。upgrade／起動の共通移行をUI・検索・通知より先に完了させ、PR25/26の書出・復元を通常経路へ接続する。
- 移行：既存v5もnotesMigrationV1未完なら1txで変換、失敗時は編集を始めず再起動案内。旧memo draftはDBより新しいものだけ取り込み、未編集移行noteなら更新、編集済なら `memo-<Day>-draft`（内容違いは決定的suffix）へ別保存。commit後だけ旧draftキーを削除する。
- UI：閉・横・縦下パネルのメモ入口をノートへ改称、最後のnoteIdをmetaに保存、消失時は一覧へ。月のメモ線・帯の今日メモ印・home今日メモカードを外す。sourceDateから元の日付を検索／開ける導線を一覧へ残す。以降memosへの画面書込を0にする。
- JS↔Swift：なし。偽装：実v4／途中v5＋最新draft／移行済編集note。テスト／読み替え：`memo.spec.js,memo-mark-list-search.spec.js,search-backup.spec.js,persist.spec.js,home.spec.js,strip-tasks-notes.spec.js` をnote仕様へ、旧日単位試験は移行・旧形式復元の検証として残す。
- 完了条件：NT-1・DP-7の最終形。3008件sha一致・2回起動増加なし、旧0件folderなし、memos控え不変。PR6の「今日」はノートUIから外れ、通常バックアップにmemosが出ない。

## PR29：フォルダとピン留めの操作を仕上げる

- やること／ファイル・関数：`notes-ui.js,notes.js` のfolder作成・改名・並べ替え・削除・note移動・pin（新設）、`css/app.css`。すべて＋folderチップ横スクロール、ピン留め／ノートの2群、pin時刻→updatedAt降順、本文見出しにfolder選択とpin。
- 移行：初期folderは作らず、固定日ごとfolderも通常編集可。削除確認「中のノート n 件は『フォルダなし』に移ります」、同一txでnullへ、本文・updatedAtを保持。ノート削除はdeletedAtで30日回復可能、期限後の整理は該当削除済みだけ。
- JS↔Swift：なし。偽装：長名・同名・folder100・固定ID改名／削除をseed。テスト／読み替え：新設 `notes-folders.spec.js`、`notes-editor.spec.js,search-backup.spec.js` とnotes-db単体。pin表示だけでなく保存・再起動・復元を確認。
- 完了条件：NF-2。44pt当たり、チップ長押し管理、行左スワイプpin・長押しメニュー・チップへdrag移動と同等のボタン操作があり、本文を失わない。

## PR30：ノートのチェック欄と書式操作を作る

- やること／ファイル・関数：新設 `js/note-lines.js`、`notes-ui.js` の補助列。本文の `- [ ] /- [x] /# /- ` を正本にし、Returnで次行、空項目Returnで通常行、チェックで同じ連続ブロック末尾へ移動する。
- 移行：既存本文は開いただけでは変換しない。明示操作した行だけ編集し、CRLF・周辺行・選択範囲・IMEを保持。JS↔Swift：なし、チェック項目にtask・期限・通知を生成しない。偽装：複数ブロック・日本語変換・選択範囲をseed。
- テスト／読み替え：新設 `test-unit/note-lines.test.mjs,tests/notes-checklist.spec.js`、`notes-editor.spec.js`。Return二重処理・済み順序・取り消し・安全なHTML文字・コピー／再復元を検査。
- 完了条件：NF-3。22pt四角／44pt当たり、本文1行目と題名の同期、欄追加・書式・新規ノートが保存後も同じ形で戻る。

## PR31：全ノート検索と大量一覧を仕上げる

- やること／ファイル・関数：`search.js/normalize,terms,searchMemos` を使う `searchNotes`（新設）、`notes-ui.js` の一覧と検索、`app.js` の全体検索。題名・本文を印なしでAND照合、folder内にいても全noteを検索し、deletedAt付きは通常結果から除く。
- 移行：なし。正規化キャッシュは保存された1件だけ更新、150ms debounce・古い検索結果破棄。全体検索の別枠LIMIT200は維持するがノート件数制限には使わない。一覧はcursor/page読込または仮想表示で末尾まで到達可能にする。
- JS↔Swift：なし。偽装：5000／40000件、pin多数、folder外一致をseed。テスト／読み替え：`test-unit/search-memos.test.mjs` を旧形式移行用として保持しnote検索単体を新設。`search-backup.spec.js,memo-mark-list-search.spec.js,notes-folders.spec.js` をnote結果の題名・更新順へ。
- 完了条件：NF-4・NT-2。上限なしで末尾を作成・編集でき、40000行を一括DOM化しない。正規化・検索・一覧・書出時間を記録し、Node実測msを実機の合格値に流用しない。

## PR32：開いた縦に三つの集中モードを作る

- やること／ファイル・関数：`app.js/open,layoutKind,ctl,pickBottom,render`、`pages.js` にfocus mode正規化（新設）、`css/app.css`。上帯「カレンダー｜タスク｜ノート」、検索と＋を各モード対象へ。タスクとノートの既存部品をそれぞれ専用面に置く。
- 移行：`focusMode` 未設定はcalendar、保存済modeは次の開縦で再開。calendarの月・下パネル・日付・全表示をそのまま保つ。閉／横は帯と従来ページ方式を維持し、17の混在表示・週への縮小は導入しない。JS↔Swift：PR10の取得値のみ。
- 偽装：3モード保存・未対応姿勢・縦→横をseed。テスト／読み替え：新設 `focus-modes.spec.js`、`open-portrait.spec.js,panel.spec.js,layout.spec.js,pages.spec.js` とpages単体。旧カレンダーの寸法・動作を基準に比較する。
- 完了条件：DP-8/9。各画面は専用機能だけ、モードを覚え、＋が予定／task／noteを正しく作る。カレンダー本文を折り通知で別レイアウトへ変えない。

## PR33：集中タスクの四つの見方と詳細を作る

- やること／ファイル・関数：`tasks.js` にview選択（新設）、`app.js/taskBody,openTask` と集中task描画、`css/app.css`。上面に「今日｜予定｜すべて｜完了」、下面に常設追加＋期限チップ、選択taskの題名・期限・時刻・通知・メモ・削除。未選択時は期限なし一覧。
- 移行：なし。今日＝期限切れ＋今日、予定＝明日以降を日別、すべて＝期限なし含む未完了全部、完了＝30日窓＋もっと前。選択dayはチップ初期値にだけ使い、見方の今日を過去へずらさない。共通controllerを使い保存動作を複製しない。
- JS↔Swift：なし。偽装：0時・時刻直前後・期限なし・30日境界。テスト／読み替え：新設 `test-unit/task-views.test.mjs,tests/focus-tasks.spec.js`、`focus-modes.spec.js` とlocal task spec。QAの予定＝期限ありという古い文言よりdesign/18の明日以降を優先。
- 完了条件：TF-1/2。4集合の重複／漏れなし、選択detail編集は即反映され、キーボード前の追加欄が作り直されない。

## PR34：入力欄と本文をキーボードと折り目に合わせる

- やること／ファイル・関数：新設 `js/keyboard-layout.js`、`app.js/vpTick,reveal,updateVars` とfocus描画、`notes-ui.js,css/app.css`。kbTop=visualViewport.offsetTop+height基準、task追加欄48ptをkbTop−56〜−8、補助44ptはその上へ。折り目±8に入る時は上面下端へ避ける。
- ノート：開ききりでは上一覧／下本文、折って編集時は同じ本文DOMを上面へCSSで移し、下面に他ノート題名と補助列。本文・task一覧を溝で切り、別々にscroll。本文の入力行が見えるよう追随、標準キーボードが低いときだけ空白を灰色にする。
- 移行：なし。JS↔Swift：Posture取得／イベントのみ。未対応は手動「折り」、ネイティブがキーボードを制御するAPIは足さない。偽装：kbTop690/590/484とさらに上・offsetTop/scale・実regionRect・外面を注入。
- テスト／読み替え：`keyboard-layout.test.mjs`、新設 `focus-keyboard.spec.js`、`safe-layout.spec.js,posture.spec.js,notes-editor.spec.js,focus-tasks.spec.js`。固定yを全端末に当てず、実矩形で0〜8pt・溝非交差・44pt当たり・本文非隠蔽を検査。
- 完了条件：KB-1〜5。追加欄の上面退避／ノート本文は0〜8ptの例外として「溝をまたがず隠れない」。見た目40ptの補助でも当たり44を保つ。横は影だけ、角度は配置に使わない。

## PR35：開閉と回転の前後で編集状態を保つ

- やること／ファイル・関数：`app.js/render,set,vpTick,layoutKind`、`notes-ui.js,tasks.js,pages.js` に編集状態の捕捉・復帰（新設）。noteId/taskId・draft・selectionStart/End・scrollTop・表示filter・focusMode・選択日を各画面で保持し、不要なDOM再生成を避ける。
- 移行：なし。モード変更・回転前に最新世代をflush、失敗時draftを保持。復帰は保存済内容より新しい編集中文字を優先。取得イベントの重複・復帰getPostureとの競合でも編集中ノードを再作成しない。JS↔Swift：既存Postureのみ。
- 偽装：IME中の縦横開閉・半開き往復・visibility復帰・遅い保存・通知tapを交差させる。テスト／読み替え：`focus-modes.spec.js,focus-keyboard.spec.js,focus-tasks.spec.js,notes-editor.spec.js,persist.spec.js,open-portrait.spec.js` に遷移回帰を追加。
- 完了条件：DP-8/9・KB-2。文字・カーソル・scroll・選択day・モードが残り、入力中に勝手にキーボードを閉じない。実機の純正比較結果でちらつきが出た場合だけ第9弾の待ち時間を調整する。

## Xcodeで手作業が要る点

- 新Swiftファイル登録・Capability・bundle ID・デプロイメントターゲット変更はなし。第9弾APIがコンパイルできるiOS27.1 SDKを含むXcodeの選択と実機ビルドは必要。古いSDKではavailability分岐だけで未定義シンボルを解決できないため、対応SDKの用意を指揮役が確認する。
- Info.plistの2権限キー削除はPR22のコード差分で行い、手動で再追加しない。probeのCSS px変換・タッチ透過・旧OS分岐は実機確認。審査版ではKB診断を除外する設定を確認する。最後のwww同期・ビルド・インストールは指揮役担当。

## 見送る項目と理由

- Duoフリック拡張のreservedRegions/UIHinge計測・下の面いっぱいのキーボード化：別プロジェクトの責任範囲。本計画はカレンダー側の計測値提供とkbTopへの追随まで。KB-1/4/5の拡張側合否をカレンダーの偽装合格で代用しない。
- リマインダー自動取り込み・同期・タスクカテゴリ／手動並べ替え：第10弾の推奨どおり不要。orderは保持する。外部データと旧記録は削除しない。
- memosストア削除・DB v6・古い完了task自動削除：オーナーの非破壊移行と第10弾の保持方針に従い実施しない。最近削除noteの30日後整理は明示削除されたnoteだけが対象。
- 天気・ウィジェット・直接Google連携・新しい手書き入力・横の右面20pt移動：design/14の将来候補／別データ源／未確定実測。既存inkがあれば保全し、推測で横の寸法を変えない。
- ノート40000件の固定上限・旧日ごとのメモUI・17の混在集中モード：オーナーの上限なし・専用ノート・三モード決定により採用しない。メモの元日付はsourceDateで追跡する。

## QAとPR・実機確認の対応

| QA | PR | 自動試験を補う実機確認 |
|---|---|---|
| DP-1/2 | 1〜4 | 20候補の末尾、現在非表示先、設定と編集往復、3姿勢で背景不動 |
| DP-3 | 12/28/32 | 6項目の順・親指到達・再押下復帰・左右同種を二重表示しない |
| DP-4 | 13/14 | 旧timeMode.listで予定リスト、新規時間は1日、homeは今日固定 |
| DP-5・TM-1/4/6/7・TK-2 | 5/17/19 | 日英・日本語フリック・ローマ字で3連続、変換中追加、成功時だけ消去、許可要求0 |
| DP-6・TM-2/3/8 | 18 | 44×48当たり、1.5秒再タップ、6秒戻す、homeからも同じ動き |
| DP-7・TM-5 | 6/28 | 暫定今日復帰→最終はノート一覧・最終note、日付から移行本文をたどれる |
| DP-8/9・TF-1/2 | 32〜35 | カレンダー本文回帰なし、task4集合、3モード専用表示、入力中の開閉・回転 |
| KB-1 | 7/10/11/34 | 詳細でinnerHeight/vv/offsetTop/kbTop/division/frame/angle/statusを記録。開ききり・半開き・閉、taskとnoteを測る |
| KB-2/3 | 34/35 | IME・外付けなしで折り往復、入力行・カーソル保持、補助列44、溝±8を避ける |
| KB-4 | 10/11/34 | 開ききり・閉では通常高さ、半開きのDuoフリックのみ下面化を別担当と確認 |
| KB-5 | 10/11/34/35 | 純正・Safariと10〜20°で比較。690→590例を同座標で測り、枠の高さ／下端・隙間・ちらつきも記録 |
| TK-1 | 15/24/28 | v15の予定・カテゴリ・メモ・送信待ちを控えて更新。abortと再実行は実DB自動試験で補完 |
| TK-3 | 16/25/26/28 | v5全項目復元、旧ファイルでもtask/note/folder/pin保持、旧アプリでv5全体拒否 |
| TK-4 | 17/19/22 | 新規・既存許可端末とも許可画面0、純正リマインダーの件数・内容・通知が不変 |
| TK-5 | 21 | 明示ONだけ当日8時／期限時刻に鳴る、全体OFF、60枠、完了とundo、tap先 |
| TK-6/7 | 20 | 10000taskで検索・追加・表示・書出時間と体感、時差移動後の期限日 |
| NT-1 | 23〜28 | v15メモ件数と本文を控える。更新・v5別端末復元・旧ファイル復元の3経路、固定folder、改名／削除／同名、2回目増加0 |
| NT-1の指紋 | 23〜26/28 | 東京/NYの3008件sha一致・memos控え不変・中断復旧を単体試験、実機は件数と代表本文／旧draft／inkを照合 |
| NT-2・NF-1〜4 | 27〜35 | 件数上限なし、1行目題名、終了直前入力回復、folder/pin、Return/check末尾移動、全folder検索 |
| 祝日・V15 §2-7 | 8/9 | 許可なし・購読OFFでも11/23赤、設定OFFは日曜だけ赤、名前・六曜・暗色・オフライン |
| V15回帰 §1〜8 | 各関連PR | カテゴリ移行・✓・外部予定CRUD/10:07・通知既定なし・copy/paste・六曜・月全5件・backupを維持。旧reminderと日単位memoの期待だけ本表で読み替える |

- KB実測は日本語フリック・ローマ字・英字・予測帯あり／なし・Duoフリック・他社キーボード、3つの折り方×task/noteで記録する。カレンダー側合格は追加欄下端とkbTopの間0〜8pt、上面退避とnote本文は溝非交差・入力行非隠蔽の例外を適用する。
