# 第12版 実装計画（Claude Code 用・4 PR を順番に）

基準は依頼指定 main `408be04`（実機導入済み、SW v26）。計画担当は git 操作・コード変更・テスト実行をせず、本ファイルだけを新規作成した。以下のファイル変更・検証は後続実装担当の作業。指定の08全文・3画像、品質レビュー全文とタッチ終了不具合、データレビュー、07末尾、第10・11版と現行コード／テストを参照。参照は関数名で行う。

## 共通

- PR1→PR2→PR3→PR4 の順に1件ずつ。各PRで `app/` から `npm test` と `npm run test:unit`（スクリプト内で東京・NY）を全件成功させる。既知のskip/todoは結果に明記し、新設・assert削減で通さない。計画作成時は実行していない。
- 各PRで `app/sw.js` のCACHEを v27→v28→v29→v30 と更新（先に使用済みなら次の未使用版）。既存 `tests/sw.spec.js` の更新・オフライン検査を維持。ビルド引き渡し時は既存 `npm run build:www` → `npx cap copy ios` で生成物を同期し、ソースとの一致を確認。push・公開は含めない。
- 第10版の安定寸法L、キーボード中のL保持、safe()、safeChanged／MutationObserver、折り目 `W/2±10`、週アンカー、全部表示の仮想化、4タブと保存値を維持。08 §5・§3.5は実装済みなので回帰確認のみ。祝日・新しいダーク仕様・データレビュー低3〜5は今回の追加対象にしない。品質レビューに高の新規指摘はなく、中2件はPR2で扱う。
- 撮影は既存 `tests/screenshots.spec.js` のshot方式、出力先 `app/screenshots/`。固定時刻・予定・選択日を揃え、数値／動作assert後に撮る。Swiftの実動作はJSモックでは証明できない。

## PR1：タッチ確認を指1回で終了する

**やること・変更先**：`app/js/app.js` の `openTouchCheck` の層イベント除外を修正し、`closeTouchCheck` を維持。現在は終了ボタンでも touchstart／pointerup を preventDefault し、指の互換clickが発生しない。clickだけ除外しているためマウス試験は通る。報告の修正 `if (e.target === end && t !== 'contextmenu') return;` を基本に、子要素を置くなら `end.contains(e.target)` も含める。pointerdownを含む登録イベント全体を確認し、終了操作に対する抑止を残さない。終了は既存clickから1回だけ、層の他の場所は引き続き下へ通さない。

**寸法**：変更なし。層はsafeを引かないviewport全面 `(0,0,W,H)`、表示座標は client と `(clientX-Ls,clientY-T)`。safe=0でも同じ。診断・タッチ確認モードは残す。

**読み替え・追加試験**：`tests/touch-check.spec.js` の既存3件を維持し、同ファイルのtouch専用describe（hasTouch:true, isMobile:true）で終了を `.tap()`、層消去→設定を通常操作できることを確認。3姿勢、終了ボタン上の診断点なし、背景tapは点を記録するだけ、再読込オフ、マウス・Enter/Space終了も確認。既存 `--sat/--sar/--sab/--sal` 注入後も終了可能。別コピーで試す場合は既存4173サーバー再利用に注意し、専用ポートを使う。

**完了・画像**：アプリ再起動なしで終了し元の選択日・表示へ戻る。全件成功＋SW更新。`v12-pr1-touch-check-open.png`、`v12-pr1-touch-check-ended.png`。

## PR2：作成記録v1の移行と追加失敗後の通知復帰

**変更先・移行**：既存 `app/ios/App/App/DuoNativePlugin.swift` の `load/loadCreated/saveCreated/createEvent/updateEvent/deleteEvent`。loadで既存EventKit直列queueへ移行を投入し、更新・削除でも同じqueueで移行を実行する。権限拒否や引数不正の早期returnでも移行を飛ばさない入口構造にする（権限不要のUserDefaults移行を先にenqueue）。loadだけ別スレッドで直接UserDefaultsを更新せず、新規作成とも順序を揃える。v2優先、旧fingerprint→SHA256小文字hex、v2保存後v1キー削除、500件間引き・旧リクエスト再試行互換を維持。移行のためEventKit権限を要求しない。新Swiftファイルなし。

