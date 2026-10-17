# 屋島史跡・OpenPOI統合の最小実証

- 記録日: 2026-10-17
- 状態: **史跡の出典照合・データ登録済み。現代API通信とブラウザ実機の動作確認は未実施**
- 史跡正本: [YASHIMA_SITE_REGISTRY.json](../data/places/YASHIMA_SITE_REGISTRY.json)
- ブラウザ: [prototype](../prototype/)
- OpenPOIクライアント: [openpoi.mjs](../prototype/openpoi.mjs)

## 史跡8件の状況

| ID | 現在の史跡・伝承地 | 公的資料が支えること | 戦場との同一性 |
| --- | --- | --- | --- |
| YS001 | 屋島 | 高松市が国指定史跡と表示。奈良文化財研究所の資料に代表座標 | 広域の史跡と戦場を含む。合戦の厳密座標ではない |
| YS002 | 祈り岩 | 市登録史跡として現存。与一が祈ったとの伝承 | 軍記・伝承であり史実未確定 |
| YS003 | 駒立岩 | 市登録史跡として現存。与一が射たとの伝承 | 軍記・伝承であり史実未確定 |
| YS004 | 射落畠 | 市登録史跡。嗣信が射落とされたとの伝承 | 戦死の厳密地点は未確認 |
| YS005 | 佐藤継信の墓 | 市登録史跡。1645年に現位置へ移設した経緯 | 現在地を戦死地点として使用不可 |
| YS006 | 六萬寺 附 杉の井 | 市登録史跡。1183年の安徳天皇行在所とする伝承 | 現代境内と中世行在所の同一性未確認 |
| YS007 | 安徳天皇社 | 屋島公式観光資料に行宮・祀られる場所として掲載 | 市の史跡指定は今回未確認 |
| YS008 | 義経弓流し跡 | 屋島公式観光資料に関連逸話を掲載 | 本文の場面と現地地点の対応未監査 |

**座標が現時点であるのは、広域史跡「屋島」についての代表点1件のみ。** 7件は `lat:null,lng:null` で、勝手に高松町や牟礼町の中心点を当てない。

## 主要な出典

- 高松市「屋島」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/yashima.html
- 奈良文化財研究所総覧抄録ID 36339「屋島」（北緯34.3566、東経134.1012は**史跡代表点**）：https://heritagemap.nabunken.go.jp/statistic/36339-%E5%B1%8B%E5%B3%B6.html
- 高松市「祈り岩」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/inoriiwa.html
- 高松市「駒立岩」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/komadateiwa.html
- 高松市「射落畠」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/iochibata.html
- 高松市「佐藤継信の墓」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/sato_haka.html
- 高松市「六萬寺 附 杉の井」：https://www.city.takamatsu.kagawa.jp/kurashi/kosodate/bunka/bunkazai/shiteibunkazai/shiseki/rokumanji.html
- 屋島公式観光サイト「源平合戦古戦場」：https://www.yashima-navi.jp/jp/history/entry-154.html

参照先が高松市の史跡資料だとしても、**伝承の内容を一次史料に格上げしてはいけない**。

## OpenPOIの試験仕様

公式資料： https://docs.openpoiapi.com/

- 呼び出し先：GET https://api.openpoiapi.com/v1/search
- 取得条件：`center=134.1012,34.3566&radius=1200&limit=50`
- 中心は奈良文化財研究所の**屋島史跡代表座標**。現代施設の取得を試す領域の中心であって、弓を射た場所ではない。
- API通信はブラウザ上の「周辺施設を取得」操作がある場合のみ。ゲーム起動時には取得しない。
- APIの結果をリポジトリへ保存しない。ブラウザのメモリに限りライセンス・出典配列を保持。
- 元のカテゴリと、ゲーム向けの仮の分類を別の項目とする。未知のカテゴリを無理に割り当てず「用途未分類」と表示。
- 座標欠損・不正や中心から約1.3km以上離れた結果は表示から除外。
- 最初の8件だけを一覧表示、総取得件数・範囲外・不正・unknown件数を併記。
- 50件上限に達したら「一部のみ」と表示。達しなくても収録網羅性を保証しない。
- OpenPOIが示す帰属表示ページへリンク。再配布用スナップショットはライセンス監査が別途必要。

### 注意

これまでの世界モデルは架空の施設と空間で動いている。今回の実在POI検索は**読むだけの別系統**なので、歴史人物が実在の店へ移動して食事する状態にはまだなっていない。

公式仕様上、OpenPOIのカテゴリは `unknown` が多く、特定の店舗形態・営業状態・正確な座標が保証されない。APIから実際に現地を検索した結果は**この調査では取得できていない**。件数・施設名・取得成功を想像で書かない。

## 検証・ブロック事項

- [x] 屋島史跡8件の出典・精度種別・人物関係を分離して保存
- [x] 代表点を取得。7地点は正確な緯度経度未確認として保持
- [x] POI取得コードのリクエスト条件・カテゴリ分類・異常座標・権利情報の保持を実装
- [x] 参照専用のUI・取得ボタン・API帰属リンクの追加
- [x] 模擬データで正規化関数・決定論的自律エンジンのロジック点検
- [ ] HTTP環境で実際のAPI応答・CORSを確認
- [ ] PC／スマホ幅のブラウザでUI動作を検証
- [ ] 高松市などが公開する位置資料から7地点の**現代所在地**を個別に測位
- [ ] 現代施設と現実の道路・鉄道・港の経路を検証する
- [ ] POIの実在データを使って人物が移動するゲーム世界を別途実装

Operaブラウザ連携はこの作業環境で未接続だったため、ブラウザ実機検証は行えなかった。GitHub上でコードを読み戻したことは実機検証の代わりにはならない。

## 次の実装判断

史料研究を再び120人全員へ拡張せず、**実在の施設情報を自律移動で使う最初の一本の経路**を設計する。その前に、実際の経路データと施設名寄せ・ライセンス・誤座標を解決する。町中心点の推測で伝承地へ人物をワープさせない。
