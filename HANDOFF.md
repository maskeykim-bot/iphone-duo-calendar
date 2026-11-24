# HANDOFF — Duo カレンダー（iphone-duo-calendar）

Mac の Claude Code へ引き継ぐためのメモです（2026-11-24 日本時間、main = v19.4 の時点）。
この Mac には iPhone シミュレーター（「iPhone Duo」）があるので、実機に入れる前に細かい挙動をシミュレーターで確かめられます。

---

## 1. アプリの概要と目的

- **何か**: 2画面折りたたみの iPhone（通称「iPhone Duo」）向けの手帳型カレンダー。閉じた画面（片面 466×678pt）と、開いた画面（縦 669×951／横 951×669、真ん中に溝）で形が変わる。
- **持ち主**: 征希さん。いずれ App Store で販売する方針（販売名は未定。「iPhone Duo」は Apple の商標なので使えない。候補は ひらくカレンダー・紙面カレンダー・Folio 手帳・Leaf カレンダー・暦帖）。
- **お手本**: 本家「FirstSeed 手帳」の動きと使い勝手（絵・アイコン・文言・名前は真似せず描き直す）。
- **いちばんの強み**: 「カード」感覚の使いやすさ。予定・メモ（ノート）・タスクをすべて題名付きのカードにし、長押しで別の日へ自由に動かせる。
- **最優先**: 見た目の質と、触り心地・動きの気持ちよさ。妥協しない。
- **主な機能**: 月・週・日・時間軸・ホーム（今日／次の予定）、iPhone の「カレンダー」（EventKit）の予定の表示と編集、六曜・祝日、時刻のダイヤル入力、ノート（純正メモ風。行頭記号・チェック・字下げ）、タスク（アプリ内の通知）、カードの長押し移動、ページめくり（WebGL）、くすみ色と予定ごとの色（v19.4）、JSON バックアップ。

## 2. 守ること（いつでも）

1. **bundle ID `com.maskeykim.duocalendar` は変えない**。変えると実機の IndexedDB（予定データ）が読めなくなる。名前を変えるときは表示名（`CFBundleDisplayName` と `capacitor.config.json` の `appName`）だけ。
2. **IndexedDB の SCHEMA_VERSION とバックアップの VERSION は 6 のまま**。7 は V20 の zip 形式のために取ってある。保存形式の変更が必要になったら、実装せず設計を書いて征希さんに確認する。
3. **色は表示するときに変換するだけ**。IndexedDB・バックアップ・EventKit に入る色は元の値のまま。「元の色のまま」の設定は作らない。
4. **`#68716A` / `#68716a` を一括で置き換えない**。iPhone の予定の代わりの色や未分類の色として使っている（`js/iphone.js:71`、`js/app.js:598` 付近、`js/categories.js:49`）。
5. **`git stash` は使わない**（作業が消えた事故があったため）。小分けにコミットする。
6. **Claude Code・Codex は API キーで動かさない**（サブスクのログインで動かす。スクリプトは `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN claude …` で起動している）。
7. Mac で `osascript`・System Events は使わない。
8. **force push はしない**。main へ push するのは、チームの4人（企画・設計・連携・品質）が合格を出して、征希さんが承認した版だけ。
9. 既存のテストは全部通す。仕様の変更でテストの期待値を直したときは、テストの中と版のメモに理由を書く。

## 3. 技術スタック

