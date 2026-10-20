# 引継ぎ：MAP-01 現代地図・施設UI（Claude Code）

## 1. 作業情報

- 日時：2026-10-20
- 担当：Claude Code（地図・UI）
- ブランチ：`feat/genpei-claude-map`（worktree：`D:\dev\genpei-claude-map`）
- 基点：`main` @ `3a24f21`
- 実装コミット：`c04ff90`（Leaflet同梱）→ `c5f30d4`（地図モデル）→ `2bc5dde`（地図ビューとUI統合）。HEADはこの引継ぎ書のコミット。
- PR：https://github.com/yama-books/genpei-sandbox/pull/2 （mainへは未マージ）
- **正本はGitHubのブランチ・コミットとこの文書。**

## 2. 実装済み・検証済みの内容

### 実装

- 世界パネルに「模式図／現代地図」の切替を追加。初期表示は模式図で、SVG模式図は削除・変更していない。
- 現代地図は Leaflet 1.9.4 と地理院タイル（淡色地図）で描画。Leafletは地図を初めて開いたときに `<script>` を動的に追加して読み込む。
- 地図に置くもの（実座標のみ）
  - OpenPOI施設のマーカー
  - `YS001`（史跡範囲の代表点）
  - 検索範囲1.2kmの円
- 座標がない史跡（YS002〜YS008）は地図に置かず、推定もしない。
- 人物は地図に置かない（`agentsOnMap:false`）。地図の上部に「人物の地図上の位置は未対応」と常に表示する。
- 施設の状態表示
  - 区分は「採用中／採用可／参照のみ（用途未分類・出典不足・候補上限外）」。
  - 施設カードの状態は世界の `modernPois` に追従する（追加・解除・リセット・保存復帰のいずれでも更新される）。
- ポップアップの表示項目：名称、分類（元のカテゴリも表示）、住所、直線距離、出典、ライセンス、帰属、「存在・営業・立入可否は未確認」。API由来の文字列はテキストノードとして挿入する。
- 失敗時の動作
  - タイル取得が3回失敗し、成功が0回のとき：警告を出し、マーカーは表示を続ける。
  - ライブラリの取得失敗・時間切れ（12秒）のとき：エラー文を出し、模式図・人物・施設一覧は動き続ける。地図を開き直すと再試行する。

### 実行したテストと結果（Windows 11、Node v24.19.0、Chrome 155）

```text
node --check prototype/core.mjs / app.mjs / openpoi.mjs / fate.mjs / geography-bridge.mjs
node --check prototype/map/modern-map.mjs                  -> すべてOK
node --test tests/*.test.mjs                              -> tests 37 / pass 37 / fail 0
node tests/headless-smoke.mjs                              （python -m http.server 8765 で配信）
  PASS browser UI 1280px: … play/pause, modern map
  PASS browser UI 390px: … play/pause, modern map (tiles blocked)
  PASS map library failure fallback
```

- 実API（OpenPOI）の手動確認は1回のみ。
  - 結果：返却50件／行動候補12件／未分類3件。地図上のマーカーは50件（採用中12、史跡1、範囲円1）。
  - 1280px・390pxとも、横方向のはみ出しなし、ページエラーなし。
- iPhone Safari実機では未確認。Chromeの390px幅で代替確認した。

## 3. 変更ファイルと所有境界

| ファイル | 内容 |
| --- | --- |
| `prototype/index.html` | 表示切替、地図ビューの領域、注意文と施設説明の文言調整 |
| `prototype/style.css` | 切替ボタン、地図、凡例、ポップアップ、施設カードの状態バッジ |
| `prototype/app.mjs` | 表示切替、地図モデルの更新、施設カードを状態付きで再描画、「地図で位置を見る」 |
| `prototype/map/map-model.mjs`（新規） | 純粋関数。実座標マーカーと状態判定、タイル・出典の定数 |
| `prototype/map/modern-map.mjs`（新規） | Leafletの遅延読込と表示制御 |
| `prototype/vendor/leaflet-1.9.4/`（新規） | `leaflet.js`、`leaflet.css`、`LICENSE`（npmパッケージ leaflet@1.9.4 から取得） |
| `tests/modern-map.test.mjs`（新規） | 地図モデルの単体テスト8件 |
| `tests/headless-smoke.mjs` | 地図・タイル遮断・ライブラリ失敗のブラウザテストを追加 |