**変更先・失敗確定**：`app/js/app.js` の `createNative/openRetry`、`#xr-close/#xr-retry`、`xrDlg`のcancel／共通 `closePanel` 経路、`initNative` のpending再提示。失敗確定処理を共通化し、`db.js` の既存 `applyAck` で「同じid/requestIdかつ現在pending」のlinkだけunlinkedへ保存→`applyEvents`／再描画→`requestNotifySync('link')`。本文・alarms・再試行用requestIdを消さない。hard（権限・書込不可・追加先なし）はエラー受領時点、再試行可能エラーは「閉じる」・Escape等で再試行しないと決めた時点で確定。単なる再試行用のclosePanelは確定扱いにしない。再試行選択中だけpendingを保ち同requestIdを使用。画面を閉じる全経路を確認し、pending放置を作らない。

削除・置換・別requestId・遅い応答との競合では現在値を再確認し、消えた予定を復活させない。DB失敗時は成功表示や通知復帰を先行させず、保存失敗を表示して再操作可能にする。通知の適格性は `notify.js` の `excluded/planNotifications` の既存規則に任せる（unlinkedは対象、通知なし・過去・全体オフ等は予約しない）。更新outboxの失敗方針まで変更しない。

**寸法**：変更なし。再試行パネルは既存safe／可視矩形内。PR4で変わる右本文境界にも追随させる。

**読み替え・追加試験**：`tests/native.spec.js` のpending再試行試験は「再試行選択中」と「放棄後unlinked」を分ける。hard全コード、一般失敗→同requestId再試行成功／再失敗→閉じる・Escape、再起動で放棄分を再提示しない、遅延中編集・削除・置換、ack失敗を検査。`tests/notify.spec.js` と `test-unit/notify.test.mjs` で未来・alarmsありの放棄後にnotifySync itemsへ戻ること、linked成功／pending再試行中は入らないこと、[]／通知オフは入らないことを確認。

Swiftはparseに加えMacで既存プラグインをビルド。実機UserDefaultsの合成v1で「起動のみ」「update入口」「delete入口」（権限拒否も）後のキー消去、v2同rid優先・500件・2回目不変・平文なし・旧作成再試行を検証し、値の本文をログ／画像に残さない。JSモックを移行実証としない。

**完了・画像**：新規追加しなくてもv1が消え、失敗確定した予定はunlinkedかつ適格なDuo通知を予約。全件成功・Swift検証・SW更新。`v12-pr2-create-failed.png`、`v12-pr2-unlinked-notifications.png`（合成予定のみ）。

## PR3：繰り返し削除の確認を整理する

**変更先**：`app/js/app.js` の `openScope`、scope click、`deleteNotice/askDelete/showConfirm/cancelConfirm`、`#dodelete`。削除実行部を共通関数へ抽出し、範囲直接選択と最終確定から同じ `planDelete/planOps/commit` を呼ぶ。`app/index.html` のconfirmは既存idを維持し必要な文言だけ更新、`app/css/app.css` は既存13px・#68716A・赤ボタンを維持。

| 範囲 | Duoのみ・unlinked | iPhone結びつきあり |
|---|---|---|
| この予定のみ／これ以降すべて | 範囲選択で即実行、2段目なし | 同左。this／future（先頭ならall）の既存反映 |
| すべて | 範囲選択で即実行 | 2段目を残す |

通常の結びついた「すべて」の2段目は見出し **「すべての繰り返しを削除しますか？」**、本文 **「iPhone のカレンダーからも削除されます。」**、左 **「キャンセル」**（初期focus）、右赤 **「すべて削除」**。本文に予定名を付け足さない。単発確認は従来07どおり。

結びつき判定は `deleteNotice` の既存linked／分割pending契約を利用。権限なし／書込不可は引き続きDuoだけの削除とし、警告「Duo からだけ削除されます。iPhone のカレンダーには残ります。」と明示選択「Duo から削除」を範囲シートに表示。only/followingで追加確認を作らない。「すべて」の結びつきあり確認もこの場合は同警告・「Duo から削除」にし、iPhoneから消すと誤告知しない。`dropOnly` でnative delete 0件、対象範囲の未送信update除去を維持。

