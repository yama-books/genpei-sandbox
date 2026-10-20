# MAP-03B 統合審査追補（2026-10-20）

- 対象：[PR #6](https://github.com/yama-books/genpei-sandbox/pull/6)
- ベース：MAP-03A統合済みmain、`feat/genpei-map03b`
- 担当：統合監理側レビュー。Claude Codeの[原引継ぎ](handoff/CLAUDE_MAP03B_20261020.md)に対する**後続裁定**であり、原引継ぎを消さない。
- 正本：この追補とPRの最新HEAD。MAP-03Aの純粋な経路契約は変更しない。

## 裁定：公開サイトでは外部経路照会を有効化しない

**通常の公開版は`none`。公開ドメインでは `?route=fossgis`・`?route=local` を付けても外部経路APIを呼ばない。** 認証不要というだけで多数のブラウザからの照会を許可しない。

- FOSSGISの公式抜粋：https://routing.openstreetmap.de/about.html
  - 1秒1リクエスト以内、大量利用禁止、正しいUser-Agentと（可能なら）Referer、帰属表示、地図修正リンク
  - API提供元にはログが残る
- 正式なドイツ語版利用規約：https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ はAnubisのアクセス制限のため、統合監理側でも全文確認できず。
- 既存PRの1100ms待機とメモリキャッシュはブラウザ内だけの制御であり、**利用者全員の合計レート上限を保証できない**。
- 評価用`?route=fossgis`は**localhost / 127.0.0.1 / IPv6ループバックで配信された開発ページだけ**で有効。テスト用の公開サービスへのアクセスは、FOSSGISの許容条件を守って最小限に抑える。
- 開発者が起動したOSRMへの`?route=local`も同じローカルページ制限を適用。公開サイトのURL引数から閲覧者のlocalhostサービスへアクセスさせない。
- 出典には© OpenStreetMap contributors、FOSSGISと、公式の「[地図を修正](https://www.openstreetmap.org/fixthemap)」リンクを含める。
- 画面は施設を二つ選べ、出典付きの直線距離は表示できる。道路経路は取得せず、推測の線も描画しない。
- MAP-03Aの施設間現代経路レビューは引き続き存在し、`canMoveAgent:false`、`positionDomain:"modern_wgs84"`。
- 実道路APIが正常に戻る設計条件は、正式規約の確認、権限・利用枠・全利用者のレート制御、帰属、経路レビューと失敗時退避、必要なら認証キーを秘匿する中継サーバー、監視と運用者の責任範囲の合意。

## 統合時に追加した範囲

- `prototype/map/route-provider.mjs`: ローカル配信元の明示確認がなければ評価プロバイダー不可。FOSSGIS出典に地図修正リンク。
- `prototype/app.mjs`: 現在の`location.hostname`を評価プロバイダー解決へ渡す。
- `tests/map-route-provider.test.mjs`: 公開Pagesや呼出元不明のURL引数が効かないことを検証。
- `.github/workflows/prototype-ci.yml`、`.github/workflows/deploy-pages.yml`: 新規`route-provider.mjs`の構文検査を追加。
- 本追補文書。

## 次工程

1. MAP-03Bの統合後も人物位置は架空世界。地図の施設のルートを人物の行軍・史実と表現しない。
2. ブラウザ実機Safariで地図ビュー／選択UIを確認。
3. FOSSGISを公衆向けに使いたいなら、公式規約の確認または運用者の了解を得たうえで、新しいPRで公開ポリシーと帰属表示を審査する。
4. 旧国名エンジンが正式な年代付き地物ID、典拠、ライセンスを提供するまで中世道路を自作しない。
