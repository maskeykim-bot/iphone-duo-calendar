# V194 進捗
- 09:47 ブランチ v19.4 を ad491f0 から作成。実装担当へ V194_BRIEF.md を渡す
- 09:47 v19.4 実行 1 回目 (sid=new)
- 09:51 段1 済み: js/colors.js（くすみ・mark・墨・前後の月・土日・祝日・+N・フリック 7 色の純関数）＋ test-unit/colors.test.mjs 16 件（設計の calc の値と一致。fixtures/colors36-37.json は scripts/gen-colors-fixture.mjs が書き出す）
- 10:04 段2 済み: 表示への適用（app.js の入口 colorVars・catVar・catSet・calDot・詳細の丸／月のチップ・帯 14pt・左線 2.5×10・時間軸の枠・終日の帯・下の札（塗り＋縁＋墨）・前後の月・土日 案A・+N・日付横の文字 CSS）。ダークは見本だけ（?theme=dark、js/theme-preview.js）。色の見た目を調べる既存 spec の期待値は段5 でまとめて直す（chip-style・layout-metrics・categories・native・closed-month-s1 が落ちる）