fallback初回のカレンダー名注意は範囲シートに残し、直接選択も削除確定として既存 `fallbackDeleteConfirmed` 処理を通す。キャンセルでは消費しない。2段目キャンセルは範囲へ戻す。連打防止・失敗時のエラー／再操作、inertとfocus復帰を共通実行部で扱う。

**寸法**：変更なし。confirm/scopeはsafe内、見開きは右本文内。本文改行・ボタン44px以上を維持。

**読み替え・追加試験**：`tests/recur.spec.js/native.spec.js` 等の全範囲で2段目を押すhelperを条件化。Duo／linked／unlinked／分割pending×3範囲、先頭following、権限なし／readOnly、fallback、単発を網羅。only/followingではconfirm非表示のままDB／outboxが1回だけ変わる、linked allは確定前変更0・文言完全一致・cancel focus・戻る、Duo all即実行、失敗時ロールバックをassert。`test-unit/native-ops.test.mjs` のspan／merge範囲期待は維持。

**完了・画像**：表の段数・07追記の文言と既存反映範囲が一致。全件成功＋SW更新。`v12-pr3-delete-scope.png`、`v12-pr3-linked-delete-all.png`、`v12-pr3-duo-only-delete.png`。

## PR4：safe帯を使うB案と低②③

**変更先**：`app/js/app.js` の `updateLayoutMetrics/rightWidth`、`closed/rail/open/pctl/spread/srail`、`chead/shead/rightHead/allBtn/hdr`、`placeMenu`、`SWIPE_EXCLUDE`。`app/css/app.css` のclosed／portrait／spread、rail、見出し・タブ、パネル境界。必要なら `app/index.html` の設定名。旧84/76pxの本文内操作列と重複する設定・検索・今日・＋、右列の月／一覧を除去し、帯または見出し／下段へ配置。data-actや4タブ契約は維持。

歯車SVGを共通化（aria-hidden）、設定入口名は **「設定」** に統一し全テストの「その他」を更新。「全」はoffで「全部の予定を表示」、onで **「通常の予定表示に戻す」**、aria-pressedを維持。見た目28角・透明なhit面、onだけ塗りを維持。月でない表示に無効な「全」を残さない。

### 寸法式（CSS px、DPRで割らない）

入力は安定 `W=L.w,H=L.h` と `T,R,B,Ls=safe()`。帯は右 `[W-R,W]`、上 `[0,T]`。**safeを差し引いたあと旧rail幅をもう一度引かない**。折り目 `f=W/2` は不変。背景は画面端まで、通常パネルは既存safe内のまま。以下の基準高さ・余白は設計比率であり、84/82や機種寸法による分岐を設けない。

- 右帯利用条件は **R>=56**（56角のhit面が収まるか）。`cx=W-R/2`、見た目48角、hit56角。R=0および0<R<56では帯ボタンを置かず、下記fallbackへ。本文右端はどちらも `W-R`。狭いsafeを無理に44未満へ縮小しない。
- 閉じた画面：本文 `[Ls,W-R]`、`C=W-R-Ls`、月列幅 `C/7`。`q=(H-T-B)/678`、見出し下端 `T+76q`、曜日下端／grid top `T+92q`、grid高 `500q`、週高 `500q/n`。タブ幅 `min(286,C-16)`（4×44未満なら別段）、中央x `(Ls+W-R)/2`、中心y `H-B-56q`、高さ46。末尾余白は最低56かつ最終週をタブ上へ出せる量。
  - B帯：設定・検索・全の48角topは `T+[172,232,292]q`。ただし最初のhit上端を `T+160q` 以降にする。今日top `H-B-140q`、＋top `H-B-80q`。月見出しは前後矢印＋題名のみ。
  - fallback：08 §1の見出し（設定・前・題名・次・全・検索）、下段（今日・タブ・＋）。下段は48角を左右8px、タブ中央・幅 `min(286,C-128)`、隙間8以上。題名は可変幅、衝突時は前後移動を設定内へ（既存スワイプも維持）。帯を仮に84px確保しない。
