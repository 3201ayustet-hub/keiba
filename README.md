# HORSE BET BATTLE - Supabase共有版

GitHub Pages + Supabaseで、ログインなしに複数端末から同じデータを閲覧・編集する静的Webアプリです。

## ファイル

- `index.html`
- `app.js`
- `style.css`
- `config.js`
- `supabase-setup.sql`
- `README.md`

ZIP展開後、すべて同じ階層へ配置してください。

## 導入手順

1. SupabaseのSQL Editorで `supabase-setup.sql` 全文を実行します。
2. Supabase Dashboardで Project URL と Publishable Key を取得します。
3. `config.js` の2か所を置き換えます。
4. 全ファイルをGitHub Pagesの公開対象ブランチへアップロードします。
5. GitHub PagesのURLを複数端末で開き、同じデータが表示されることを確認します。

## 重要

- `secret` または `service_role` キーは使用しないでください。
- 認証なしのため、URLを知る人は全データを閲覧・編集できます。
- 同時編集は「最後に保存された内容」が優先されます。
- 旧ローカル版のデータがあり、Supabase側が空の場合、初回アクセス時に移行確認が表示されます。

## 自己チェック項目

- JavaScript構文確認
- ZIP直下の1階層構成
- GitHub Pages向け相対パス
- Supabase未設定時の案内表示
- 勝負、参加者、レース、入力内容の共有保存
- Realtimeによる別端末更新の反映
- 参加者数表示から分母8を削除
- 最大8人の登録制限は維持
- 通常3,000円、5,000円権使用時5,000円の入力制御
