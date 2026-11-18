# 実機の計測 `?curlperf=1`（第18版 PR5）

ページめくりの速さを実機（iPhone Duo 構成の iPad/iPhone）で測る。箱（GPU なし）の数字は参考にならない。

## 開き方
1. Xcode で入れたアプリを実機で起動し、Mac の Safari →「開発」→ 実機 → アプリの Web インスペクタを開く。
2. コンソールで次を実行（アプリが読み込み直される）：
   `location.href='capacitor://localhost/?curlperf=1&auto=20'`
   - `?curlperf=1` だけ：自分の指でめくって測る。
   - `&auto=20`：前へ・戻り各 20 回を指の代わりに自動で動かす（上・真ん中・下の高さを混ぜる）。
3. 開いた横・型「今日＋明日」にしておく（見開きが出るまで自動のめくりは待つ）。
4. 終わると画面の下中央の札に要約が出る。**「JSON をコピー」** を押して貼り付ける。
   Web インスペクタなら `window.__curlPerf`、または console の `[curlperf]` の行でも取れる。
5. 通常のアプリに戻すには `location.href='capacitor://localhost/'`。パラメータなしでは札も計測も出ない。

## 見るもの（JSON）
- `firstFrameMs`：触れてから1コマ目を GPU まで描き終えるまで（向き別）。
- `textures.byKind`：表の左・表の右・裏の 描く ms（paintMs）と GPU へ送る ms（uploadMs）。
- `frames`：めくり中の rAF の間隔 p50/p95/p99/max、`dropRate`（間隔 > 1.5×中央値）。
- `longTasks`：50ms 超の長い処理の数（PerformanceObserver が無い端末では `supported:false`）。
- `memory.phases`：めくる前・めくり中・向きを変えた直後・終わって捨てた後（painter＋画面 canvas のバイト、あれば JS ヒープ）。`estimate` は見積もり 58.1MB（高さ 603）。
- `contextLost`：WebGL コンテキスト消失の回数。
- `env`：dpr・画面の大きさ・視差効果を減らす・ダーク・userAgent。

## 合否の線（`lines`・`verdict`）
| | p95 | p99 | 落ちたコマ | 長い処理 |
|---|---|---|---|---|
| 60Hz | 18.0ms | 33.4ms | 1% | 0 |
| 120Hz | 9.5ms | 16.7ms | 2% | 0 |

120Hz の線は連携 第15弾 9.1 の値（WKWebView の rAF が 60 近くに抑えられない場合に見る）。`verdict.hz60.ok` / `hz120.ok` を見る。