- **アプリ本体**: 静的な PWA（ビルドなしの素の ES Modules）。`app/index.html`、`app/js/*.js`（中心は `app.js`）、`app/css/app.css`、Service Worker `app/sw.js`（`CACHE = 'duo-static-v184'`。**版ごとに番号を上げる**）。
- **保存**: IndexedDB（`js/db.js`、版 6）、バックアップは JSON（`js/backup.js`）。
- **iOS**: Capacitor 8（`@capacitor/ios`、`@capacitor/keyboard`）。CocoaPods は使わず SPM。iOS 側の Web 一式は `app/ios/App/App/public/` に写してコミットしてある。
- **ネイティブ**: `app/ios/App/App/DuoNativePlugin.swift`（EventKit の予定、通知、共有シート、めくりの試作 B など）、`MainViewController.swift`（`capacitorDidLoad` で登録）。iOS 15 以上。ライト固定（`UIUserInterfaceStyle=Light`）。
- **ページめくり**: `app/js/curl/*`（WebGL）。
- **テスト**: Playwright 1.65（chromium と webkit。webkit で回す spec は `playwright.config.js` の `testMatch` で決めている）と、Node の `node --test`（`test-unit/*.test.mjs`。東京とニューヨークの時刻帯で2回回す）。

## 4. ビルド・起動の方法

### Web（開発）
```bash
cd app
npm ci
npm start                     # node server.mjs（ポートは引数か PORT。既定 4173）
# ブラウザで http://127.0.0.1:4173/  。?theme=dark でダークの見本（利用者には出していない）
```

### テスト
```bash
cd app
npx playwright install chromium webkit   # 初回
# chromium の project は CHROME_PATH の Chrome を使う（既定 /usr/bin/google-chrome は Linux の箱の値）。
# Mac では例: export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run test:unit                        # 単体（TZ=Asia/Tokyo と America/New_York）
npx playwright test --workers=3          # 全体（chromium＋webkit で 2300 件余り、約 30 分）
npx playwright test tests/v194-colors.spec.js tests/v194-review-fix.spec.js   # 関係 spec だけ
```
- 長い実行はログに出す（例: `nohup npx playwright test --workers=3 > ../v191-notes/full.out 2>&1 &`）。
- ゆらぎがある spec（`closed-pull-v20.spec.js:272`、webkit の `v193-*` のいくつか）は、1本ずつ回し直して確かめる。

### iOS に写す（Web を変えたら必ず）
```bash
cd app
npm run ios        # = npm run build:www && npx cap sync ios（app/ios/App/App/public を更新）
```
`app/ios/App/App/public` の変更もコミットする。

### 実機ビルドとインストール（Mac）
```bash
cd app/ios/App
xcodebuild -scheme App -configuration Debug -destination generic/platform=iOS \
  -derivedDataPath ~/Developer/duo-build DEVELOPMENT_TEAM=Y2ADWKJL86 -allowProvisioningUpdates build
xcrun devicectl list devices
xcrun devicectl device install app --device 00008160-001C5CD93C400036 \
  ~/Developer/duo-build/Build/Products/Debug-iphoneos/App.app
```
- 実機は「kim.SoftBank」（UDID 00008160-001C5CD93C400036）。iPhone がロック中や未接続だと入らない。
- 署名は無料の個人チーム（Team Y2ADWKJL86）なので **7 日で切れる**。いま入っている版の期限は **2026-11-27 10:32（日本時間）**。切れる前にビルドし直して入れ直す。
- 確かめ方: `/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" <App.app>/Info.plist` が `com.maskeykim.duocalendar` であること。期限は `security cms -D -i <App.app>/embedded.mobileprovision | plutil -extract ExpirationDate raw -`。
- 古いファイルが DerivedData に残ることがある（例: v19.3 で消した `public/js/reminder-sync.js` がまだ App.app に入っている。どこからも読み込まないので動きには関係しない）。気になるときは `~/Developer/duo-build` を消してからビルドする。

