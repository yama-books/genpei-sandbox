# GitHub Pages 公開設定と実機受入テスト

- 記録日：2026-10-17
- 対象：yama-books/genpei-sandbox
- 試作コード：main/prototype/
- 自動テスト：https://github.com/yama-books/genpei-sandbox/actions/runs/39030005537
- 現在の確認：Node 22 構文・単体テストがGitHub Actionsで成功（Success）。
- **Pages の公開元設定・実際のURL応答・iPhone Safariなどの実機操作は未確認。**

## 1. GitHub Pagesの初回設定（一度だけ）

1. https://github.com/yama-books/genpei-sandbox/settings/pages を開く。
2. 「Build and deployment」の「Source」で **Deploy from a branch** を選択。
3. 「Branch」で **main**、フォルダで **/(root)** を選択。
4. **Save** を押す。
5. GitHubの「Actions」画面または「Pages」の画面に表示される発行結果を確認する。

公式手順：
https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

GitHubの接続機能はファイル追加・更新が可能だが、Pagesの公開設定を変更する操作を提供していない。そのため、管理画面での一度の設定が必要。

### 発行後に開くURL（公開設定が成功した場合）

- 入口：https://yama-books.github.io/genpei-sandbox/
- 操作画面：https://yama-books.github.io/genpei-sandbox/prototype/
- ブラウザ検査：https://yama-books.github.io/genpei-sandbox/tests/browser-smoke.html

これらは**公開設定が成功した場合の予定URL**であり、現段階で外部からアクセスが成功したと保証するものではない。

## 2. 実機の最小確認

### iPhone Safari

- [ ] 操作画面が開き、GitHubの404や白画面にならない
- [ ] 人物11人を選択でき、それぞれ主張が3件表示される
- [ ] 登録史跡8件の一覧が表示される
- [ ] 史跡の大部分には精密座標がないことが明示される
- [ ] 模式図が地図だと誤解されない説明がある
- [ ] 「1刻進める」で人物が移動・時計が進む
- [ ] 「▶再生」→「Ⅱ停止」で動きと時間が制御できる
- [ ] 引力を0→100に動かすと人物の数値・判断得点が変わる
- [ ] 移動中の人物を選び、助言または資源支援が記録される
- [ ] 「現在の状態を記録」→数刻進める→「記録地点へ戻る」で刻数が復帰
- [ ] 現代施設の取得はボタン操作するまで発生しない
- [ ] 現代施設の取得ボタンを押した場合、データ取得結果または明確なエラーが表示される
- [ ] モバイル幅でも文字・ボタンが切れず、タップできる

### PC

- [ ] 同じURLで3列レイアウトが保たれる（画面幅が狭いと適切に再配置される）
- [ ] 一覧・史跡・観察日誌がスクロールできる
- [ ] 「Chrome / Edge / Safari」などの異なるブラウザで最低限の再生・停止ができる
- [ ] 開発者ツールのConsoleに致命的エラーが出ない
- [ ] ページのネットワークで人物CSV（200）、史跡JSON（200）、JavaScript（200）が確認できる
- [ ] ブラウザ検査ページがPASSになる（史料の史実性やOpenPOI実通信の検証ではない）

## 3. 不具合があった場合の分類

| 現象 | 主に確認すること |
| --- | --- |
| 404 | Pages設定、GitHub ActionsのPages build、発行URL |
| 真っ白／人物が出ない | CSV・JSONの相対パス、JavaScriptモジュールのContent-Type、Console |
| 史跡一覧が出ない | data/places/YASHIMA_SITE_REGISTRY.jsonへのアクセス |
| OpenPOIだけ失敗 | API応答、通信環境、CORS、429、元データの品質 |
| 時間が進まない | JavaScript構文エラー、再生・停止ボタン |
| 表示が重なる | モバイルviewportとCSSブレークポイント |
| 保存復帰が効かない | 対象人物の状態・イベント記録・メモリ上のスナップショット |

**不具合報告の最小セット**：URL、端末とブラウザ、操作手順、起きたこと、スクリーンショット1枚程度。画像に個人情報などが含まれていないか注意。

## 4. 現段階ではテストしないこと

- 本物の1185年の海岸線や街道の再現
- 人物の歴史上の性格・住所・行動の正確さ
- OpenPOI実在施設へ移動できるか（実際の移動エンジンは未実装）
- 物語イベント・壇ノ浦・戦闘結果
- 全120人の実在性確定
- JapanKnowledgeの原文閲覧
- ページの更新後にセーブが永続化するか（未実装）

## 5. 次の開発ゲート

**公開操作の成功を確認できたら、**実機で見つかった具体的なレイアウト／動作問題をまず修正する。次に、旧国名エンジンとのデータ契約を受けるための歴史地理レイヤーと、屋島史跡の位置精度の検証を進める。

この段階で大規模な中世日本地図復元は始めない。松尾芭蕉アプリ側の共通歴史地理エンジンを待ち、独自に重複した基盤を作らない。
