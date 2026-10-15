# 子どもへの伝言板 v1 設計レビュー（Claude）
対象: docs/KIDS_MESSAGES_SPEC.md（3a3a8fa）／ 更新: 2026-10-15 ／ 未実装・main と本番Firebaseは変更しない

全体として方向は良い。特に「タブレットに親のGoogleアカウントを入れない」「完了チェックはサーバーに送らない」「子ども端末に買い物・予定の権限を与えない」は正しい判断で、そのまま採用する。
以下は、実装前に直したい点・決めたい点。

---

## 0. 結論（要点）

| # | 指摘 | 重要度 |
|---|---|---|
| A | 子どもの ID は既存の `child1/child2/child3` を使う。設計書の `'itsuki'|'atsu'|'yui'` は名前の読みを公開リポジトリに載せることになり、予定機能とも食い違う | 高 |
| B | `kids.html` は **名前付きの Firebase アプリ**（`initializeApp(config, 'kids')`）で初期化する。同じサイト内で匿名ログインすると、そのタブレットの `app.html` のログインを上書きしてしまうため | 高 |
| C | 端末の登録は「タブレットに出る6桁の番号を、親がスマホで入力して許可する」方式にする（UIDの手入力や一覧からの選択はさせない） | 高 |
| D | 対象は `target`（1人 or all）ではなく `targets`（配列・1〜3人）にする。「子ども1と2だけ」に対応でき、ルールでも検査しやすい | 中 |
| E | 「今日だけ」に加えて「明日だけ」を用意する。前の晩に翌朝の伝言を入れる使い方が多いはず | 中 |
| F | 完了チェックのキーに伝言の版（`updatedAt`）を含める。親が文面を直したら、チェックは外れる | 中 |
| G | 「平日だけ」は祝日・長期休みを判定できない。v1 は「お休みモード（全伝言を一時停止）」で対応し、祝日の自動判定はしない | 中 |
| H | 公開リポジトリに子どもの名前がすでに入っている。表示名を Firestore に移すかを決める（下の §6） | 要判断 |

無料運用：匿名ログイン・Firestore ルール・GitHub Pages だけで実現でき、Cloud Functions は不要。Spark プランのまま運用できる。**Identity Platform へのアップグレードはしない**（すると月間ユーザー数による課金の対象になる）。

---

## 1. 現行アプリとの統合方法

### 方針
- 親の画面は **`app.html` の中に追加**する（ログイン・オフライン保存・同期表示をそのまま使える。別ページにすると2回ログインが必要になる）。
- 子どもの画面は **別ページ `kids.html`**。`app.html` のコードは読み込まない（買い物・予定のコードがタブレットに届かない）。
- 「どの伝言を、いつ、誰に出すか」の判定は **`lib/kid-notices.js`（画面に依存しない関数）** にまとめ、親画面とタブレットで共用する。単体テストで仕様を固定する（予定機能の `lib/schedule-views.js` と同じやり方）。
- 子どもの ID と色は既存の `MEMBERS`（`lib/schedule-views.js`）の `child1〜3` を使う。

### 同じサイト上に置くときの注意（指摘 B）
GitHub Pages では `app.html` と `kids.html` が同じサイト（オリジン）になる。Firebase のログイン状態はサイトごと・アプリ名ごとに保存されるため、両方が既定のアプリ名を使うと：
- タブレットで `kids.html` が匿名ログイン → 同じタブレットの `app.html` も匿名ユーザーになる
- 逆に誰かがタブレットで `app.html` に Google ログイン → `kids.html` が親アカウントで動く

対策：
1. `kids.html` は `initializeApp(firebaseConfig, 'kids')` で初期化し、ログイン状態を `app.html` と分ける。
2. `kids.html` は、匿名ユーザー以外でログインしていたら表示を止めて案内を出す（念のため）。
3. タブレットのホーム画面用に `kids.webmanifest`（`start_url: kids.html`）を別に用意する。

### 読み込み量（無料枠）
- タブレットは `kidNotices` を1つのリスナーで購読し、今日・朝夕・子どもの絞り込みは端末側で行う。伝言は多くても数十件なので、1日の読み取りは数十〜数百件。Spark の上限（1日 5万件）に対して十分小さい。
- 過去の「今日だけ／明日だけ」は親の画面を開いたときに7日より古いものを削除し、件数が増え続けないようにする（新しいデータの掃除だけで、既存の買い物・予定データには触れない）。

