# V194 進捗
- 09:47 ブランチ v19.4 を ad491f0 から作成。実装担当へ V194_BRIEF.md を渡す
- 09:47 v19.4 実行 1 回目 (sid=new)
- 09:51 段1 済み: js/colors.js（くすみ・mark・墨・前後の月・土日・祝日・+N・フリック 7 色の純関数）＋ test-unit/colors.test.mjs 16 件（設計の calc の値と一致。fixtures/colors36-37.json は scripts/gen-colors-fixture.mjs が書き出す）
- 10:04 段2 済み: 表示への適用（app.js の入口 colorVars・catVar・catSet・calDot・詳細の丸／月のチップ・帯 14pt・左線 2.5×10・時間軸の枠・終日の帯・下の札（塗り＋縁＋墨）・前後の月・土日 案A・+N・日付横の文字 CSS）。ダークは見本だけ（?theme=dark、js/theme-preview.js）。色の見た目を調べる既存 spec の期待値は段5 でまとめて直す（chip-style・layout-metrics・categories・native・closed-month-s1 が落ちる）
- 10:19 段3 済み: 予定ごとの色（colorId は系列の本体だけ・overrides は読まない／iPhone の予定は meta 'xcolors' の表 js/event-colors.js／編集シートの「色」の行と色を選ぶ画面／長押しメニューの「色」と色の帯・元に戻す 6 秒／iPhone 予定の詳細の「色」の行／バックアップ eventColors・checkEventColors・colorId 40 字／消えた判定は連携の回答 5 の 4 条件／linked の予定は externalId で表にも入れる）と Swift hexColor の 0〜1 収め。VERSION・SCHEMA_VERSION は 6 のまま
- 10:19 段4 済み: ついでの直し（バックアップ画面の文言＝段3 のコミットに同梱、tests/helpers.js の削除済み試験名 reminder-sync・reminder-ui。public/js/reminder-sync.js は app/ にも ios の写しにも残っていない＝消すものなし）
