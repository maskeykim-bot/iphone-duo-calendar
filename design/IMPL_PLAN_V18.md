# 第18版 実装計画：「今日＋明日」の見開きとページめくり（curl-v1）の組み込み（Claude Code：1回に1PR）

基準は main `a31e7c5`（第17版、SW v146、IndexedDB v5、バックアップ v5）。征希さん了承（11/18 15:31「めくりだいぶよくなったね。これで進めよう」）。開発責任者の決定 A〜H（連携 第15弾の冒頭）と、下の「追加の決定」に従う。

| 番号 | 題名・範囲 | SW |
|---|---|---|
| PR1 | 見開きの型「今日＋明日」と1日ページ（①） | v147 |
| PR2 | めくりの部品 js/curl/（使わないまま入れる）と WebKit の project（②） | v148 |
| PR3 | 本物のデータからページの絵を描く painter（③） | v149 |
| PR4 | 組み込み：操作の取り合い・着地・幅の変化・視差効果を減らす・WebGL なし（④） | v150 |
| PR5 | 実機の計測 `?curlperf=1`（⑤） | v151 |

## 追加の決定（11/18 開発責任者。資料と食い違うときはこちらが優先）
1. ページの高さは design/26 の **y0〜603**（669 ではない）。めくりの紙・左右ページの矩形は y0〜603（`--content-y` が 0 でない端末ではその分ずらす。寸法は `updateLayoutMetrics()` の値から作る）。
2. 着地で隠れない左の端は **112pt（x8〜120）**（紙の幅 365.5 で背から左へ降りるため）。
3. 予定をつかむ長押しは **今の 350ms のまま**（direct-input.js を変えない）。
4. 開いた縦の横すべりは **0.25 秒**。WebGL が使えないときの逃げ（横すべり）も **0.25 秒**（今の swipeTo の 0.1＋0.1 ではない。今の型の普通のスワイプは今のまま）。
5. ダークの紙は **#262A27**、罫線 #343A36（design/26 §4）。`DARK.enabled` は false のまま。
6. ライトの紙は **#FFFDFA**（左右ページも紙の裏も）。裏の罫線 #EEEAE1、透かし 16%。試作の #F7F4ED は使わない。
7. canvas と DOM のずれ：**0.5pt を超えたら不合格、0.25pt を超えたら注意**（テストは注意を console/annotation に出し、合否は 0.5pt）。着地後は本物の DOM（決定 B）なのでずれ 0。
8. 品質の確認表 /workspace/duo-calendar-team/qa/verify-curl-integration.md の 1章・2章・3章に Playwright のテストを合わせる（テスト名に CS 番号や確認表の項目を入れる）。
9. めくりを始めるのは **端の 24pt の中だけ**（前へ x827〜851、戻り x28〜52）。ページの中ほどで横に 12pt 動かしても始めない（design/26 §3。design/21 §6.5 の「どこでも 12pt」は古い）。tt の型では端の外の横スワイプで日を送らない。
10. WebGL なしの逃げ（横すべり）は **0.25 秒**（今の swipeTo の 0.1＋0.1 秒を tt の型・開いた縦の tt では 0.25 秒に直す）。始め方は WebGL ありと同じ端の 24pt（design/26 §6 と連携手順書 7章の確定値）。
11. メモリの見積もりは高さ 603 で約 58.1MB（連携手順書 8章の更新値）。⑤の JSON に見積もりとして入れる。
12. 連携の手順書 data/連携_第15弾_ページめくり組み込み.md は確定値に更新済み。design/26 にも追記がある。食い違いは本計画→design/26→手順書の順で優先。

## 共通の前提
- 新しい状態 `state.spreadType`：`'pages'`（今の左右自由の見開き。既定）か `'tt'`（今日＋明日）。設定の保存は既存の pages と同じ流儀（同じストア・同じ保存関数）。不正値は `'pages'`。
- 「今日＋明日」の左＝`state.selected`、右＝その次の日。日送りは ±2日。型を変えても `state.selected` は変えない。
- 1日ページの縦の寸法（左右とも同じ）：見出し 82（y0〜82）、予定 300（y82〜382、初めの値）、つまみ 24（y382〜406）、ノート 197（y406〜603）。予定欄の高さ `state.ttSplit`（既定 300、最小 160、ノート最小 120）は保存し、左右で共通。
- 寸法は design/26 §1（951×669・右の帯 84 のとき、左 x8〜465.5、溝 x465.5〜485.5、右 x485.5〜851）。実際の値は `updateLayoutMetrics()` の `--left-start/--left-end/--right-start/--right-end/--fold-x` から読む（固定値を書かない）。
- テストの WebGL：Chrome（今の executablePath）でも WebKit 2388 でも headless で WebGL が使える（box で確認済み。Chrome は SwiftShader）。速さは box では測らない。
- tests/ は server.mjs が出さない（hidden）。テスト用の HTML は tests/fixtures/ に置き、`page.route()` で返す。curl-v1.html は tests/fixtures/curl-v1.html へ写してよい（写したもののハッシュが dfb1e232… であることをテストで確かめる）。