---

## 2. 画面構成の提案

### 親（スマホ・`app.html`）
- 下のタブに **「伝言」** を追加（今日／予定／伝言／家族 の4つ）。毎日使う機能なので家族タブの奥には置かない。
- 「伝言」タブ
  - 上部：`今日｜明日` と `朝｜夕方` の切り替え（初期値は時刻で自動：13時より前は今日の朝、後は明日の朝…は使いながら調整）
  - 本文：子ども3人ごとに、その日に出る伝言の一覧（タブレットと同じ並び）。押すと編集
  - 「＋ 伝言を追加」→ 下から出るシート
    - 定型文のボタン（押すと文面に入る。よく使う順）
    - 文面（1〜120文字）
    - 誰に：子ども1〜3（複数選べる）＋「3人とも」
    - 朝／夕方
    - 繰り返し：毎日／平日だけ／今日だけ／明日だけ
    - 「定型文として保存」チェック
  - 「定型文を編集」：一覧・並べ替え・削除
  - 「お休みモード」（全伝言を一時停止。長期休み・祝日用）
- 「家族」タブ（管理者だけ表示）：**子ども用タブレット** の一覧・登録・解除（§3）

### 子ども（家のタブレット・`kids.html`）
- 上部：大きな日付と曜日、`あさ｜ゆうがた` の大きな切り替え（時刻で自動、手でも切り替え可）
- 本文：**子ども3人の3列**（それぞれの色の見出し）。タブレット縦（幅768px）でも3列、スマホでは縦に並べる
- 伝言カード：大きな文字（20px以上）＋右に「できた！」ボタン（高さ64px以上）。押すとスタンプ表示、もう一度押すと取り消し
- 全部できたら列の上に「ぜんぶできた！」
- 画面にリンク・メニュー・買い物・予定は一切出さない
- 状態表示：「さいごに うけとった じかん」（オフライン時に古い内容か分かるように）
- 登録前／解除後は、登録用の6桁番号の画面だけを出す（§3）
- 端末の固定は端末の機能を使う：iPad＝アクセスガイド、Android＝アプリ固定。手順を案内に書く

---

## 3. タブレットの安全な登録方法（指摘 C）

設計書の「匿名ログイン＋親が `kidDevices/<uid>` に許可」を採用し、**UID を人が扱わない**流れにする。

1. タブレットで `kids.html` を開く → 匿名ログイン → ランダムな6桁番号を作り、`kidPairRequests/{自分のuid}` に `{code, createdAt}` を書く → 画面に大きく番号を表示
2. 親（管理者）がスマホの「家族」タブ →「子ども用タブレットを登録」→ **タブレットに出ている番号を入力**、名前（例：リビングのタブレット）を入力
3. アプリは「10分以内に作られ、番号が一致する申請」を探す。**ちょうど1件**のときだけ `kidDevices/{uid}` を作り、申請を削除
4. タブレットは自分の `kidDevices/{uid}` を見ていて、作られたら伝言画面に切り替わる

安全面の考え方
- 申請一覧から選ばせないので、他人が作った申請を誤って許可しない（番号を知っているのはタブレットの前にいる人だけ）
- 番号は10分で無効。0件・2件以上なら登録しない
- 匿名ログインは誰でもできる（APIキーは公開情報）。そのため **ルールで「匿名でログインしているだけ」の人には何も見せない**。読めるのは「親が登録した端末」だけ
- 解除は管理者が `kidDevices/{uid}` を削除するだけ。タブレットは権限エラーを受けて登録画面に戻る
- タブレットのデータ消去で UID が変わったら、もう一度登録（設計書どおり）。iPad はホーム画面に追加して使うと保存が消えにくい
- UID・端末名を GitHub に載せない（Firestore だけに保存）

登録できる人：v1 は **管理者のみ**（名簿の追加と同じ）を推奨。配偶者も登録できるようにするかは要判断。

---

## 4. Firestore ルールの変更案

