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
