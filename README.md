# genpei-sandbox
史実と現代地理が交差する、自律型源平合戦シミュレーター。歴史的人物の行動を観察し、運命の行く末に介入しながら見届けるような装置？

## コンセプト

**史実には引力があり、結末には自由がある。**

歴史上の人物が現代の地理・交通・施設を利用して自律的に行動する箱庭シミュレーション。観察を基本に、プレイヤーは任意の場面で助言・支援・介入を行い、史実から分岐する歴史を比較できます。

『平家物語』や各地の伝承は、史実・軍記・伝承・ゲーム上の創作を区別して扱い、人物・出来事・地点ごとに典拠と不確実性を記録します。

## 設計資料

- [基礎設計書](docs/FOUNDATION_DESIGN.md)：企画思想、歴史的引力、自律行動、施設効果、イベント、観察UI、屋島MVP
- [歴史人物の調査・監査計画](docs/CHARACTER_RESEARCH_PLAN.md)：候補120件、史実性・逸話・典拠の区別、調査スキーマ
- [データソース・ライセンス](docs/SOURCES_AND_LICENSES.md)：OpenPOI API、歴史史料、交通・土地利用、公開条件
- [開発ロードマップ](docs/ROADMAP.md)：P0〜P5、受入条件、テスト、引継ぎ
- [軍記本文の確認方針](docs/TEXT_VERIFICATION_POLICY.md)：作品・巻・章段の特定、公開原文と小学館版の照合の使い分け
- [人物史料台帳・第1集](data/people/RESEARCH_LEDGER_001.md)：源義経・平宗盛・平知盛・佐藤嗣信・那須与一の主張別の根拠・確認状況

- [人物調査の統御規則](docs/RESEARCH_GOVERNANCE.md)：120候補の調査深度・打切り条件・複数セッションの分担
- [人物全体索引（CSV）](data/people/MASTER_INDEX.csv)：P0・P1・P2の優先配分、調査状態
- [義経・宗盛の年月日条照合](data/research/chronologies/YOSHITSUNE_MUNEMORI_1185_PILOT.md)：『吾妻鏡』と『玉葉』紹介の屋島日程差

- [屋島篇11人・史料監査の到達点](docs/YASHIMA_11_RESEARCH_GATE.md)：史実／軍記の区別、重大な論点、試作へ進むための停止基準
- [屋島篇11人・33主張（CSV）](data/people/YASHIMA_MVP_CLAIMS.csv)：人物別の必要な3項目と出典・未確認状態

- [人物カード・引力の操作試作](prototype/)：仮想の移動・介入、史料33主張の表示（ブラウザ実機未検証）
- [操作試作の仕様・起動手順](prototype/README.md)：試作と史実を区別した注意事項とNodeテスト

- [試作引継ぎチェックポイント](docs/PROTOTYPE_CHECKPOINT_2026-10-17.md)：実装・検証した範囲と、未実施の確認事項

- [屋島史跡・現代施設取得の最小実証](docs/YASHIMA_SITE_POI_PILOT.md)：市の資料を根拠とする8地点、OpenPOIの任意取得と未検証事項
- [史跡台帳JSON](data/places/YASHIMA_SITE_REGISTRY.json)：現地の遺構・伝承を分離し、精密座標がないものはnullのまま保持
- [ブラウザ検証用の画面](tests/browser-smoke.html)：人物・史跡・操作・一時保存のスモークテスト（HTTP配信で開く）

## 公開中のWeb試作品

- **[源平異聞録を開く](https://yama-books.github.io/genpei-sandbox/)**（自動的に `/prototype/` へ移動）
- [公開サイトのブラウザ基本操作テスト](https://yama-books.github.io/genpei-sandbox/tests/browser-smoke.html)
- [GitHub Pagesの公開・実機検証手順](docs/PAGES_AND_DEVICE_ACCEPTANCE_20261017.md)

2026-10-19にHTTP 200と公開環境のスモークテスト**全項目PASS**を確認。[Pagesデプロイ実行結果](https://github.com/yama-books/genpei-sandbox/actions/runs/39192421009)はSuccess。

### 今後の公開手順

`.github/workflows/deploy-pages.yml` が **mainへの関連ファイル更新を検知して自動デプロイ**する。GitHub Actionsの `workflow_dispatch` にも対応。静的成果物を組み立て、Nodeテスト成功後にGitHub Pagesへ公開する。設定済みの公開元はGitHub Actionsなので、以前の「Deploy from a branch → main /(root)」の案内は適用しない。

ただしChrome自動検査・公開ブラウザ検査の成功は、iPhone Safariでの手動実機検証やOpenPOI実通信の成功まで保証しない。地理・人物行動は現在も実験用の模式モデル。

## 現在の状態

**史料調査と独立した操作試作を開始しました。** [ブラウザ操作試作](prototype/) は人物CSVと小さな仮想行動エンジンを利用します。屋島の公的資料に基づく史跡8地点の参照表示とOpenPOIへの任意の読み取り検索コードは追加済みですが、実API通信は未検証です。実際の道路・施設を使った移動、史実イベント、部隊、永続セーブは未実装で、ChromeでのPC幅・スマートフォン相当幅の自動操作検証とGitHub Pages公開は確認済みです。ただしiPhone Safariの手動実機確認は未実施です。

第一試作の移動空間はまだ実際の地図ではありません。人物・史跡・現代施設の三つの情報源を混同せず、実地座標と経路の裏付けが得られた時点で接続していきます。

## データと公開について

本リポジトリは公開されていますが、ここに置く初期設計書は研究・実装案です。人物候補の収録は実在の確認や史実の確定を意味しません。OpenPOIなど外部データの出典・権利条件を確認する前に、大量の取得データや無許諾の原典本文・図版を再配布しません。

OpenPOI API: https://docs.openpoiapi.com/ ／ 出典・ライセンス: https://openpoiapi.com/attribution.html