既存の `match` ブロックは一切変えず、**新しいブロックを追加するだけ**にする。既存の `member()` は匿名ユーザーに対して `email` が無いので必ず false になり、`owner()` も UID が違うので false。つまり **匿名端末は既存のコレクションに何もできない**（テストで確認する）。

```
    function anonUser() {
      return request.auth != null
        && request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
    function kidDevice() {
      return anonUser()
        && exists(/databases/$(database)/documents/kidDevices/$(request.auth.uid));
    }
    function validKidTargets(t) {
      return t is list && t.size() >= 1 && t.size() <= 3
        && t.hasOnly(['child1', 'child2', 'child3']);
    }
    function validKidText(s) {
      return s is string && s.size() > 0 && s.size() <= 120;
    }
    // 伝言（配信用）：読むのは家族と登録済みタブレット、書くのは家族だけ
    match /kidNotices/{noticeId} {
      allow read: if family() || kidDevice();
      allow delete: if family();
      allow create, update: if family()
        && request.resource.data.keys().hasAll(['text', 'targets', 'period', 'repeat', 'onDate', 'active', 'updatedAt'])
        && request.resource.data.keys().hasOnly(['text', 'targets', 'period', 'repeat', 'onDate', 'active', 'updatedAt'])
        && validKidText(request.resource.data.text)
        && validKidTargets(request.resource.data.targets)
        && request.resource.data.period in ['morning', 'evening']
        && request.resource.data.repeat in ['daily', 'weekdays', 'once']
        && (request.resource.data.repeat == 'once'
              ? request.resource.data.onDate.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
              : request.resource.data.onDate == '')
        && request.resource.data.active is bool
        && request.resource.data.updatedAt == request.time;
    }
    // 定型文：家族だけ（タブレットは読めない）
    match /kidTemplates/{templateId} {
      allow read, delete: if family();
      allow create, update: if family()
        && request.resource.data.keys().hasOnly(['text', 'order'])
        && validKidText(request.resource.data.text)
        && request.resource.data.order is int;
    }
    // お休みモードなどの設定（1件だけ）
    match /kidSettings/board {
      allow read: if family() || kidDevice();
      allow write: if family()
        && request.resource.data.keys().hasOnly(['paused'])
        && request.resource.data.paused is bool;
    }
    // 登録済みタブレット：作る・消すのは管理者だけ。タブレットは自分の分だけ読める
    match /kidDevices/{deviceUid} {
      allow read: if family() || (anonUser() && request.auth.uid == deviceUid);
      allow create, update: if owner()
        && request.resource.data.keys().hasOnly(['label', 'addedAt'])
        && request.resource.data.label is string
        && request.resource.data.label.size() > 0 && request.resource.data.label.size() <= 20
        && request.resource.data.addedAt == request.time;
      allow delete: if owner();
    }
    // 登録の申請：タブレットが自分の分だけ作る。管理者が読んで消す
    match /kidPairRequests/{deviceUid} {
      allow create: if anonUser() && request.auth.uid == deviceUid
        && request.resource.data.keys().hasOnly(['code', 'createdAt'])
        && request.resource.data.code is string
        && request.resource.data.code.matches('^[0-9]{6}$')
        && request.resource.data.createdAt == request.time;
      allow read: if owner() || (anonUser() && request.auth.uid == deviceUid);
      allow delete: if owner() || (anonUser() && request.auth.uid == deviceUid);
    }
```

設計書からの変更点
- `target` → `targets`（配列）、`frequency` → `repeat`、`text` は 1〜120 文字（設計書どおり）
- 「明日だけ」は `repeat: 'once'` ＋ `onDate: 明日の日付` で表せるので、データの形は増えない
- `updatedAt` はサーバー時刻（`serverTimestamp()`）に固定し、端末の時計のずれを持ち込まない
- 定型文はタブレットから読めない（不要な情報を渡さない）

反映方法：`firestore.rules` と `setup.html` のルール生成部に同じブロックを追加し、管理者が setup.html から1回コピーして貼り付ける（子どもの予定のときと同じ手順）。**Firebase コンソールで匿名ログインを有効にする**操作も管理者に1回お願いする（Authentication → ログイン方法 → 匿名）。

---

## 5. テスト計画

### ルール（エミュレーター・CI）
`env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })` で匿名端末を再現する。

