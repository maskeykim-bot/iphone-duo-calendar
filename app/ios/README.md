# iOS (Capacitor) ビルド手順

Mac に Node は不要です（SPM 使用、CocoaPods なし）。

1. `git clone` して `app/ios/App/App.xcodeproj` を Xcode で開く（初回は Swift Package の取得を待つ）。
2. 左のプロジェクト `App` → TARGETS `App` → Signing & Capabilities で Team に個人の Apple ID を選ぶ。
3. 上部のデバイス選択で接続した iPhone（またはシミュレータ）を選び Run (▶)。
4. 実機の場合: iPhone の 設定 > プライバシーとセキュリティ > デベロッパモード を ON（再起動）。
   初回起動時は 設定 > 一般 > VPNとデバイス管理 で自分の Apple ID を「信頼」。

無料の個人チームでは署名が 7 日で切れるので、期限後は Xcode から再度 Run してください。

## Web を更新したとき

Linux 側（Node あり）で `app/` にて `npm run ios` を実行し、`app/ios/App/App/public` などの変更をコミットします。
アイコンを変える場合は `npm run icons` の後に `npm run ios`。

## iPhone カレンダー連携（第7版）

「…」メニュー → 「iPhone カレンダー連携」で、iPhone のカレンダー（EventKit）の予定を Duo に読み取り専用で混在表示し、
新規予定を iPhone のカレンダーにも追加できます。Web 版（PWA）には出ません。

- 実装: `App/DuoNativePlugin.swift`（プラグイン本体）と `App/MainViewController.swift`（`capacitorDidLoad` で登録）。
  Main.storyboard の viewController は `MainViewController`（module `App`）。2 ファイルは `App.xcodeproj` に登録済みです。
- 許可: `Info.plist` の `NSCalendarsFullAccessUsageDescription`（iOS 17 以降）／`NSCalendarsUsageDescription`（iOS 16 以前）／
  `NSCalendarsWriteOnlyAccessUsageDescription`。予定の表示には**フルアクセス**が必要で、「書き込みのみ」では表示できません。
- 一度「許可しない」にすると OS は再度ダイアログを出しません。設定 ＞ プライバシーとセキュリティ ＞ カレンダー ＞ Duo で
  「フルアクセス」に変更してください（アプリ内の「設定を開く」から移動できます）。
- Google カレンダーは、iPhone の「設定 ＞ カレンダー ＞ アカウント」に Google を追加すると表示されます（Duo から Google には直接接続しません）。
- デプロイメントターゲットは iOS 15。iOS 17 以降は `requestFullAccessToEvents`、それ未満は `requestAccess(to:)` を使います。
- バックアップ（JSON）には iPhone の予定・連携設定・連携情報は含まれません。書き出しは共有シート（shareFile）で行います。
- 実機で必ず確認: 許可ダイアログの文言、カレンダーで開く（`calshow:` は日付表示のみ）、終日予定の追加（最終日の扱い）、
  共有シート（iPad ではポップオーバー）、キーボード表示中のシート位置（`npm run ios` で `public/` を更新してからビルド）。