## PR1：見開きの型「今日＋明日」と1日ページ（①）
- js/pages.js：型 `SPREAD_TYPES = ['pages','tt']` と正規化 `normSpreadType`。normalizePages の「同じ種類を2つ並べない」決まりは変えない（tt は pages とは別の型として持ち、左右の種類を書き換えない。tt をやめると元の左右に戻る）。test-unit/pages.test.mjs に足す。
- js/app.js：
  - 右の帯に型のボタン（開いた横だけ。押せる 56×56、aria-pressed、aria-label「今日と明日の見開き」。選んだら緑の地）。置き場所は帯の既存の操作と重ならない所（POS に足す）。帯の高さが足りなければ既存の並びを詰めず、POS の計算で空いている所を探す（band-layout.spec.js の既存の期待を壊さない）。
  - `spread()`：`state.spreadType==='tt' && layoutKind()==='spread'` のとき、左右とも1日ページ `dayPage(side, dayKey)`（左 selected、右 selected+1）。ページの地は左右とも #FFFDFA（この型のときだけ。css で `.tt` のときの背景を上書き）。
  - 1日ページ `dayPage`：見出し 82（日付 20pt W6 左 16、六曜 13pt 灰を右 16。祝日・六曜の設定に従う。今の dateHead の見た目・部品を再利用してよい）、予定 300（時間軸。1時間 60、時刻の列 16〜56、予定の枠は 60 から右 20 まで。終日は欄の上に。既存の timelineHtml / allDayRow / dayBlocks を再利用。160 未満なら一覧（1件 32））、つまみ（見た目 36×4 #C9C5BA、押せる高さ 24。上下に引くと左右一緒に変わる。pointer で実装し、横スワイプ・めくりの開始にしない）、ノート 197（罫線 #EEEAE1 を 30 おき、左右 16 内側。その日の日付つきノート `noteDateOf` の1件目の本文を罫線に沿って表示。たたくと第17版の「この日のノート」と同じ規則で開く＝0件は新規、1件は開く、複数は絞った一覧）。行の高さ・y は CSS で整数 px（③で canvas がこの DOM の位置を読む）。
  - 時間軸のスクロール位置は左右で共通（片方をスクロールしたらもう片方も同じ scrollTop）。日を送っても保つ。
  - 予定のタップで編集、長押し（350ms）で予定のドラッグ・なぞる入力が、左右どちらの1日ページでも今の時間ページと同じに動くこと（direct-input の対象に入れる）。
  - 日送り：この型では今の横スワイプ・`move()` を ±2日にする（めくりは PR4。PR1 の時点では今のスワイプで ±2日、すべりは 0.25 秒）。
  - 開いた縦（open portrait）で型が tt のとき：上＝selected、下＝次の日の1日ページを出し、横スワイプで ±2日、0.25 秒で横に滑らせる（紙のめくりは使わない。design/26 §5）。閉じた画面は型を無視して今のまま。
  - 幅のつまみ（design/21 §5）はまだアプリにない。この型で出さないこと。
- css/app.css：`.tt` の見開き、`.dpage`（1日ページ）、つまみ、ノートの罫線。溝（--fold-keepout）には何も置かない。
- テスト：新設 tests/tt-spread.spec.js（Chromium）：型の切替と保存・復元（再読み込み）、左右の矩形（x8〜465.5 / 485.5〜851、y0〜603、±0.5）と1日ページの中の 82/300/24/197、左右で縦の寸法が同じ、つまみで左右一緒に動き保存される・最小 160/120・160 未満で一覧、±2日（18・19→20・21、月末・年末をまたぐ）、紙の色 #FFFDFA、タップで編集・長押しでドラッグ（めくらない）、時間軸のスクロール位置の共有、開いた縦で上下に1日ページ・横すべり ±2日、型を pages に戻すと元の左右に戻る。既存の関係 spec（pages.spec.js、band-layout.spec.js、layout-metrics.spec.js、swipe.spec.js、direct-input.spec.js、open-portrait.spec.js、timeline.spec.js、dated-notes.spec.js、sw.spec.js）を通す。
- 完了条件：既定（pages）の見た目・動きは何も変わらない。tt の型で上の寸法どおり。

