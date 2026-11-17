# 共通ルール（第17版、全 PR 共通）

あなたは実装担当です。作業ディレクトリ: /workspace/iphone-duo-calendar/app 。
禁止: git の書き込み操作すべて（commit / stash / reset / checkout / restore / add 等。**特に git stash は絶対禁止**。変更前の挙動を確かめたいときは `git show HEAD:app/js/app.js > /tmp/old.js` のような読み取りだけにする）、公開、秘密情報の取得、課金、API キーの使用、既存データの削除、バンドル ID（com.maskeykim.duocalendar）の変更、`capacitor.config.json` と `ios/App/App/public/` の手編集、/workspace/duo-calendar-team/ と design/IMPL_PLAN_V17.md の編集（読むだけ。資料のファイルを app/ へ写すのは可）。
注意: 資料・計画の行番号は目安。関数名・識別子で探すこと。
正本: design/IMPL_PLAN_V17.md（全文）と、計画が挙げる /workspace/duo-calendar-team/ の資料（design/19-drag-move-and-dated-notes.md、qa/bug-v16-feedback-2026-11-17.md、data/連携_第12弾_ノートの日付.md、design/10・12）。
Swift: 新しい Swift ファイルは作らない（既存 DuoNativePlugin.swift のみ）。Linux では EventKit をビルドできないので `swiftc -parse <file>` で構文を確かめる。JS 側は native.js の偽装でテストする。Info.plist は plistlib 等で構文を確かめる。
既存の画面と機能（3姿勢・B案の帯、4タブ、通知、iPhone 予定の表示・編集・削除、「iPhone にも追加」、削除の確認、ポップアップの閉じ方、タッチ確認、開いた横の月の下端）を回帰させない。担当 PR 以外の範囲に手を広げない。磨き込みは不要、計画の範囲を確実に。既存データ（IndexedDB の予定・カテゴリ・メモ・設定・ノート）を壊さない。予定は1件も消さない。ノートも1件も消さない。既存の機能（カテゴリ移行・設定のカレンダー・通知既定なし・日時入力・六曜・ページ切替・メモ・タスク／リマインダー・ドラッグ入力・コピー貼り付け・ノートのフォルダとピン留め）も回帰させない。
IndexedDB の SCHEMA_VERSION は 5 のまま（版を上げない。索引も足さない）。バックアップの SCHEMA も 5 のまま。
終わったら `npm run test:unit` と、この PR に関係する Playwright の spec だけ（変更・追加した spec と、触った画面の既存 spec。例 `npx playwright test tests/xxx.spec.js tests/sw.spec.js`）を全成功させる。**Playwright の全件（npm test）は回さない**（中断が多いため、全件は指揮役が最後に1回だけ回す）。sw.js の CACHE を1つ上げ、tests/sw.spec.js のキャッシュ名の期待も合わせる。`npm run build:www` を実行。仕様変更で古くなったテストは理由を報告して更新（削除・skip で隠さない）。
報告（日本語・簡潔）: 変更ファイルと要点、JS↔Swift API の変更、テスト件数、計画・資料と違うところ、Xcode で手作業が要る点（なければ「なし」）、実機確認点。