- 開いた横：左月 `[Ls+8,f-10]`、右本文 `[f+10,W-R]`、右中身終端 `E=W-R-16`、時間線開始 `A=f+60`、線幅 `E-A`。rightWidth／終日段／3日表示も同じ境界を使う。`q=(H-T-B)/669`、見出し中心 `T+40q`、左grid top `T+96q`、grid高 `573q`、左タブtop `T+611q`（高さ46、下端clamp）。右「1日」見た目60×32、hit高44、右端E。
  - B帯：設定／検索top `T+[124,184]q`、最初のhit上端は `T+112q` 以降。今日top `H-B-129q`、＋top `H-B-69q`。左見出し設定を帯へ移し、右見出しから今日・検索・＋を除く。全・‹・› は左見出し右寄せでhit44角、文字はfold内へ入れない（08の矢印hit端だけは折り目余白へ許容、文字／paint禁止は維持）。
  - fallback：設定は左見出し、今日・検索・＋は08 §3の右見出しへ（44角、間4、1日幅60）。日付と収まらなければ日付を上段・操作を下段にし、時間軸開始をその実高分だけ下げる。本文内の縦列は作らない。
- 開いた縦：横は `[Ls,W-R]`、`U=W-Ls-R`。見出しを上safeに加算せず **`head=max(T,82)`** として帯内を使う。safe=0は通常82px見出し。曜日24、grid top `head+24`。`p=(H-B)/951`、下段top `H-B-70p`、grid bottom `H-B-71p`、週高 `(gridBottom-gridTop)/n`。今日／＋48角、左右20px、タブ270×46中央（狭幅では相互非重複を優先）。
  - 見出し横座標は `Ls+(設計x/669)*U`：設定20、‹120、題名中心270、›376、全hit432、検索484。hit44角は縮めない。縦中心は `head*46/82` を22〜head-22へclamp。右上の予約幅 `129*U/669` に検索hitが入らないことを確認。T=82で検索右528、予約左540。safeが小さい／0でもこの間隔は維持。実機状態表示が左へ伸びた場合は検索・全・›を同量左へ寄せ、互いのhitが重ならないことを再確認。
- 非標準の小さい高さでは帯上下グループの56角hit間隔を検査し、重なるなら設定／検索を見出し、今日／＋を下段へ退避。枠・文字は縮めず本文を内部スクロール。safe更新だけでも配置を再計算。既存の入力中姿勢保持は変更しない。

### 計算例（記載以外のsafeは0、n=6）

| 姿勢・safe | 本文／帯・列幅 | 主な縦位置・右線 |
|---|---|---|
| 閉466×678、R84 | 本文0〜382、帯382〜466、cx424、列54.57 | grid92〜592、週83.33、タブ中心(191,622)。設定172、検索232、全292、今日538、＋598（各top） |
| 同、safe0 | 本文0〜466、帯なし、列66.57 | grid92〜592、週83.33。見出しと下段fallback、今日x8、＋x410、タブ幅286・x90・中心y622 |
| 横951×669、R84 | 左8〜465.5（列65.36）、右485.5〜867、帯867〜951、cx909 | 線535.5〜851、幅315.5。帯top124/184/540/600、左タブtop611 |
| 同、safe0 | 左は同じ、右485.5〜951、帯なし | 線535.5〜935、幅399.5。見出しfallback、必要時2段化で時間軸のみ下げる |
| 横890×626、R84 | 左8〜435（列61）、右455〜806、帯806〜890、cx848 | 線505〜790、幅285。q=.93572、帯top116.03/172.17/505.29/561.43、左タブtop571.73 |
| 同、safe0 | 左は同じ、右455〜890、帯なし | 線505〜874、幅369。見出しfallback |
| 縦669×951、T82 | 上帯0〜82、列95.57、head82 | grid106〜880、週129、下段top881。見出し中心y46、検索x484〜528、予約x540〜669 |
| 同、safe0 | 上safe帯なし、通常見出し0〜82、列95.57 | 同じgrid／下段。時計・電池をアプリで描かない |