| 誰が | kidNotices 読 | kidNotices 書 | kidTemplates | kidDevices | 買い物・予定・名簿 |
|---|---|---|---|---|---|
| 未ログイン | × | × | × | × | × |
| 匿名（未登録） | × | × | × | 自分の分だけ読める（存在しない） | × |
| 匿名（登録済み） | ○ | × | × | 自分の分だけ読める | **×（全部）** |
| 匿名（解除後） | × | × | × | × | × |
| 名簿の配偶者 | ○ | ○ | ○ | 読める・作れない | ○（今まで通り） |
| 管理者 | ○ | ○ | ○ | 作る・消す | ○（今まで通り） |
| 名簿外の Google | × | × | × | × | × |

ほかに：申請は自分の UID の分だけ作れる・他人の申請は読めない・番号の形式違いは拒否・`targets` に child4 や空配列は拒否・121文字は拒否・`updatedAt` が端末時刻なら拒否、既存の10件のルールテストがそのまま通ること。

### 判定ロジック（単体テスト・`lib/kid-notices.js`）
- 毎日／平日だけ（土日は出ない）／今日だけ／明日だけ、朝・夕方、対象1人・複数・3人とも
- お休みモード中は何も出ない、`active: false` は出ない
- 日付が変わるとチェックが全部外れる（キーに日付）、文面を直すとそのチェックだけ外れる（キーに版）
- 古い日付のチェックは自動で掃除

### 画面（偽の Firebase・Playwright）
- 偽の Firebase に匿名ログインと上のルールを追加
- タブレット：未登録→6桁番号が出る→親が登録→伝言画面に切り替わる→解除で番号画面に戻る
- 3人分が同時に出る、朝夕切り替え、できた！→再読み込みしても残る→**Firestore に書き込みが1件も起きない**ことを確認
- 親が伝言を変えるとタブレットに反映される
- 親画面：追加・定型文・編集・削除・お休みモード、管理者以外には端末登録が出ない
- 端末サイズ：iPad 縦横・Android タブレット・iPhone SE・PC。オフラインでも最後の内容が出る
- 既存の全テスト（画面304件・処理74件・ルール10件・公開サイト32件）が通ること

---

## 6. 既存アプリへの影響

| 項目 | 影響 |
|---|---|
| 買い物・予定・名簿のデータ | 変更なし（新しいコレクションを追加するだけ） |
| 既存のルール | 変更なし（ブロックの追加だけ）。ただし貼り替えは1回必要 |
| 匿名ログインの有効化 | 既存のルールは匿名を通さないので、買い物・予定は守られる（テストで確認） |
| `app.html` | タブ1つと「家族」タブの端末管理を追加。既存の画面は変えない |
| 従来版（shared.html など） | 変更なし |
| 無料枠 | 読み取り・書き込みとも1日数百件程度の増加 |
| **公開リポジトリの子どもの名前** | すでに `app.html` などに子どもの名前が入っている（予定機能で追加済み）。名前（漢字1文字）だけで、住所・学校などは無い。気になる場合は、表示名を Firestore の設定（家族だけ読める）に移し、コードには child1〜3 だけを残すことができる。伝言板でも同じ名前を使うので、**移すなら伝言板の前に行うのがよい** |

---

## 7. 決めてほしいこと

1. タブレットを登録できるのは管理者だけでよいか（推奨：管理者だけ）
2. 「明日だけ」を追加してよいか（推奨：追加）
3. 子どもの名前をコードから外して Firestore に移すか（推奨：移す。作業は小さい）
4. 「平日だけ」は祝日も出る。v1 はお休みモードで手動停止とする（推奨）でよいか

## 8. 進め方（案）
1. このレビューの合意（ユーザー・ChatGPT）
2. 別ブランチで `lib/kid-notices.js`＋単体テスト → `kids.html` → 親画面 → ルール（エミュレーター）。すべて偽の Firebase と CI で確認
3. ユーザーが、匿名ログインの有効化とルールの貼り替えを1回行う
4. 確認が取れたら main に反映（`kids.html` は新しいファイルなので既存ページに影響しない。親画面の「伝言」タブはここで初めて表示）→ タブレットの実機確認
