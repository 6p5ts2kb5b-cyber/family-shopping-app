# わが家のメモ — App Store公開準備 v0.1
更新: 2026-10-17。**準備専用ブランチ**。main・本番Firebase・既存の家族データを変更しない。

## 公開方針
- 原則 **アプリ1本・無料ダウンロード・有料機能をアプリ内課金でアンロック**。無料/有料の2つの別アプリは原則作らない（利用者・レビュー・データ移行の混乱防止）。料金は未決定、購入は本番有効化前に本人承認。
- 無料版候補: 買い物リスト、家族予定の基礎、画像共有。家族の招待は無料版にも必要。
- 有料版候補: 子ども別伝言、繰り返し・休日設定、テンプレート・高度な共有。課金済み権限のサーバー側検証ができるまでロック解除を実装しない。
- 価格と無料・有料の境界は仮案。最終決定前に利用者テストする。
- 個人向けGitHub Pagesのまま有料アプリのバックエンドとして運用しない。商用ホスティング/規約に適合する配信先を選定。

## 絶対条件
1. 既存の家族専用 `family-shopping-app-841c5`、Firestore、Auth、Webサイトを一般利用者と共有しない。
2. 公開版のFirebaseは**別プロジェクト**。初期状態でどの家庭のデータにもアクセスできないデフォルト拒否のFirestoreルール。
3. 管理者の固定UID、固定のfamilyMembersメール名簿、共有グローバルコレクションを公開版に流用しない。
4. **公開GitHub内の氏名・メール・実データ・トークンを公開版に混入させない**。既存の公開コミット履歴の情報も棚卸しする。
5. 学校・子ども・保護者の個人情報を外部AI/APIに送信しない。
6. 自動的な有料契約、課金プランへの切替、Developer登録、審査提出、一般公開は本人承認後。

## 公開版データモデル案
- `users/{uid}`: プロフィール(最小限)、所属するfamilyIds (クライアント任せにしない)
- `families/{familyId}`: ownerUid、設定、作成日時
- `families/{familyId}/members/{uid}`: role(owner|editor|viewer)、inviteAcceptedAt
- `families/{familyId}/shoppingItems/{id}`
- `families/{familyId}/shoppingFavorites/{id}`
- `families/{familyId}/schedules/{id}`
- `families/{familyId}/kidNotices/{id}`、`kidTemplates`、`kidSettings`
- `families/{familyId}/kidDevices/{uid}`、`kidPairRequests/{uid}`
- 家族を跨いだパスにアクセスする操作は**サーバー側ルールで拒否**。クライアント入力の familyId だけで閲覧を許可しない。
- 招待・権限変更・アカウント削除は監査可能な仕組みにする。

## 出荷前の必須工程
1. 全データアクセスを家族スコープへ移行し、別家庭の読書/書込/購読を拒否するエミュレーターテスト。
2. 招待、退出、オーナー譲渡、最終オーナー保護、家庭削除、アカウント削除。
3. Sign in with Appleの検討・実装（Googleログインを提供する場合のApple 4.8に対応）。
4. iOSネイティブ化（Capacitor等を検討）。単なるWebViewの再包装ではないiOS固有の価値、通知/オフライン/共有などを実装検討。
5. Privacy Policy、利用規約、サポート連絡先、収集データ開示、子ども利用時の注意、App Storeスクリーンショット。
6. In-App PurchaseはApp Store Connectの正式商品ID、StoreKit、レシート/権限の改ざん防止検証、購入の復元を実装・Sandboxで確認。
7. TestFlightで家庭間のアクセス隔離、課金復元、アカウント削除、iPad/iPhone、ネット切断を実機検証。
8. App Store Connect契約/税務/銀行口座/審査提出（本人の同意・本人操作が必要な箇所）。
9. リリース後はFirebase使用量上限・警告・費用監視。Spark枠超過時の利用制限をUIでも説明。

## AppleとFirebase参考
- Apple Review: https://developer.apple.com/jp/app-store/review/guidelines/
- Apple Developer登録: https://developer.apple.com/jp/help/account/membership/program-enrollment/
- Appleアカウント削除: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
- Firestore無料枠: https://firebase.google.com/docs/firestore/pricing

## この段階の完了条件
- 設計・費用・審査・データ分離の課題一覧作成済み
- **一般向けアプリは未実装、App Store未申請**。次は設計レビュー後に別Firebaseプロジェクトを準備。