08 §1の冒頭画像はA案なので、閉じたsafeありの操作位置は画像から転記せず§1.5を正とする。横・縦は§6とbandB画像に合わせる。端数はCSS pxのまま扱い、図の486／536等の丸めとの差を許容する。

### 読み替え・追加試験・完了

`tests/helpers.js` の設定入口と `setStyle`、`layout-metrics/closed-tabs/open-portrait/ref-layout/layout/safe-layout/timeline/month-all/allbtn-look/swipe/screenshots` 各specを更新。旧「safe内にさらにrail84/76」「portraitはTを見出しに加算」「右列の月／一覧」期待を本式に置換。DB・連携payload・月レーン・ポップアップ外側閉じの期待は維持し、clickのforceやskipで通さない。

safe注入は `layout-metrics.spec.js` のsetSafeと同じ `document.documentElement.style.setProperty('--sat'等, '…px')`。新たな機種偽装APIは作らない。上表8ケースに加え、R47／R56境界、左右非対称、T47・B34、safeだけの変更→0戻し、626×890・閉じた横、回転・キーボードを検査。3姿勢×4タブで操作到達・非重複・重複ボタンなし。56角hit（上帯等44角）を矩形＋elementFromPoint＋実tapで確認。帯はsafeに対してpointer-events:noneで遮断しない。

月列幅・時間線終端・週高・タブ位置、末尾週の露出、全のaria両状態／再読込、歯車と「設定」、帯ボタンのメニュー配置、fold内文字／paintなし（矢印hitの許容を区別）、dark・文書overflowなしをassert。safe値の診断表示とタッチ確認は維持し、PR1のtap終了も回帰。実時計／電池との重なりは実機で別途確認。

全件成功＋SW更新、3姿勢とも本文内の縦操作列がなく、上表のsafeあり／なしで全機能へ届くことが完了条件。

必須画像（named月・light、全操作が見える状態。横2サイズを含む8枚）：

- `v12-pr4-closed-466x678-safe-r84.png`、`v12-pr4-closed-466x678-safe-0.png`
- `v12-pr4-spread-951x669-safe-r84.png`、`v12-pr4-spread-951x669-safe-0.png`
- `v12-pr4-spread-890x626-safe-r84.png`、`v12-pr4-spread-890x626-safe-0.png`
- `v12-pr4-portrait-669x951-safe-t82.png`、`v12-pr4-portrait-669x951-safe-0.png`

同じ8条件のdarkを `-dark.png`、代表の全部on／末尾と設定表示も `-all-end.png`／`-settings.png` で補足。OS状態表示の合成画像で実機合格としない。

## Xcodeで手作業が要る点

ソース登録・設定変更は **なし**。既存DuoNativePlugin.swift内で対応し、新Swiftファイル、ターゲット所属・Capabilities・Info.plist・PrivacyInfoの変更は不要。Macで同期済み既存Appターゲットをビルド・実行し、queue順序とEventKit／UserDefaults移行を確認する。parse成功をSDK型検査の代用にしない。

## 実機確認（短い一覧）

1. 3姿勢でタッチ確認→指1回で終了→通常操作。帯タップの記録も残る。
2. 旧版から更新し、新規追加せず起動だけでv1消去。更新／削除入口でも同じ。既存作成再試行は二重作成なし。
3. iPhone追加hard失敗／一般失敗を閉じる→unlinked・Duo通知予約。再試行成功はiPhoneのEKAlarmだけ、二重通知なし。
4. 繰り返しonly／followingは1段、Duo allも1段、linked allだけ指定の2段。権限なしはDuoだけ削除、キャンセルで消えない。
5. 閉じた右・開いた横右・開いた縦上の各帯で、時計／電池に重ならず設定・検索等を押せる。特に縦の検索右と状態表示左を確認。
6. 回転・safe変化・キーボード・4タブ・全部・最終週・時間軸・オフライン起動を確認。VoiceOverで全on/offの操作名と設定を確認。
