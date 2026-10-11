# 夫婦共有の接続準備

現在公開中の index.html は端末内保存版です。Firebase共有は**まだ有効になっていません**。

Firebase project: `family-shopping-app-841c5`（画面で確認できたID）
Database: `(default)`
Location: Tokyo (`asia-northeast1`)
Authentication: Google 有効化済み
Hosting: GitHub Pages

## 安全な作業順
1. Firebase Console で Firestore の作成を完了（本番環境モード・バックアップなし）。
2. Project Settings > 全般 > マイアプリから Web アプリを登録する。表示される Web SDK configuration を使う（API key はクライアント用の識別設定であり、秘密のサービスアカウント鍵と異なる）。
3. Authentication > 設定 > 承認済みドメインに `6p5ts2kb5b-cyber.github.io` を追加する。
4. Auth で両者がログインできるようにし、それぞれの Firebase Auth UID をコンソール内で把握する。UIDをGitHub・公開チャットには書かない。
5. Firestore ルールを**本人と配偶者の UID だけが許可されるルール**にコンソール上で変更する。ログインしている全員を許可するルールは使わない。
6. Firebase SDK と Firestore の実装を index.html に統合し、公開前にルールテスト、2端末同期テストを行う。既存localStorageのデータを勝手に消さない。

現時点の `firestore.rules` は全アクセス拒否の安全な雛形です。実際のUIDを入れたルールは、公開リポジトリにコミットせずFirebase Consoleで直接設定する必要があります。
