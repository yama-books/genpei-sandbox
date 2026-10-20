# MAP-03A：現代経路・歴史地理・架空移動の接続契約

- 日付：2026-10-20
- フェーズ：MAP-03の**独立した接続基盤**。地図上の人物移動はまだ実装していない。
- 実装：[`prototype/map/route-contract.mjs`](../prototype/map/route-contract.mjs)
- 検証：[`tests/map-route-contract.test.mjs`](../tests/map-route-contract.test.mjs)
- 基準：SIM-02統合コミット `f5b0cc0`
- 参照：[`docs/MODERN_POI_AUTONOMY_V03.md`](MODERN_POI_AUTONOMY_V03.md)、[`docs/handoff/MAP_02_20261020.md`](handoff/MAP_02_20261020.md)、[`docs/FATE_CHAPTER_V02.md`](FATE_CHAPTER_V02.md)

## 1. 3つの座標世界

| 世界 | 正本／例 | 描画できるもの | 禁止事項 |
|---|---|---|---|
| `abstract` | `world.agents[].x/y`、架空6地点 | 従来の模式図、人物の仮想移動 | 緯度経度に変換して現実の道を歩いたように見せる |
| `modern_wgs84` | OpenPOIの実在施設（`modernLocation`）、現代のGeoJSON経路提供元 | 施設と経路の**独立したプレビュー** | POIの位置や経路端点を人物の現在地とみなす |
| `historical_geo` | 別の旧日本国名エンジン、1185年頃の時代付き地物・史料 | 時代・典拠が合う歴史地理の検討レイヤー | 史跡範囲の代表点を合戦一点と断定、2026年の道路を1185年の古道と呼ぶ |

`prototype/geography-bridge.mjs` の `createHistoricalGeoRequest` と `validateHistoricalGeoResponse` を再利用し、旧国名エンジン本体をこちらへ複製しない。現在の史料監査は史料の確実性を担保するためのもの。現代道路の位置精度とは別である。

## 2. 現代の施設間経路だけを照会可能にする

API：

```js
import { makeModernRouteRequest, reviewModernRoute } from "../prototype/map/route-contract.mjs";

const request = makeModernRouteRequest(world.modernPois[0], world.modernPois[1]);
if (request.ok) {
  // 将来、登録・審査された walking 路線プロバイダーへ request.request を渡す
  // 現時点では外部APIへの呼び出しや経路計算は行わない
}
const reviewed = reviewModernRoute(request.request, providerReply);
// reviewed.ok が true なら「施設間経路のプレビュー候補」
// reviewed.canMoveAgent は常に false。人物を移動させない。
```

`makeModernRouteRequest` の受入対象は、OpenPOI由来の現代POIオブジェクトのうち、現代の緯度経度、provider/source/licenses/attributionsを持つ別々の2施設のみ。史跡の代表点や架空ステーションは受け取らない。

`reviewModernRoute` の応答は、次の条件を検査して初めて `geometry_ready_for_review` を返す。

- 同一版 `modern-route/1`、`modern_wgs84`、`walking`、`present_day`
- 照会した始点・終点の施設IDと一致する
- 提供元のsource・取得時刻・帰属・ライセンス・確実性区分が揃う
- GeoJSON `LineString` がWGS84の `[longitude,latitude]` 座標順である
- 両端が照会施設の座標から100m以内に接続する
- 正の有限距離と、常識的な最短直線距離との整合性がある
- 2～4096地点、距離20万m以下の制限

**これは形式と出典表示の検査であり、道の実在・通行可能性・提供元の真正性まで検証したものではない。** プロバイダー採用時には、利用規約、API認証・使用料金、帰属義務、期限、キャッシュ、可用性、アクセス制限、経路品質、歩行者可否を別途確認する。緯度経度を渡すユーザー個人の位置情報は現状存在せず、送信する必要もない。

## 3. 人物の実地図表示はまだ保留する

`getAgentPlacement(world,id)` が返す現行値は `positionDomain:"abstract"`、`realGeo:null` であり、`assessAgentRealMapPlacement` は表示不可とする。現代POIの目的地属性を人物の現在地にすることは禁止。

将来実地図上に人物を動かすために必要な仕様：

1. 物語上の開始位置、目的地・通行可能性の情報と各点の出典／時代を区別
2. 現代道路上の**仮想人物**としての位置推定なのか、1185年の地理表現なのかを明記
3. 移動モード（徒歩・船など）・経路分断や経路失敗・速度・時間刻への変換方針
4. 位置を仮想モデルとして持つ場合も、位置の確実性と史実の由来を表示
5. シード再現と、途中からの保存復帰で同じ位置が再構成されることを確認
6. 独立したバージョン付きAPIと、UI側の受理許可を段階的に追加

まずは地図上で**施設を2つ選び、現代の施設間の道路経路だけをプレビューする**というMAP-03Bを分離すると、人物モデルに触れず外部プロバイダーの精度と利便性を評価できる。

## 4. 旧国名エンジンとの最小接続

`historicalLayerReviewGate` は現行の1185年屋島事例のリクエストを返し、返答の年代・典拠・精度をチェックする既存関数を使う。返答が形式上妥当でも `canDrawModernRoad:false`、`canMoveAgent:false`。

歴史地理エンジンから現実に提供される正式ID・データスキーマ・年代範囲は**未確認**。サンプルが得られた段階で共通仕様を照合し、先走って適合と主張しない。

## 5. 担当と受入条件

今回のMAP-03Aは純粋な接続モジュールと単体テスト・文書だけとし、Claude CodeのUIにもCodexの行動ロジックにも書き込まない。別ブランチ・独立PRで管理する。

- 既存のMAP-01・02、SIM-01・02、史跡／人物資料を変更しない
- Nodeの単体テストと既存ブラウザテストが成功する
- 施設座標だけで人物を地図に置かない
- 出典や座標が不正な応答は描画候補へ変換しない
- 本PRをマージしても見た目や人物の運命に変化がない

次のMAP-03Bで経路取得先を決める場合は、サービス選定・ライセンス・利用量・失敗時表示を設計し、Codex側SIM-03のルール調整と別PRにする。SIM-02で示された資源・施設配置の感度分析結果を、歴史上の実確率として扱わない。