## PR2：めくりの部品 js/curl/（②）
- 連携 第15弾 3章の分け方で js/curl/ を作る：`params.js`（K・TUNE・時間・緩急を curl-v1 の値のまま `Object.freeze`。`export const DARK = { enabled: false, paper: '#262A27', line: '#343A36', ... }`、ライトの紙 #FFFDFA・裏の罫線 #EEEAE1・show 0.16）、`geom.js`（curl-geom.js の okF/clampF/shape/deform/SET を、寸法を引数 `{ spine, edge, py0, py1, lx0, lx1 }` でもらう形に。式は同じ）、`shaders.js`（VS・COMMON・FS_BASE・FS_PAPER の文字列。式は変えない。FS_BASE の溝の固定値 `458./484.` だけ uniform にする）、`mesh.js`（2pt の網目）、`renderer.js`（WebGL の用意・uniform・1コマの描画・`webglcontextlost/restored`・テクスチャの作成と `deleteTexture`・`dispose`。テスト用に `readPixels(rect)`）。index.js はこの PR では最小（`createCurl()` の骨組み）でよく、アプリからはまだ呼ばない（import もしない）。
- 寸法：アプリ座標（背 = --right-start、端 = --right-end、ページ縦 y0〜603、戻りの紙は背から左へ同じ幅 365.5 で x120 まで）。curl-v1 の寸法（背 484・端 860・左 8〜458・y8〜661）を渡せば curl-v1 と同じ絵になること。
- playwright.config.js：projects を2つに。`chromium`（今の設定そのまま。全 spec）と `webkit`（browserName webkit、`testMatch: /curl-.*\.spec\.js/` のめくりの spec だけ）。`npm test` で両方回る。既存の spec が webkit で回らないこと。
- テスト：tests/fixtures/curl-harness.html（部品だけを読み、姿勢を指定して描く。文字のない紙 plain と、試しの文字入り紙）を route で返す。新設 tests/curl-parts.spec.js（Chromium と WebKit）：
  - curl-v1 との一致：tests/fixtures/curl-v1.html（sha256 確認）とハーネスに同じ寸法・同じ姿勢・同じ紙（plain、紙色を curl-v1 と同じ #F7F4ED にして比べる）を渡し、画素の差が 2 段まで（5姿勢）。
  - CS-15：アプリ座標の 951×669 と 890×626 で、進む・戻る各 700 点＋格子 420 点（check.mjs の `__checkGeometry` と同じ判定）。外れ 0。傾き ≤35°。
  - CS-16：plain の5姿勢（つかみ始め・1/4・半分・3/4・離す直前）を dpr 2 で、cs16_scan.py と同じ2階差の判定（Node か page 内の JS に移す）でしきい値超え 0。
  - 根元の影：品質の測り（折れ線の周り 3×3 平均と 16pt 離れた平らな所）で −10pt 0%、0pt 12%（ライトは 11.9% 前後、±1段）、巻き側 9＋1×lift で 0。ダーク強制（`createCurl({dark:true})` 相当）で 12% ±1段（紙 #262A27 での1段）。
  - CS-18：背の近くの姿勢でライト差 0、ダーク強制はいちばん明るい所が背景より +24 まで。
  - `DARK.enabled === false`。
- 完了条件：アプリの動きは何も変わらない（js/curl/ はどこからも import されない）。既存テストは全部通る。

