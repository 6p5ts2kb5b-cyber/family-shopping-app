# 家族2人限定 Firestoreルール（コンソールでのみ設定）

**重要：このファイル内のダミーUIDを実際のUIDに置き換えてGitHubへアップロードしないでください。**
Firebase Console > Firestore > ルールの画面で、以下を貼り付けて、`UID_OF_PERSON_1` と `UID_OF_PERSON_2` だけを本人・配偶者の Firebase Authentication UID に置換し、公開してください。
本物の UID や Google メールアドレスはチャットに送信する必要はありません。

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function family() {
      return request.auth != null &&
        request.auth.uid in ['UID_OF_PERSON_1', 'UID_OF_PERSON_2'];
    }
    match /shoppingItems/{itemId} {
      allow read, delete: if family();
      allow create, update: if family()
        && request.resource.data.keys().hasOnly(['name','quantity','done','createdAt','doneAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 60
        && request.resource.data.quantity is int
        && request.resource.data.quantity >= 1
        && request.resource.data.quantity <= 999
        && request.resource.data.done is bool;
    }
    match /shoppingFavorites/{itemId} {
      allow read, delete: if family();
      allow create, update: if family()
        && request.resource.data.keys().hasOnly(['name'])
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 60;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 設定の順番
1. GitHub公開サイトの共有版 `shared.html` に本人がGoogleログイン。
2. Firebase Console > Authentication > ユーザー で本人のUIDを確認。続けて配偶者もログインし、配偶者のUIDを確認。**UIDはコンソール内のみで取り扱う**。
3. Firestoreルールで2件を置換して公開する（上のコード）。
4. 共有版を2人の端末で開き、追加・数量変更・購入済み・お気に入りの同期と、未許可アカウントでアクセスが拒否されることを確認。

ログイン直後はFirestoreアクセス拒否エラーが表示されるのが正常です。ルール設定後、ページを再読み込みしてください。

※ 現在の端末内保存版のリストとお気に入りは自動的に共有版へ移されません。データ損失を防ぐため、手動移行か確認つき移行は後から実装します。
