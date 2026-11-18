# iOS 本来のめくり（B）1段目の試作

作成：2026-11-18（日本時間）。正本は duo-calendar-team の data/連携_第18弾_ネイティブめくりの呼び出し.md（1段目の列）、design/31-native-curl-B.md、qa/verify-curl-native-compare.md。

## 切り替え
- 設定 › 詳細「めくりの方式（試作）」：今のめくり（A、既定）｜iOS のめくり（B）。
- 保存は localStorage `duo-curl-engine`（'web'｜'native'。`?ns=` のときは `.ns` を付ける）。`duo.ui.v1`・IndexedDB・バックアップには入れない。版は変えない。
- B にならないとき：Web 版／DuoNative が古い（`curlCaps` がない・version < 2）／視差効果を減らす（A と同じ 0.15 秒の入れ替え）／この起動で B が失敗した（その1回は入れ替えで進み、以後 A）。

## 動き（1段目。18.3 に合わせた版、DuoNative version 2）
1. 触れた瞬間（canStart が通った pointerdown）：`prepareCurl` で右ページ全体 x485.5〜851（fwd）と左ページ全体 x8〜465.5（back）を `WKWebView.takeSnapshot` で撮る（y は py0〜py1）。
   キー（rev）＝描き直し番号＋時間軸・予定欄・ノートのスクロール位置＋分＋範囲。同じなら撮らない（ネイティブ側でも使い回す）。
2. 横に動かしている間：紙は指に付かない。めくる紙の外の端（進む x851、戻る x8）の内側に陰の帯（幅＝動き÷4、最大 24pt、濃さ 0→8%、18.2 の境目を越えたら 12%、0.1 秒）。
3. 離したとき：18.2 と同じ判定（judgeDone・速い払い）。めくらないなら帯を 0.15 秒で消して終わり。
4. めくるなら：帯を消す → `turnPage{dir, rev, rect, cover}`。ネイティブは紙（めくるページ全体の絵）を UIPageViewController に、動かない側（進む＝左、戻る＝右）を撮ってある絵の覆いに載せて、画面を止める（curlShown）。
5. 決定 F：Web は日を進めず、painter（A の 18.2 の描き方）で着地先のページ（進む＝次の左 D+2、戻る＝次の右 D−1）を覆いの下の同じ位置に「保存しない仮の表示」で出す → rAF 2回 → `backReady{rect}`。ネイティブがその矩形を撮る（backShot・backMs）。
   1段目は isDoubleSided=false（iOS 標準の透け）なので、撮った裏の絵は記録だけ（2段目で紙の裏に貼る）。
6. 仮の表示を外し、本物の DOM を ±2 日に → rAF 2回 → `webReady`。ネイティブは1コマ待ってから `setViewControllers(animated: true)` でめくる。次のページは透明（下の本物の DOM が透けて見える）。
7. めくり終わり：紙と覆いを 0.15 秒で薄くして外す。下はもう着地後の本物のページ（日付の頭・時刻の目盛りまで全部）。左の帯だけの入れ替えはしない。
- 途中でやめた（閉じた・裏に回った・寸法が変わった）とき：仮の表示を外し、ネイティブの紙と覆いを外すだけ。日・選んだ日・保存は変わらない（onTurn は backShot の後）。
- 1段目でできないこと：めくりの途中で紙の幅を 365.5→457.5 に広げること、着地の傾き 0（UIPageViewController に手段がない）。CB-1・CB-3 は記録だけ（連携 第18弾 3.1）。
- 次のページを「もう1回撮る」形は localStorage `duo-curl-next`＝'snap' で選べる（隠し設定）。シミュレータでは撮った絵が古いまま（めくる前の中身）になったので、既定は透明。

## 計測
- `webReady` の戻り値の `perf`（めくっている間の CADisplayLink の間隔：hz・n・p50/p95/p99・max・落ち・durMs・snapMs・backMs）。`window.__duoCurlNative.perf` にためる。`?curlperf=1` なら console に `[curlperf-native]`。
- os_signpost：subsystem `com.maskeykim.duocalendar`、category `curl`、区間 "snapshot"・"back"・"curl"（Instruments の Points of Interest／Animation Hitches）。1段目は iOS が描くので Instruments の数字が正。
- Info.plist に `CADisableMinimumFrameDurationOnPhone`＝true を入れた。A の前後比較は、この版（後）と 170064c（前）で `?curlperf=1&auto=20`（今のめくりにしてから）。

## 確認用（Debug ビルドのみ）
- 起動引数 `-DuoEvalJS "<js>"`（`-DuoEvalDelay 秒`）で起動後に JS を1回実行、`-DuoSlowAnim 0.1` でアニメーションを遅くする。`__duoCurl.nativeTurn('forward'|'backward')` で指なしで1回めくる。
