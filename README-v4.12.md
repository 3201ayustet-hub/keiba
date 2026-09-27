# 馬券勝負ボード v4.12

## v4.12 変更点
- ホーム画面追加用のアプリアイコンを正式対応。
- `apple-touch-icon.png` を追加し、iPhone/iPadの「ホーム画面に追加」でアイコンを表示。
- `site.webmanifest` を追加・更新し、PWA対応ブラウザでもアプリアイコンとアプリ名を使用。
- 32px / 192px / 512px / 1024px のアイコンを同梱。
- iOS向け `apple-mobile-web-app-capable` / `apple-mobile-web-app-title` / ステータスバー設定を追加。
- CSS / JS / config のキャッシュバスターを v4.12 に更新。

## GitHub Pagesへの配置
ZIPを解凍し、中身をGitHub Pagesで公開しているリポジトリのルートへ配置してください。
既存ファイルを置き換える場合は、`index.html`、`site.webmanifest`、アイコン5ファイルを必ず更新してください。

## iPhoneでの追加
Safariで公開URLを開く → 共有 → 「ホーム画面に追加」。
今回の `apple-touch-icon.png` がホーム画面アイコンとして使用されます。

※ホーム画面追加はSafari/iOS側の機能です。HTTPSで公開されたGitHub Pages URLで使用してください。
