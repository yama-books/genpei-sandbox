# 軍記本文の所在特定・照合・再確認ポリシー

- 制定案: v0.1（2026-10-17）
- 状態: 調査工程で使用。利用者による最終承認は未実施
- 対象: 『平家物語』を中心とする軍記・歴史資料・逸話と人物台帳
- 趣旨: **過剰な逐語再確認を避けながら、史料の異同・実在性・根拠を失わない**

## 1. 重要な三つの問いを分離

1. **所在確認**：その人物や逸話がどの作品のどの巻・章段に登場するか。
2. **本文確認**：参照した特定の本文系統・校訂版に、実際に何と記されるか。
3. **史実性の判断**：その叙述を同時代史料・研究によって歴史事実として扱えるか。

「軍記本文に記載」を「史実が証明された」と表示しない。また、研究機関の要約だけで「小学館版の本文照合済み」と扱わない。

## 2. 最少確認のルール

| 段階 | 作業 | 到達状態 | 次の動作 |
| --- | --- | --- | --- |
| L0 | 研究機関・目次等で作品名・巻・章段を特定 | `passage_located` | 一般的にはL1へ |
| L1 | 公開原文を読み、固有名・行動・表現を実際に照合 | `public_text_checked` | 明白ならここで一旦停止 |
| L2 | 異本差・語句解釈・人物同定などのリスクを検出 | `edition_review_needed` | 該当部分だけ小学館版等へ |
| L3 | 使用版を明記し、小学館版原文・頭注・訳注と比較 | `edition_checked` | 必要なら専門研究へ |
| H | 同時代史料や専門研究で歴史的妥当性を評価 | `historical_assessed` | 判定理由と異説を記録 |

L3とHは独立した経路。L3を行ってもHが完了するわけではない。L1は選択した公開本文のみの確認であり、全異本についての確定ではない。

### L1で止めてよい例

- 一般的な覚一本系の「巻十一・嗣信最期に佐藤嗣信が登場する」という**本文上の存在確認**。
- 巻十一「那須与一」に扇の的の叙述があるという**本文上の出来事の確認**。
- 書誌と公的展示の説明が整合し、人物の行動内容を「軍記の叙述」として限定して扱う場合。

### L3へ進む例（JapanKnowledgeを重点利用）

- 名の表記が「継信」「嗣信」などで異なり、人物を同定する必要がある。
- 覚一本、流布本、延慶本、長門本、源平盛衰記で登場・結末が違う。
- 人物の性格評価が一文の解釈に左右される。
- 校注が出来事の史実性や事件の地理を扱い、ゲームデータの確定に影響する。
- 将来、アプリ上に原文の正確な引用を表示する必要がある（引用権・表示許諾は別途確認）。

「本文がネットで見つかった」だけでは信頼性を保証しない。出典不明の転記、転載元不明、異本混在、校訂規則不明などのときはL1を仮確認として扱う。

## 3. 小学館版の書誌情報

- 小学館『新編日本古典文学全集』**45・46**、市古貞次校注・訳、『平家物語』1・2（1994年）。
- 45は巻第一～第六、**46は巻第七～第十二・灌頂巻**。したがって今回の屋島・壇ノ浦の照合は主に**46**。
- JapanKnowledgeは本文・頭注・現代語訳の全文検索に対応。該当部分を必要になった段階で照合する。
- **本セッションではログインを要するJapanKnowledge本文は閲覧していない**。L3 `edition_checked` を付した記録は0件。
- Opera経由で閲覧できる場合も、契約・権利条件に従い、全文を別リポジトリに転載・一括保存しない。必要な短い摘記と書誌・箇所・差異の説明のみ記録。

書誌確認：
- https://japanknowledge.com/contents/koten/
- https://cir.nii.ac.jp/crid/1970304959910649403
- https://school.japanknowledge.com/contents/koten/title_list02.html

## 4. 公開資料での確認の起点

- 国立公文書館「平家物語――妖しくも美しき――」
  https://www.archives.go.jp/exhibition/digital/heikemonogatari/
  - 同館は、梶原正昭・山下宏明校注『新日本古典文学大系 平家物語』と、市古貞次校注・訳『新編日本古典文学全集 平家物語』を参考にしたことを明記。
  - https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/01.html
  - 覚一本と別本の読み比べ：https://www.archives.go.jp/exhibition/digital/heikemonogatari/contents/22.html
- 宮内庁書陵部所蔵・明暦2年刊本巻十一の書誌・章段：
  https://shoryobu.kunaicho.go.jp/Toshoryo/Detail/1000215710011
- 『青森県史 資料編 古代1』資料番号2069a（巻十一「嗣信最期」の部分翻刻）：
  https://kenshi-archives.pref.aomori.lg.jp/il/meta_pub/G0000004txt_Anci-1-2-2069a
- 兵庫県立歴史博物館の人物研究解説：
  https://rekihaku.pref.hyogo.lg.jp/digital_museum/etoki/byoubu_character/
- 個人運営サイトの公開原文（補助・校訂版未確定）：
  https://classicstudies.jimdofree.com/平家物語/巻第十一/
  https://www.koten.net/heike/gen/162/

大学・公的機関の展示要約と、公開原文の実際の文言を混同しない。各記録に `source_type` と `checked_depth` を保存する。

## 5. 記録すべき最小スキーマ

```yaml
passage_id: heike-11-tsugunobu-saigo
work: 平家物語
text_family: 覚一本系  # 確認できた場合だけ
book: 11
section: 嗣信最期
section_variants: [継信最期]
source_url: null
source_type: public_transcription
checked_depth: passage_located  # L0, 実際に原文を読んだらpublic_text_checkedへ
checked_edition: null
historicity_status: not_assessed
claim_ids: []
review_status: pending
review_note: ""
```

版を確認していない場合は `text_family: unknown` とし、推定だけで覚一本と断定しない。

## 6. 作業効率のための確認停止条件

- 一つの主張に対し、証拠の種類・URL・確度・制限事項が揃い、**予定している表示文言以上の確認が不要**なら停止。
- 異本差でゲームの参加人数・地点・死亡時期・イベントの成否が変わる場合は停止せずL3候補にする。
- 同時代史料が見当たらない場合も、無限に検索せず `not_found_in_current_search` と検索範囲を記録し後続へ。
- 「未確認」を「存在しない」の断定へ変換しない。
- 同じ調査を繰り返さないよう、調査日・版・探した語・結果を残す。

## 7. 初回適用対象

[第一次5人の人物台帳](../data/people/RESEARCH_LEDGER_001.md)でこのポリシーを試行する。人物紹介の事実部分は公的研究解説に根拠を紐付け、軍記上の記述を作品・巻・章段単位で記録する。JapanKnowledgeを見たと偽ることはしない。