### シミュレーターで確かめる
```bash
xcrun simctl list devices | grep -i booted          # 「iPhone Duo」E9E9A78B-9678-41F3-A980-5CA13C8FB107
cd app/ios/App
xcodebuild -scheme App -configuration Debug -destination 'id=E9E9A78B-9678-41F3-A980-5CA13C8FB107' \
  -derivedDataPath ~/Developer/duo-build-sim build
xcrun simctl install booted ~/Developer/duo-build-sim/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.maskeykim.duocalendar
```
- Web の中身は Mac の Safari →「開発」→ シミュレーター（または実機）→ アプリの Web インスペクタで見られる。
- Debug ビルドだけの確認用: 起動引数 `-DuoEvalJS "<js>"`（`-DuoEvalDelay 秒`）で起動後に JS を1回実行、`-DuoSlowAnim 0.1` でアニメーションを遅くする。
- めくりの速さは `location.href='capacitor://localhost/?curlperf=1&auto=20'`（`design/CURLPERF_V18.md`）。シミュレーター（GPU が違う）の数字は参考だけで、合否は実機で決める。
- シミュレーターでは、触覚、慣性スクロールの手ざわり、EventKit と iCloud／Google の同期、通知の鳴り方は実機と違う。最後は必ず実機で見る。

## 5. 現在の実装状況（v19.4 まで）

- **〜v18**: 月・週・日・時間軸・ホーム、iPhone のカレンダー連携（読み・追加・編集・削除）、カテゴリ、祝日、六曜、コピー・貼り付け、検索、WebGL のページめくり（r3。征希さんが「これで進めよう」と決めたもの）。
- **v19（7項目）**: 時刻のダイヤル、長押しで予定を別の日へ（0.35 秒）、閉じた画面と開いた縦のタブをそろえる、キーボード表示中の画面、純正メモ風のノート（第1段: 書式と下へ伸びる形）、タスク、保存できなかったときの文言。
- **v19.1 / v19.2（S1〜S11j）**: 閉じた画面を FirstSeed に寄せた（下のタブを消し、月の表示段は7段）、つまみの貼り付き、閉じた月のスクロールなど。
- **v19.3**: 閉じた画面は1本の縦スクロールにした（段はつまみ `.mgrab` だけで変わる）。日の欄は「カード｜時間」。ノートの行頭記号の直しと字下げ（Tab／左右の払い）。入力欄がキーボードに隠れない。**iOS リマインダーとの同期をやめた**（タスクはアプリの中だけ。通知もアプリから出す。Info.plist のリマインダーの説明文も外した）。ノートのチェック行はノートの日付を期限にしたタスクになる（チェックは両方向でそろう）。予定・メモ・タスクのカード化と長押しでの移動（design/35。落としてから 300ms 以内に表示、持ち上げ・落とす・戻すの反応は 100ms 以内）。
- **v19.4（main = この版）**: くすみ色（design/36 §15 案A）。予定は「ごく薄い地＋左の色の線 2.5×10pt＋墨の文字」、チップと帯は高さ 14pt。前後の月はまとめて薄く（#5D6963）、土曜は青・日曜は赤（土曜の列の地は残す）。予定ごとの色（design/37: カテゴリの色＋フリック7色）。繰り返しの予定は全部の回が同じ色（`colorId` は系列の本体だけに書く）。iPhone の予定の色は meta `'xcolors'` に置く（キーは externalId、空なら itemId）。`hexColor` は 0〜1 に収めてから変換。レビュー直しで、帯の題名のはみ出し、枠と重なり順、溝、+N、色の行、「分類」、下書きの色、六曜と「終日」のコントラスト、現在時刻の札（#CF3F3B）を直した。4人とも合格。
- 版ごとの詳しい記録: `v191-notes/S*.md`、`v191-notes/V193.md`、`v191-notes/V194.md`、進捗は `V193_PROGRESS.md`・`V194_PROGRESS.md`。

## 6. 見た目・触り心地で未解決の問題（試したこと・駄目だった理由）

