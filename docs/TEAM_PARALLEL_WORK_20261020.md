# 源平異聞録：Claude Code / Codex 並列実装・引継ぎ指示 v1.0

- 制定：2026-10-20
- 正本：`yama-books/genpei-sandbox` の `main`
- 対象：[源平異聞録](https://github.com/yama-books/genpei-sandbox) ／ [公開試作](https://yama-books.github.io/genpei-sandbox/prototype/)
- 基準ローカルフォルダ：`D:\dev\genpei-sandbox`
- **この文書が作業分担・編集境界・受入条件の共通入口**。実装仕様は現在のコード・各専門設計書を参照し、古い進捗記録だけで実装済みと判断しない。
- **注意：この文書のGitHub登録は、ユーザーのWindowsフォルダやクローンを操作したことを意味しない。** ローカル操作は各セッションが実行して確認すること。

## 2026-10-20 統合チェックポイント（追補）

- **MAP-01（Claude Code）完了・統合済み**：[PR #2](https://github.com/yama-books/genpei-sandbox/pull/2)、squash統合コミット [`ec4fa85`](https://github.com/yama-books/genpei-sandbox/commit/ec4fa852ff05f6d34186ce65f0721e98ca1a4028)。地図UI・現代POI地図表示・フォールバック・テストがmainへ入った。
- 引継ぎ書：[`docs/handoff/CLAUDE_MAP_20261020.md`](handoff/CLAUDE_MAP_20261020.md)。**担当ClaudeへMAP-01を再実装させないこと。** 追加改善は新タスクとして別ブランチで計画する。
- **次の着手：SIM-01（Codex）**。 `D:\dev\genpei-sandbox` のmainを `git fetch origin` と `git pull --ff-only origin main` で更新後、既存worktreeがないことを確認して `D:\dev\genpei-codex-sim` を作成し、セクション4の作業を進める。
- Codexの変更ファイルはロジック・テストに限定。画面変更や地図マーカーの追加要望は引継ぎ書の§5の位置・経路契約を参照して提案する。
- **公開反映はActionsの成功確認とは別にサイトで検証する**。iPhone Safariの実機試験と人物の現代道路上の移動は未実施。

## 2026-10-20 SIM-01統合・次期作業（追補）

- **SIM-01（Codex）完了・統合済み**：[PR #1](https://github.com/yama-books/genpei-sandbox/pull/1)／squashコミット [`c1831a8`](https://github.com/yama-books/genpei-sandbox/commit/c1831a885da311d2cf9b1249fe2af2ab25e96b05)。旧担当ブランチ・worktreeを独断で消さない。
- [SIM-01引継ぎ](handoff/CODEX_SIM_20261020.md)、[同条件前後比較](reports/SIM_01_COMPARISON_20261020.md)を確認して継続。**SIM-01の再実装は禁止**。128シード×12条件の1536ケースで支払不能到着640→0、再現／保存復帰の不一致0という比較結果が記録済み。
- `prototype/movement-observation.mjs` の `getAgentPlacement(world, agentId)` は読取専用で、`positionDomain:"abstract"`／`realGeo:null`。現代POIの緯度経度はあくまで**目的地**の属性であり、人物のGPS位置を示さない。
- **次のUIタスク MAP-02（別ブランチ）**：この読取APIを使い、地図の施設への関心・目的地・移動状態をサイドパネルで観察できるようにする。現代地図に人物の架空座標を描画しない。人物マーカーは実座標・経路・出典の契約が確定するまで保留。
- **次の設計／調整タスク SIM-02（別ブランチ）**：SIM-01の報告で撤退系0/1536、交戦内の攻勢頓挫4/692の偏りが判明。初期資源と時間窓、交渉や施設配置の影響を分解し、条件別感度分析を行う。結末の割合を見栄えだけで調整せず、ゲームの因果として自然な分岐を検討。
- MAP-02とSIM-02は同じファイルを並行編集しない。各担当は新しいブランチ／worktreeで作業し、古いPRを再使用しない。地図と移動の結合試験は両者の成果と旧国名エンジンの仕様を確認した後に実施。

## 0. この取り組みの原則

「史実には引力があり、結末には自由がある」。自律的な人物が娯楽・休息・食料調達・資金不足などを経験し、その結果、歴史上の事件が成立・回避・失機し得る。プレイヤーは観察を基本とし、有限の助言・支援を行う。

- 史実、軍記、後世の伝承、現代の施設情報、ゲーム上の創作値を混ぜない。
- 旧日本国名エンジンは**松尾芭蕉アプリ側で共通基盤を開発中**。こちらでは重複開発しない。
- 1185年頃の中世海岸線・古道・国境や行軍時間を、現代地図から無根拠に生成しない。
- 現代POIの名称・座標・出典と、ゲーム内の移動速度・価格・効果を分離する。
- 現在の模式図の座標を実在の道・歴史上の合戦地点として表示しない。
- 現行の3人の自律行動、11人・33主張、屋島8史跡、OpenPOI最大12件の任意採用、運命の刻、再現可能シード、保存復帰を壊さない。

基礎資料：`README.md`、`docs/FOUNDATION_DESIGN.md`、`docs/ROADMAP.md`、`docs/FATE_CHAPTER_V02.md`、`docs/MODERN_POI_AUTONOMY_V03.md`、`docs/YASHIMA_SITE_POI_PILOT.md`。

## 1. ローカル作業領域の構成

**1つのGit clone + 2つのGit worktree**を推奨する。作業場所を二重に clone する必要はなく、同じ履歴を使いながらファイル編集を分離できる。

```text
D:\dev\
  genpei-sandbox\       # mainの同期・統合確認専用（すでに作成したフォルダ）
  genpei-claude-map\    # Claude Code専用worktree
  genpei-codex-sim\     # Codex専用worktree
```

**作業ごとの下位フォルダを手動で先に作る必要はない。** `git worktree add` が作業フォルダを生成する。Claude/Codexが同じ `genpei-sandbox` の作業ツリーを同時編集することは禁止する。worktreeを親リポジトリ**内部**に作るとGitの追跡や掃除を複雑にするため、上の**兄弟フォルダ**方式を採用する。

### 1-A. 初期確認・クローン（PowerShell）

```powershell
# D:\dev\genpei-sandbox がGitリポジトリなら何も再cloneしない
git -C "D:\dev\genpei-sandbox" rev-parse --show-toplevel
git -C "D:\dev\genpei-sandbox" remote -v
git -C "D:\dev\genpei-sandbox" status --short --branch
```

まだGitリポジトリでない場合は、**フォルダが空であることを確認してから**次を実行する。

```powershell
git clone https://github.com/yama-books/genpei-sandbox.git "D:\dev\genpei-sandbox"
```

空でないフォルダや既存の成果物を上書きしない。Gitリポジトリであってもremoteが異なる場合は自動変更せず報告する。

### 1-B. 基準リポジトリからworktreeを作る（初回のみ）

基準フォルダに未コミット変更がないことを確かめ、`main` が最新であることを確認する。

```powershell
git -C "D:\dev\genpei-sandbox" fetch origin
git -C "D:\dev\genpei-sandbox" switch main
git -C "D:\dev\genpei-sandbox" pull --ff-only origin main

git -C "D:\dev\genpei-sandbox" worktree add -b feat/genpei-claude-map "D:\dev\genpei-claude-map" main
git -C "D:\dev\genpei-sandbox" worktree add -b feat/genpei-codex-sim "D:\dev\genpei-codex-sim" main

git -C "D:\dev\genpei-sandbox" worktree list
```

すでに作業ブランチやworktreeが存在すれば**再作成しない**。その場合は `git worktree list` と `git branch -vv` で現在の状態を確認して既存の作業を継続する。フォルダの削除や `git reset --hard` はしない。

**一人ずつ始める場合**：最初にClaude Codeのworktreeのみ作成し、Codexの着手時に2つ目を作成してもよい。

### 1-C. Gitの共同作業ルール

1. 各担当は自分専用のworktreeとブランチだけで開発する。共通 `main` に直接コミットしない。
2. 成果を小さなコミットに分け、`git push -u origin <担当ブランチ>` し、GitHubへPRを作成する。
3. **PRは自己マージしない**。ユーザーと統合監理担当の確認を待つ。既存のmainを勝手に巻き戻さない。
4. 他担当のworktreeや、その担当が作業中のファイルを編集しない。コミット・push・リベースするのは原則自分のブランチだけ。
5. PRが並行している間は、共通 `main` を自動で両担当に上書き同期しない。統合時に変更差分と回帰テストを確認する。
6. `.github/workflows/**` と `README.md` / `docs/ROADMAP.md` は原則統合監理側の管理。修正提案はPR本文や引継ぎ書に記す。
7. 秘密情報・認証情報・個人情報・ライセンス未確認の地図画像・大量のAPI生データをコミットしない。
8. 接続中のGitHub Pagesは `main` への関連変更を自動配信する。**マージ前のCI成功＝公開成功とは限らない**ため、マージ後にDeploy Actionsと公開URLを別々に確認する。

## 2. 編集境界と担当

| 対象 | Claude Code：地図・UI | Codex：自律行動・シミュレーション |
| --- | --- | --- |
| `prototype/index.html`、`prototype/style.css`、`prototype/app.mjs` | **編集担当** | 読取のみ |
| 新規地図表示モジュール（例 `prototype/map/`） | **編集担当** | 読取のみ |
| `prototype/openpoi.mjs`、`prototype/geography-bridge.mjs` | **編集担当**（既存契約を壊さない） | 読取のみ |
| `tests/headless-smoke.mjs`、新規地図/UIテスト | **編集担当** | 原則読取のみ |
| `prototype/core.mjs`、`prototype/fate.mjs`、`prototype/poi-world.mjs` | 読取のみ | **編集担当** |
| 新規純粋ロジックモジュール、`tests/fate.test.mjs`、`tests/poi-world.test.mjs`、新規バッチ検証 | 読取のみ | **編集担当** |
| 人物・史跡の確定資料 `data/people/**`、`data/places/**` | 無断更新禁止 | 無断更新禁止 |
| 共通計画・ワークフロー・横断仕様 | 変更提案を記録 | 変更提案を記録 |

既存APIの互換性を優先する。共有境界の変更が必要なら、**変更コードを先に押し込まない**。PR本文と引継ぎに `提案API / 変更理由 / 呼出例 / テスト / 影響範囲` を明記し、統合担当に調整を求める。どうしても共通ファイル変更が必要なら、所有者側のPRとして別途実装する。

## 3. Claude Codeタスク：現代地図・施設UI（MAP-01）

### 今回の主目標

現行の非地理的な模式図は残し、**現代地図ビューを任意で切り替えられる最小機能**を追加する。実在POIは現代の緯度経度で地図表示し、名前・カテゴリ・住所・出典・ライセンスを確認できるようにする。

- MapLibre GL JS等を比較し、軽量性、iPhone/PCでの動作、地図タイルと帰属表示の利用条件を確認する。
- 地図・タイルの取得に失敗しても、既存の模式図、人物観察、施設選択が動くようにする。
- OpenPOI取得→表示→行動候補に追加／解除のUIを改良。用途未分類、存在・営業が未確認の施設は勝手に確定扱いしない。
- 人物の動きは、Codexの地理座標・経路契約が固まるまで模式図に留めるか、「地図上の実位置は未対応」と明示する。**模式図のx/yを地図上の位置へ変換しない。**
- UIは文言を簡潔にし、画面密度、スマホのタップのしやすさ、拡大縮小、出典の確認を優先。
- 実装後、実ブラウザテストと失敗時フォールバックを追加する。

成果：最小動作の地図UI、テスト、UI→シミュレーションへの必要API一覧、`docs/handoff/CLAUDE_MAP_20261020.md`。既存の `prototype/app.mjs` は所有ファイルなのでここに統合してよい。

### MAP-01受入条件

現代のPOIを実座標で表示し、非地理的な人物模式図と混同しない。元の人物11名・史跡8件・現代POI取得・運命の刻・保存復帰が維持される。PCとスマホ幅で表示崩れや重大なエラーがない。

## 4. Codexタスク：自律行動と分岐・数値評価（SIM-01）

### 今回の主目標

現行の `core.mjs` / `fate.mjs` / `poi-world.mjs` を再実装せず改善する。まず**再現可能な大量シード検証**により、遊びとしての収束・失敗・寄り道の分布を可視化し、必要な規則だけを修正する。

- 100以上の固定シード、引力0/50/100、POIなし／POI模擬セットあり、介入なし／有限介入ありを分離して計測する。
- 屋島到達率、戦闘／交渉／撤退／未到着、娯楽・休息・補給・所持金不足、永久移動不能、不正な残高、同一シード再実行一致を集計。
- 乱数消費順と状態遷移を把握する。変更前後を**同じ条件で比較**し、データ欠損や偏りを隠さない。
- 過度に同じ結末が出る場合は、どの得点・資源制約・時間窓が原因か切り分けてから調整する。歴史上の出来事の「実際の確率」として表示しない。
- 将来の地図エンジンに備え、`agentId`、`destinationId`、`positionDomain`（abstract/real_geo）、`movementStatus`、`provenance` 等の**意味契約**を提案。GPS位置や道路がない状態で推定値を史実・実地理として扱わない。
- 画面を直接変更せず、UI担当向けのインターフェース例を引継ぎに記す。

成果：再現可能なバッチスクリプトと集計レポート、必要な改善ロジックと単体テスト、UI向けデータ契約、`docs/handoff/CODEX_SIM_20261020.md`。

### SIM-01受入条件

同一シード・同一入力ならリプレイと運命の結末が一致する。資源や行動の不正がない。結末分布の偏りを可視化し、改善があるなら同条件の前後比較を提示する。UI担当のファイルは変更しない。

## 5. 共通の受入・検証と統合

各担当はまず次を実行する（Node環境がなければ導入要件を記録）。

```powershell
node --check prototype/core.mjs
node --check prototype/app.mjs
node --check prototype/openpoi.mjs
node --test tests/*.test.mjs
```

- GitHub Actionsの `Prototype integrity` がPRで成功したか確認。現行CIにはPC幅（1280px）・スマホ幅（390px）のChromium操作も含まれる。
- 公開ワークフローは `Deploy Genpei Sandbox to Pages`。本番公開は `main` のマージ後に監理担当が検証する。
- API応答テストでは模擬fixtureを使い、必要なときだけAPI実通信する。新たな実店舗の静的コピーをデータに同梱しない。
- ロードマップの各段階は既存コードに一部先行実装がある。特定の「フェーズ完了」と誤認しない。

**推奨統合順**：① Codexによる行動・経路契約のレビュー（互換性を優先）→ ② Claude Codeの独立地図ビュー → ③ 地図と移動APIの結合試験。両PRが独立なら順序を変えてよい。衝突やCI失敗があれば無理にマージしない。

## 6. 引継ぎ書の書式（担当ブランチ内で作成）

各自、`docs/handoff/` を必要なときに作成して上記指定のmdを保存する。空フォルダをGitHubへ事前作成する必要はない。ここは担当固有ファイルなので衝突を避けられる。

各引継ぎには、必ず以下を明記する。

1. 日時、担当、ブランチ、HEADコミット、PR URL
2. 既に実装済み・検証済みの内容（実行したテストの正確な結果）
3. 変更ファイルと既存仕様からの差分、所有境界を越えた提案の有無
4. 利用した地図・POIデータの出典・ライセンスと公開リスク
5. 未完了、既知不具合、他担当へ渡したいAPI契約
6. そのまま再開するための最初の1〜3操作

ユーザーや別の担当へ引き継ぐ際は「前回の作業状態はGitHubのブランチ・コミットと引継ぎmdが正本」として、口頭説明に依存させない。

## 7. 各担当へ送る短文テンプレート

### Claude Codeへの開始指示

> `D:\dev\genpei-claude-map` を専用作業フォルダにしてください。GitHubの `yama-books/genpei-sandbox` の `docs/TEAM_PARALLEL_WORK_20261020.md` を最初に読み、セクション3「MAP-01」を担当してください。基準クローンは `D:\dev\genpei-sandbox` です。worktree未作成ならセクション1を安全に実行し、既存の変更は保持してください。Codexの所有ファイルは変更せず、実装・テスト・引継ぎmd・PR作成まで進め、mainにはマージしないでください。

### Codexへの開始指示

> `D:\dev\genpei-codex-sim` を専用作業フォルダにしてください。GitHubの `yama-books/genpei-sandbox` の `docs/TEAM_PARALLEL_WORK_20261020.md` を最初に読み、セクション4「SIM-01」を担当してください。基準クローンは `D:\dev\genpei-sandbox` です。worktree未作成ならセクション1を安全に実行し、既存の変更は保持してください。Claude Codeの所有ファイルは変更せず、実装・大量シード検証・テスト・引継ぎmd・PR作成まで進め、mainにはマージしないでください。

### 統合担当への短文

> `yama-books/genpei-sandbox` の `docs/TEAM_PARALLEL_WORK_20261020.md` に従って、MAP-01とSIM-01のPR・引継ぎをレビューし、所有ファイル衝突・API整合・史実とゲームの境界・回帰テストを確認してください。合格したPRだけを順次マージし、GitHub Actionsと公開サイトで結果を検証してください。