## PR3：ページの絵 painter（③）
- js/curl/painter.js：1日ページ（PR1 の `dayPage`）の絵を canvas 2D で描く（決定 A）。中身は本物のデータ（予定 `occIn`/`dayBlocks`、終日、ノート `noteDateOf`、六曜 `rokuyoOf` と `state.rokuyo`、祝日 `holidayOf` と `state.holidayRed`）。描く位置は **見えている DOM の各行の `getBoundingClientRect`** から読む（見出しの日付・六曜・時刻の列・各予定の枠と文字・終日のピル・つまみ・ノートの罫線と本文）。まだ DOM にない日（めくった先の2日）は、同じ組みの決まり（PR1 の CSS の整数 px）で y を出す（例：画面外に同じ dayPage を一時的に描いて測るのが確実ならそれでよい。body に付けて測り、すぐ外す）。手で足した補正（build-single.py の +1/+0.5）は使わない。canvas の y は `Math.round(y*dpr)/dpr`。`lang='ja'`、字体は DOM と同じ font-family。
- 表は dpr 3（`Math.min(3, devicePixelRatio)` ではなく 3 固定が決定。テストでは引数で変えられる）、裏は dpr 2。前へ＝今の左・次の左・今の右・次の右・裏の5枚、後ろへも5枚（`need(dir)`）。`prepare(dir)` は前の向きの絵を先に `deleteTexture` してから作る。作った枚数・捨てた枚数・バイト数を数える（`stats()`）。日が変わったら使わない絵をすぐ捨てる。
- 紙の色 #FFFDFA、裏は表の左右反転を 16% で透かし罫線 #EEEAE1（式は curl-v1 のシェーダーのまま、色を引数で渡す）。
- この PR でもアプリの操作からはまだめくりを呼ばない（painter を tt の見開きで呼べる口だけ作る）。
- テスト：新設 tests/curl-painter.spec.js（Chromium と WebKit）：tt の見開きで painter の絵（2D canvas を取り出して）と止まっている DOM を 200% で撮り、見出し・時間軸の1行目・予定行・終日・ノートの1行目の y を相関で比べる：0.5pt 超は不合格、0.25pt 超は注意（annotation）。内容の一致（予定 0 件・多い日 +N・終日・複数日の帯・繰り返し・六曜オフ・祝日赤オフ・長い予定名の「…」・ノートあり／なし）。作った枚数と捨てた枚数が合う（向きを変えると前の向きの絵を先に捨てる）。
- 完了条件：アプリの動きは変わらない。

## PR4：組み込み（④）
- js/curl/gesture.js・landing.js・index.js（`createCurl({ root, metrics, pages, onTurn, swipe })`、`cancel()`、`dispose()`）、app.js のつなぎ、css（めくりの canvas は root の外の兄弟要素、`position:fixed`、見開き全体を1枚で覆う、`pointer-events:none`、止まっている間は隠す）。
- めくるのは **開いた横で型が tt、WebGL が使える、視差効果を減らすがオフ** のときだけ。
- 始め方（design/26 §3）：前へは右ページの右端 24（x827〜851、`--right-end`−24〜`--right-end`）。戻りは左ページの左端 24 だが画面の左 20 は端の戻る操作に譲るので x28〜52（`--left-start`+20〜+44）。押した時点で触れた向きの絵を作り始める（pointerdown）。右の辺 24 以内を押したら 0.10 秒で角を上げる（§6.1）。12px 動くまで決めない。縦の方が大きければ縦スクロールにして、最後まで横に乗り換えない。予定の枠（.tlev）・終日のピル・タスクの丸・SWIPE_EXCLUDE の上からは始めない。tt の型では、端の 24 の外の横スワイプでは日を送らない（予定欄のなぞる操作・つかむ操作が先）。
- 離したとき：右ページの真ん中（`(spine+edge)/2`、951 幅で x668.25）より左ならめくり切る、右なら戻る。500pt/秒以上の払いは位置にかかわらずその向き。時間・緩急・透かしの消し方・左端の入れ替え（前へ 0.30 秒・戻り 0.15 秒、隠れない左の端 112pt x8〜120）・§6.11 の着地は curl-v1 のまま。
- 着地（決定 B）：めくり切ると決めた時点で `state.selected` を ±2 日にして `render()`（めくりの canvas の下に本物の次の2日の DOM）。0.15 秒で紙が薄くなると DOM が見え、終わったら canvas を隠す。§6.11-10：0.15 秒の間、前の日の透かしは見えない。
- 取り合い：長押し 350ms で予定のドラッグになるとめくりを `cancel()`（initDirectInput に渡す swipe の cancel でスワイプとめくりの両方を止める）。2本目の指で中止し 0.22 秒で戻す。`pointercancel`（ブラウザが縦を取った）で戻すかまだなら何もしない。つまみ（予定とノートの境）を引いてもめくらない。めくっている間は他のタップを止める。めくっている間に `render()` が走っても canvas は消さない（root の外なので消えない）、日がずれない。
- 幅の変化（vpSchedule で寸法が変わった、回転、閉じた、型を変えた、見開きでなくなった）：めくりを止め（途中なら元に戻す・日は進めない・動きなし）、canvas・網目・テクスチャを全部捨て、次に要るときに作り直す。`visibilitychange` で隠れたら絵を全部捨てる。
- 視差効果を減らす（`prefers-reduced-motion: reduce`）：めくらない。今の見開きの写しを上に置き、下で ±2日、写しを 0.15 秒で薄くする。前へ・戻りを交互に何度でも続けられる（anim を必ず片付ける）。始め方は同じ端 24 の横スワイプ。
- WebGL なし（getContext('webgl') が null）・テクスチャの作成に失敗：めくりの部品を作らず、端に限らず今の横スワイプで ±2日、0.25 秒の横すべり。コンテキスト消失：`preventDefault()`、めくり中なら canvas を隠して元に戻す（離した後なら日だけ進めて DOM を出す）。`webglcontextrestored` で作り直す。1分に2回失敗したらその起動中は横すべりに切り替える。
- ダーク：`DARK.enabled && matchMedia('(prefers-color-scheme: dark)').matches` を見るのは index.js だけ。
- テスト：新設 tests/curl-app.spec.js（Chromium と WebKit）。アプリの中（tt の見開き、951×669・右の帯 84、dpr 2）で：
  - 確認表 1章④の各項目：始める場所（x827〜851 / x28〜52、左 20 では始めない）、境目 x668.25 の前後で進む／戻る、500pt/秒で位置にかかわらず、2日進む／戻る、裏は透かしだけ、予定タップで編集・枠の上から始めない・長押しでドラッグになりめくらない、縦スクロール中にめくらない、つまみを引いてもめくらない、2本目で中止、幅の変化（951→890）で止まり元に戻りテクスチャ 0、視差効果を減らすで交互に6回・毎回2日・canvas は出ない、WebGL なしで横すべり ±2日（0.25 秒）、`WEBGL_lose_context` で消して戻る・日はずれない、DARK.enabled false。
  - CS-15〜18 と §6.11-10 をアプリの中で再確認：CS-15（アプリの寸法 951×669 と 890×626）、CS-16（plain の紙を強制して5姿勢、2階差しきい値超え 0）、根元の影、CS-17（着地の前後で見出し・1行目・ノートの1行目の y が 0.5pt 以内・0.25pt で注意、着地後は DOM なので 0、左端の入れ替えが単調）、§6.11-10（着地 0.15 秒の 25・50・75% で前の日の文字が見えない）、CS-18（背の近くでライト差 0、ダーク強制で +24 まで）。撮影の時を決めるため、index.js はテスト用の口（`window.__duoCurl`：姿勢を置く・時間を止めて進める・状態を読む。アプリの見た目には影響しない）を持ってよい。
  - 既存の swipe.spec.js・direct-input.spec.js・timeline.spec.js・tt-spread.spec.js・open-portrait.spec.js・sw.spec.js も通す（Chromium）。