- Codex担当のファイル（`core.mjs` / `fate.mjs` / `poi-world.mjs`、各テスト）は**読取のみ**。`buildModernStations` / `gameActionForCategory` / `installModernPois` を呼び出しているだけ。
- `data/**`、`.github/workflows/**`、`README.md`、`docs/ROADMAP.md` は変更していない。
- 既存仕様からの差分
  - 施設カードの採用バッジは「行動候補（採用可能）」から状態別の表示に変わった。
  - 施設の説明文と冒頭の注意文を短くした。
- 統合担当への提案
  - CIの `node --check` に `prototype/map/*.mjs` を追加する。
  - `prototype/README.md` に現代地図の説明を追記する。

## 4. 地図・POIデータの出典・ライセンスと公開リスク

- **地理院タイル（淡色地図）**
  - URL：`https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`
  - 条件：ウェブ上でリアルタイムに読み込む利用は申請不要。「地理院タイル」の出典を明記し、一覧ページ https://maps.gsi.go.jp/development/ichiran.html へリンクする（2026-10-20に一覧ページで確認）。
  - z9以下は全球データに切り替わり、Vector Map Level 0 の出典表示が必要になるため、minZoomを10にしている。
  - タイル画像はリポジトリに保存しない。
- **OpenPOI API**
  - 従来どおりブラウザ内で一時的に取得するだけで、店舗データは同梱しない。地図の出典表示にOpenPOIの帰属ページへのリンクを追加した。
  - 各レコードの licenses / attributions（例：Overture、CDLA-Permissive-2.0）はポップアップに表示する。
- **Leaflet 1.9.4**：BSD-2-Clause。LICENSEを同梱。
- **公開リスク**
  - タイルの出典表示を消すと利用条件違反になる。
  - 地理院タイルは無償・無保証で、障害時はフォールバック表示になる。
  - 実在施設の名前が地図に出るため、「営業中」「入れる」といった断定表現を足さないこと。

## 5. 未完了・既知の制約・他担当へ渡したいAPI契約

### 未完了・制約

- 人物の地図表示は未対応。Codex側の位置・経路の契約が決まるまで、意図的に保留している。
- iPhone Safari実機での拡大縮小とタップの確認が残っている。
- `tests/browser-smoke.html`（iframe版の手動テスト）には地図の項目を追加していない。
- 地図の表示状態（模式図か地図か）は保存復帰の対象外。表示の好みであり、世界の状態ではないため。

### シミュレーション側へ求めたいAPI（提案のみ。core.mjsは未変更）

提案API：人物や目的地を現代地図に置けるのは、次の意味情報が揃った場合だけにしたい。

```js
// 人物ごと（例：world.agents[i]、または getAgentPlacement(world, agentId) の戻り値）
{
  agentId: "C036",
  positionDomain: "abstract" | "real_geo",   // abstract のものは地図に置かない
  realGeo: { lat, lng, crs: "WGS84" } | null, // real_geo のときだけ値を入れる
  destinationId: "modern-3" | "yashima" | null,
  movementStatus: "idle" | "moving" | "arrived" | "blocked",
  routing: "abstract_straight_line_only" | "road_network",
  provenance: { kind: "simulation", source: "core.mjs@<version>" }
}
// 目的地（modernPois の各要素）。既存の modernLocation をそのまま正本として扱う
{ id, label, modernLocation: { lat, lng }, provenance: { provider, source, licenses, attributions } }
```

- 変更理由：模式図の x/y を地図座標に変換すると、架空の位置が実在の場所に見えてしまう。座標の種類（`positionDomain`）がはっきりした値だけを描画するため。
- 呼出例：`for (const a of agents) if (a.positionDomain === "real_geo" && a.realGeo) drawAgent(a.realGeo)`。それ以外の人物は、今回と同じく「地図上の位置は未対応」と表示する。
- テスト：`tests/modern-map.test.mjs` に「abstract の人物は地図マーカーにならない」ケースを追加する予定。
- 影響範囲：`map-model.mjs` に `buildAgentMarkers` を足すだけで、既存の模式図描画は変わらない。
- `world.modernPois[].modernLocation` と `provenance` は現在の形を維持してほしい。地図の「採用中」判定は `label + lat/lng（小数5桁）` で照合している。

## 6. 再開するための最初の操作

1. 状態確認：`git -C "D:\dev\genpei-claude-map" status --short --branch`、続けて `gh pr view 2 --repo yama-books/genpei-sandbox`
2. テスト：`D:\dev\genpei-claude-map` で `npm install --no-save playwright@1.56.1` を実行し、`python -m http.server 8765 --bind 127.0.0.1` で配信してから `node --test tests/*.test.mjs` と `node tests/headless-smoke.mjs`
3. 次の作業：PRのレビュー指摘への対応、またはSIM-01の位置契約が確定した後の人物地図表示（§5）