1. **ページめくりのヌルヌル感（FirstSeed 並み）**
   - 試したこと A: WebGL のめくり（`js/curl/`）。r3 で「だいぶよくなった」と採用し、v18 で速さを測る仕組み（`?curlperf=1`）を作った。
   - 試したこと B: iOS 本来の `UIPageViewController` の pageCurl を、スナップショットの上で動かす試作（v18.4、`design/CURL_NATIVE_B1.md`）。**征希さんが実機で「全然だめ」と判断**。iOS の部品では、めくる途中で紙の幅を変えられない、着地の傾きを 0 にできない、次のページを撮るとシミュレーターでは絵が古いまま、などの限界があった。コードは branch `wip/native-curl-b1` に残してある（開発用の Linux の箱のリポジトリにだけあり、GitHub には上げていない）。今は A を使っている。
   - 残り: 実機の fps（合否の線は 60Hz で p95 18.0ms、120Hz で p95 9.5ms）と、めくりの感度（始めの帯）の手ざわり。
2. **開いた横のぼかしの切れ目**（v19.4、設計レビュー）: 下のバーの上のぼかしを 24→12 にしたが、ぼかしの下端とバーの後ろに見える時間軸の枠の続きの間に、細い切れ目がまだ残る（`fix-open-land-light.png` の 16:00 の下）。なくすには、バーの後ろを隠すかぼかしの作りを変える必要がある。次の版で設計と相談。
3. **切ったチップ・帯の文字のかけら**（設計レビュー、次の版）: 文字を地の中で切るようにしたので、切れ目に次の字の 1〜2px が点のように残る（「ロイコ売.」など）。案は、文字の右端 6pt を地の色へ消すぼかし（`mask-image: linear-gradient(to right,#000 calc(100% - 6px),transparent)`）を全部の面に付けること。… は付けない。
4. **下の欄の薄い文字のコントラスト（品質 Q-6）**: 「タスク ›」「ノート ›」「予定はありません」はカプセル #EFECE4 の上で 4.27、「カード｜時間」の選んでいない側は 3.83 で、4.5 に届かない。決定 8（日付横の文字だけ #5D6963）の範囲外なので、次の版で決める。#68716A は一括置換しないこと（§2-4）。
5. **ダークの現在時刻の札（品質 Q-7）**: ダークの見本では地 #DE6B62・文字 #262A27 で 4.43。ダークはまだ利用者に出していない（`?theme=dark` の見本だけ）。全画面のダークは別の版でまとめて入れる決まり。
6. **選んだ日の枠の内側の空き**: 1日のチップはマスの端から 5.5pt 内側。枠の内側の縁からは、閉じた縦 2.5pt・開いた画面 3.5pt。設計が「今のまま」と確定した。
7. **閉じた画面の1本スクロール（v19.3）は実機の手ざわりが未確認**: Playwright では慣性・端のはね返り・sticky の見出し・つまみ（下）が 0.15 秒で出る所を確かめられない。WebKit には `scrollend` がないので「0.14 秒 scroll が来ない」で止まったと判断している。慣性の終わりぎわで1回早く決めることがある。
8. **長押しの持ち上げ（v19.3）**: 開いた横の「ノートの題名の行」（入力欄）の長押しで、iOS が先に拡大鏡やキーボードを出さないか、実機で未確認。出るなら、持ち上げ口を題名の左の余白か日付の札へ移す案がある。運ぶ間に文字が選ばれる不具合は `user-select:none`・`-webkit-touch-callout:none`・選択を外す・題名の欄を運ぶ間だけ `inert` で止めた。
9. **ノートのチェック行→タスク**: 打っている途中の文字（例「ぎゅう」）で一度タスクができ、そのあと題名が直ることがある（1件のまま）。行の文字を変えるのと行の足し引きを1秒以内に続けると、つながりが切れることがある。タスクの側で題名を直しても、ノートの行は変わらない（逆向きは入れていない）。
10. **時間・最低限（1時間 28pt）**: 30分の予定は最小の高さ 20 になり、次の30分に 6 かかる。15分刻みの直接入力は 1刻み 7pt で、指では細かい。
11. **v19 からの残り**（`v19-open-issues.md`）: 開いた縦の下パネル（月の表現「全部」）でノート本文が書式バーに覆われる（`memo.spec.js` の1件は fixme）。開いた縦の月タブで、日の部分を「時間軸」にしていると、下の予定を上の月へ落とせない（design/29 §5）。
12. **色の実機確認（v19.4）**: 紙の色の上での薄い地の見え方、フリックの似た色の組（グレージュ／ミルクティー、くすみピンク／テラコッタ）、カスタム色のカレンダーが灰色に化けないか、externalId が同期のあとも変わらないか、別のアカウントへ動かしたとき、3000件の色の表の書き込みの速さ。どれも実機と iCloud／Google が要る。