- 完了条件：tt の開いた横でめくれる。それ以外の型・姿勢の動きは変わらない。

## PR5：実機の計測 `?curlperf=1`（⑤）
- js/curl/perf.js：URL に `curlperf=1` があるときだけ動く（無いときは import しても何もしない・何も出さない）。測るもの：触れてから最初のコマまでの ms（pointerdown → めくりの1コマ目を描き終える。向き付き）、1枚ごとの描く ms と GPU へ送る ms（表の左・表の右・裏）、めくり中の rAF の間隔（p50・p95・p99・最大）、落ちたコマ（間隔 > 1.5×中央値）の割合、長い処理（PerformanceObserver longtask があれば、50ms 超の数）、メモリ（painter の stats のバイト数＋画面 canvas のバイト数、`performance.memory` があればそれも、めくる前・めくり中・向きを変えた直後・終わって捨てた後）、コンテキスト消失の回数、dpr・画面の大きさ・視差効果・ダーク・userAgent。
- 自動のめくり：`?curlperf=1&auto=20` で前へ・戻り各 20 回を指の代わりに動かす（上・真ん中・下の高さを混ぜる）。
- 出し方：画面の隅の小さな札（tt の見開きの外、帯の下など邪魔にならない所）に要約と「JSON をコピー」ボタン、`window.__curlPerf` に全部、`console.log('[curlperf]', JSON)`（Safari の Web インスペクタで取れる）。合否の線（60Hz：p95 18.0ms・p99 33.4ms・落ち 1%・長い処理 0。120Hz の線も並べて出す）を JSON に入れる。
- 実機での手順を design/CURLPERF_V18.md に短く書く（Xcode で入れたアプリで ?curlperf=1 を開く方法：Safari の Web インスペクタで `location.href='capacitor://localhost/?curlperf=1&auto=20'`）。
- テスト：新設 tests/curl-perf.spec.js（Chromium と WebKit）：パラメータなしでは札も __curlPerf も出ない、`?curlperf=1&auto=2` で JSON の形（項目がそろう、数が 0 以上）。速さの数字では合否を決めない。
- 完了条件：パラメータなしのアプリの動きは変わらない。
