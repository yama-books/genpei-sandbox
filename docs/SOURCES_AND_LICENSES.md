# データソース・典拠・ライセンス管理

- 状態：**基礎調査 v0.1（最終的な権利監査は未実施）**
- 記録日：2026-10-17
- 原則：施設データ、歴史史料、地図・交通・土地利用データ、ユーザー生成のシミュレーション結果を別管理する。

## 1. OpenPOI API

公式：
- API仕様書：https://docs.openpoiapi.com/
- API本体：https://api.openpoiapi.com
- ライセンス・帰属表示：https://openpoiapi.com/attribution.html

以下は2026-10-17時点で公式文書から確認した概要。提供側の変更に備え、実装直前に再確認する。

| 項目 | 確認された仕様 |
| --- | --- |
| エンドポイント | GET /v1/search、GET /v1/suggest |
| 検索 | q、center=経度,緯度 + radius、bbox=西経,南緯,東経,北緯 |
| 上限 | /v1/searchのlimitは1〜200。指定なしは50 |
| 認証 | 不要、APIキー不要 |
| CORS | 原則すべてのオリジン許可。ただし429のレスポンスではCORSヘッダが付かない場合がある |
| レート制限 | API全体で定常200 req/s・バースト600 req/s。利用者専用の割当ではない |
| 主な施設項目 | name, name_kana, prefecture, city, address, category, business_type, lat, lng, source, licenses, attributions |
| 結果の保存 | 可能。licenses、attributionsも一緒に保存すること |
| 品質制約 | unknownカテゴリ、位置ずれ、閉業施設、未収録施設、鮮度表示なし |

- 公式掲載の2026-09-20時点の統計では、カテゴリが`unknown`の施設が約54.6%。**特定ジャンルを分類できない施設が多数ある**。
- `business_type` は現状 `category` と同値と説明されるため、詳細ジャンルの独立した証拠だとみなさない。
- 位置のずれが大きいレコードの例や、営業継続が不明な施設がある。
- レスポンスに住所・座標が欠ける場合に備える。
- 位置検索の `center` は経度→緯度の順。開発時に逆順を入力しない。
- 最大200件は**総数を取得できる保証ではない**。領域を分割し、取得件数・重複・飽和した区画を記録する。完全網羅と表示しない。
- 検索スナップショットには取得日・検索パラメータ・ソース版・品質統計・未取得可能性を記録する。

### POIのゲーム分類

```text
原POIレコード（改変せず保存）
  -> 正規化・重複・座標検査
  -> ゲーム分類の候補（直接カテゴリ／名前辞書／別資料）
  -> 分類確度・証拠の記録
  -> 施設効果モデル（在庫や売上の実測ではない）
```

温泉、ゲームセンター、動物園、駅などを、正規化カテゴリのみで確実に分類できると想定しない。ゲーム向けの分類は別層で管理し、人手監査と別ソース補完を可能にする。

### 出典と再配布

- 公開時の画面に「OpenPOI API」を掲示し、https://openpoiapi.com/attribution.html へリンクする。
- レコード中の `licenses` / `attributions` は配列のまま保存する。
- 公開データの元ソースにはOverture Maps、Foursquare由来レコード、Japan Food Facilitiesなど複数のライセンスが含まれる。
- Apache-2.0由来データの再配布時にはライセンス文書およびNOTICE等の要件を確認する。
- データ加工を公開する場合は変更した主体・内容などの表示要件を検討する。
- OpenPOIの説明は法的助言ではない。**生の施設データをリポジトリに追加する前にライセンス単位の監査を行う。**

## 2. 歴史的な人物・事件・史跡

### 叙述の種類

- `historical_record`: 当時の記録や検証可能な史料による歴史的主張
- `gunki`: 『平家物語』等の軍記に描かれる人物や出来事
- `legend`: 後世の地域伝承・説話・芸能など
- `simulation`: アプリの仮想世界で新たに起きた出来事

同じ話題に複数のレイヤーが重なる場合は、互いを置換しない。例えば「壇ノ浦の戦闘（史実）」「ある人物の最期の描写（軍記）」「生存伝説（伝承）」を別IDにする。

### 初期の信頼できる調査入口（個票確認は今後）

- 国立公文書館『平家物語――妖しくも美しき――』：https://www.archives.go.jp/exhibition/digital/heikemonogatari/
- 同「歴史と物語のあいだに」：https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/20.html
- 同「読み比べてみよう！ 那須与一」：https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/22.html
- 同「平家物語とその時代」：https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/24.html
- 兵庫県立歴史博物館の源平人物・合戦関係の解説（個別ページは要照合）
- 郷土自治体・博物館・寺社が公開する史跡・伝承解説（成立年代と位置精度を別に記録）

国立公文書館は、軍記の逸話が当時の記録と食い違い、諸本間にも差があることを指摘している。よって**『平家物語』の叙述を史実としてそのまま採用しない**。

### 学術データの管理要件

- 論拠にはURLだけでなく典拠名、成立期、巻・段・年月日条・ページ、引用／要約の区別を保持。
- 人物の同定と逸話の真偽、位置の精度は別々に判断。
- 原典本文や図版の転載権を確認。必要以上の長文転載を行わない。
- 史料未確認のAI案は `reviewStatus: pending` で保存し、確定表示しない。

## 3. 現代交通・土地利用

**候補。未収集・未組込。**

- 国土交通省「国土数値情報」鉄道データ（駅の存在と線路接続の基礎）。駅位置だけでは運行時刻・運賃・乗換は分からない。
- 国土数値情報の土地利用細分メッシュ。森林・市街地・農地等の地形コスト・野営環境に使用可能。
- 道路、航路、海岸線、地形などの追加データ。配信・再配布・地図タイルの条件を個別に確認。

鉄道・道路・海路のゲーム用経路ネットワークは、OpenPOIの地点情報から自動推定しない。実際の接続データとルーティングロジックを分離する。

## 4. レコードと実行の出典追跡

各世界データ版には以下を保存：

```yaml
world_data_version: pending
generated_at: null
poi_source: OpenPOI API
poi_fetched_at: null
poi_query_bounds: null
transport_source_versions: []
historical_catalog_version: pending
source_license_manifest: pending
quality_metrics:
  total_records: null
  unknown_category_count: null
  invalid_location_count: null
  duplicate_count: null
  saturated_tiles_count: null
```

上記はフィールド案であり取得済みデータではない。各 `Facility` に原典のライセンス・出典属性を保持し、データ生成物では `world_data_version` に固定する。

## 5. 公開判定ゲート

- [ ] OpenPOI規約と個別データのライセンス／NOTICE要件を確認
- [ ] 公開範囲のPOIが再配布可能か監査
- [ ] 地図タイル・交通・土地利用データの出典条件を確認
- [ ] 史料本文・画像等の著作権と権利表示を確認
- [ ] 史料の不確実な主張に「未確認」「伝承」等のラベルが出る
- [ ] 位置精度が低い施設・史跡を断定的に表示しない
- [ ] 外部API障害時に前回スナップショットまたは欠損表示へフォールバックする
- [ ] 非公開の開発資料、秘密情報、個人情報を公開物へ含めない

本ファイルの記載により外部データの再配布権が自動的に与えられるものではない。