## 7. 必要な環境変数・API キー（項目名だけ。値はここに書かない）

- アプリ本体: **API キーは要らない**（外のサーバーにつながない。iPhone のカレンダーは EventKit 経由）。
- テスト・道具で読む環境変数: `PORT`（`server.mjs` のポート、既定 4173）、`PW_PORT`（Playwright のサーバーのポート、既定 4173）、`CHROME_PATH`（Playwright の chromium が使う Chrome の場所）、`TZ`（単体テストの時刻帯。`npm run test:unit` が設定する）。
- 署名: `DEVELOPMENT_TEAM`（xcodebuild の引数。チーム ID）。Apple ID は Xcode にサインインしたものを使う。
- 使わないもの（入っていたら外して起動）: `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`（Claude Code はサブスクのログインで動かす）、Codex の API キー。
- GitHub: `origin` は `https://github.com/maskeykim-bot/iphone-duo-calendar.git`。トークンを remote URL やログに書かない。

## 8. 次にやるべきこと

1. **署名の期限（2026-11-27 10:32 JST）の前に**、実機へ入れ直す（§4）。
2. 征希さんの実機での感想を集める: くすみ色の見え方（v19.4）、カードの持ち上げと移動の手ざわり（v19.3）、閉じた画面の1本スクロール、キーボードと入力欄。
3. 次の版の候補（4人のレビューで次へ回したもの）:
   - Q-6 下の欄の薄い文字（4.27／3.83）を 4.5 以上に（どの文字をどの色にするか、設計と決める）
   - Q-7 ダークの現在時刻の札（4.43）。ダーク全体を出すときに一緒に
   - 開いた横のぼかしの切れ目（§6-2）
   - 切ったチップ・帯の文字の右端 6pt のぼかし（§6-3）
   - 設計の「望ましい」10（下の札の高さ: 設計の文書を 28 に直す）・13（開いた縦の最後の行）
4. カード機能の続き（征希さんの順番）: 開いた画面で右から左の月へ落とす操作 → 繰り越し → まとめて送る。一つずつ、質を優先する。
5. 販売に向けて: 販売名を決める、有料の Apple Developer 登録（7日で切れない署名）、App Store の準備。
6. V20 で予定しているもの: ノートの手書き・写真、zip のバックアップ（版 7）。

## 9. 資料の場所

- リポジトリの中: `v191-notes/`（版ごとの実装メモ・テストのログ）、`design/`（DESIGN.md、IMPL_PLAN_V10〜V19、CURL_NATIVE_B1.md、CURLPERF_V18.md）、`app/ios/README.md`（iOS の手順と EventKit の注意）、`V193_PROGRESS.md`・`V194_PROGRESS.md`、`v19-open-issues.md`。
- チームの資料（開発用の Linux の箱の `/workspace/duo-calendar-team/`。この Mac には無い。必要なら征希さんに写しを頼む）: `design/`（25 見た目と動きの決まり、33・34 閉じた画面、35 カード、36 くすみ色、37 予定ごとの色、V194_レビュー.md）、`qa/`（verify-*.md、V194_レビュー.md）、`data/`（連携の回答・レビュー）、`research/`。
- スクショ（箱の上）: `/workspace/cal-v191-shots/V193/`、`/workspace/cal-v191-shots/V194/`（`fix-*.png` が v19.4 の最終）。
