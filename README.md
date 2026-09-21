# AI業界トレンド 週次自動収集・解説

毎週土曜 07:00 JST に AI 業界の情報を自動収集し、**主要トピックを IT 初心者にも分かるように
かみ砕いて解説した、グラレコ（グラフィックレコーディング）風の HTML サイト**を
GitHub Pages に公開して Discord に通知する仕組みです。

📖 **公開サイト: https://kskrm.github.io/claude-agent-sdk-demo/docs/**

ニュースを並べるだけのまとめではありません。**「何が起きたか」だけでなく
「それを理解するのに必要な要素技術は何か」「身近なものにたとえると何か」までを、
毎週 5 本ぶん自動で書き起こします。**

---

## 出力される 2 ページ

| ページ | 中身 |
|---|---|
| `docs/<日付>.html`（＝ `index.html`） | **深掘り解説 5 本**。1 本ごとに「つかみ → そもそもの話 → たとえるなら → 数字で見る → 図解 → 使われている技術 → 何が変わる？ → 用語メモ → 次の一歩」 |
| `docs/<日付>-list.html` | 今週集めた**全トピックの一覧**。解説対象の記事には「くわしい解説 →」リンクが付く |

2 ページは相互にリンクしているので、どちらから入っても行き来できます。

### 解説 1 本の構成

```
① 初心者向けに言い換えた見出し   アイコン付き。例:「答えを一瞬で出す新AI登場」
② つかみ                         専門用語ゼロで「何が起きたか」を2〜3文
③ そもそもの話（付箋）           理解に必要な前提知識
④ たとえるなら（付箋）           日常のものへのたとえ ＋ ビフォー/アフターのミニ図
   例:「これまでのAIは、注文を受けてから一文字ずつ手書きで返事を書く郵便局員。
       新しいAIは、用意された回答カードから一瞬で選んで渡す窓口係です」
       ✉ 手書きで返信  →  ✓ カード即選択
⑤ 数字で見る ★            記事の数字を棒グラフ／大きな数字タイルで視覚化
   例: 応答時間 329秒 ▬▬▬▬▬▬ → 0.5秒 ▪  「99.8% 減」
⑥ 図解                    flow / compare / layers / cycle の4種から内容に合うもの
⑦ 使われている技術         要素技術を2〜4個、アイコン＋「一言で」＋「なぜ必要か」
⑧ 何が変わる？            「誰に」「何が」の形で2〜3個、アイコン付き
⑨ 用語メモ                この記事に出てきた用語を3〜6個、1行ずつ
⑩ 次の一歩                読者が実際に試せること
```

### 視覚的に理解できるようにするための仕掛け

| 仕掛け | 中身 |
|---|---|
| **手描き風アイコン 47種** | モデル・クラウド・鍵・時計・人・研究など。図のノード、要素技術、影響、たとえ話に付く |
| **数値の視覚化** | 「前 → 後」は棒グラフと改善率バッジ。単独の数字は大きなタイル。`1000000` は「100万」に自動整形 |
| **図解4種** | `flow`（順番）/ `compare`（対比）/ `layers`（積み重ね）/ `cycle`（繰り返し） |
| **中央＋4象限の要点** | ページ冒頭は、中央に集中線で囲んだ「今週の要点」、その周囲を4つの要点が囲む構図 |

### 紙面のきまり

[AWS Geek 風のグラフィックレコーディング](https://aws.amazon.com/jp/builders-flash/202309/awsgeek-aws-cdk/)を参照した意匠です。

- **白地にアンバー（`#f2a71b`）＋淡い水色（`#8dc0e4`）の2色主体。** 色数を絞って紙面を落ち着かせる
- **見出しは短冊リボン** — 両端に縦線の飾りが付いた帯
- **流れは塗りつぶしの三角矢印**（横幅が足りないときは自動で下向きに切り替わる）
- **アイコンは大きく**、マーカーで塗ったような不定形の色面の上に置く
- **文字は少なく、図で分からせる**

配色はすべて CSS カスタムプロパティなので、`scripts/lib/render.mjs` の `:root` を
書き換えれば紙面全体の色が変わります（ダークモード側も同じ変数名で定義済み）。

---

## 全体の流れ

```
Claude Code Routine（毎週土曜 07:00 JST / cron: 0 22 * * 5 UTC）
  │
  └─ /weekly-news スラッシュコマンドを実行
       │
       ├─ 1. collect.mjs          8つの情報源を並列取得 → 直近7日分 → 重複排除
       ├─ 2. prepare.mjs          情報源ごとのタスクに分割
       ├─ 3. news-curator × 7     【並列】日本語要約・重要度スコア・タグ付け
       ├─ 4. 全体サマリ            Claude が「今週の要点」を1つにまとめる
       ├─ 5. merge.mjs            採録24件を確定し、深掘り5件を選ぶ
       ├─ 6. prepare-explain.mjs  深掘り5件を1件ずつのタスクに切り出す
       ├─ 7. topic-explainer × 5  【並列】記事本文を読み、初心者向け解説を書く ★中心★
       ├─ 8. apply-explain.mjs    スキーマ検証のうえ確定データに差し込む
       ├─ 9. build-html.mjs       解説ページ＋一覧ページを生成
       ├─10. git push             GitHub Pages が自動で更新される
       └─11. notify-discord.mjs   Discord Webhook に通知
```

### なぜ「決定論的な処理」と「LLM の処理」を分けているのか

| 工程 | 担当 | 理由 |
|---|---|---|
| 取得・日付絞り込み・重複排除 | Node スクリプト | 毎回同じ結果になるべき処理。LLM に任せると取りこぼしや幻覚が起きる |
| 要約・重要度判定・タグ付け | `news-curator` | 「重要かどうか」は規則で書ききれない |
| 深掘り解説の執筆 | `topic-explainer` | 記事本文を読んで噛み砕く仕事。人間的な読みが要る |
| 図の描画・HTML 生成 | Node スクリプト | 見た目が毎週変わると読みにくい。テンプレートで固定する |

**図は LLM に SVG を書かせていません。** サブエージェントが返すのは
「図の型（flow / compare / layers / cycle）とラベルの組」「アイコンの名前」「数値」という
構造化データだけで、描画は `render.mjs` と `icons.mjs` が決定論的に行います。
これで毎週の見た目が安定し、崩れた図が出ることもありません。
一覧にないアイコン名や数値にならない値は `apply-explain.mjs` が捨てるため、
おかしなデータが返ってもページは壊れません。

LLM 工程が失敗しても

- 採点が欠ければ `merge.mjs` がキーワードベースの自動採点にフォールバック
- 解説が欠ければ `apply-explain.mjs` がその 1 本を落とし、残りでページを組む

ので、**サイトが空になることはありません**。

---

## 情報源

| 情報源 | 取得方法 | URL |
|---|---|---|
| Anthropic News | HTML スクレイピング（RSS 非提供） | https://www.anthropic.com/news |
| OpenAI News | RSS | https://openai.com/news/rss.xml |
| AWS Machine Learning Blog | RSS | https://aws.amazon.com/blogs/machine-learning/feed/ |
| AWS ML Blog（日本語） | RSS | https://aws.amazon.com/jp/blogs/machine-learning/feed/ |
| AWS Japan Blog | RSS | https://aws.amazon.com/jp/blogs/news/feed/ |
| Qiita（AI / 生成AI / LLM / Claude タグ） | Atom | https://qiita.com/tags/ai/feed |
| Zenn（AI トピック） | RSS | https://zenn.dev/topics/ai/feed |
| Hacker News | Algolia API | https://hn.algolia.com/api/v1/search_by_date |

> X（旧Twitter）は無料 API の新規提供が 2026年2月に終了したため対象外。

情報源の追加・削除は `scripts/lib/feeds.mjs` の `SOURCES` 配列を編集するだけです。

---

## ファイル構成

```
.claude/
  commands/weekly-news.md     Routine が実行する手順書（スラッシュコマンド）
  agents/news-curator.md      情報源1つを担当し、要約・採点するサブエージェント
  agents/topic-explainer.md   トピック1件を担当し、初心者向け解説を書くサブエージェント
scripts/
  collect.mjs                 情報源を並列取得 → .cache/raw-YYYY-MM-DD.json
  prepare.mjs                 情報源ごとのタスクに分割 → .cache/tasks/*.json
  merge.mjs                   採点を統合し深掘り対象を選ぶ → data/YYYY-MM-DD.json
  prepare-explain.mjs         深掘り対象を1件ずつに切り出す → .cache/explain-tasks/*.json
  apply-explain.mjs           解説を検証して確定データに差し込む
  build-html.mjs              解説ページ＋一覧ページを生成 → docs/
  notify-discord.mjs          Discord Webhook へ通知
  lib/
    feeds.mjs                 情報源の定義
    parse.mjs                 RSS / Atom / HTML / HN API のパーサ（依存ゼロ）
    icons.mjs                 手描き風インラインSVGアイコン47種
    score.mjs                 LLM を使わないフォールバック採点
    render.mjs                グラレコ風レンダラ（インライン SVG + CSS）
    util.mjs                  JST 変換・URL 正規化・リトライ付き fetch
data/YYYY-MM-DD.json          週次レポートの確定データ（コミットする）
docs/                         GitHub Pages の公開ディレクトリ
```

---

## 手元で動かす

Node.js 20 以上のみ必要です（npm install 不要 / 依存パッケージゼロ）。

```bash
# LLM を使わずパイプライン全体を通す（動作確認用。解説は生成されない）
npm run pipeline:nollm

# 個別に実行
node scripts/collect.mjs --days 7              # 収集
node scripts/prepare.mjs --max 12              # 情報源ごとに最大12件へ絞る
node scripts/merge.mjs --top 24 --maxPerSource 5 --featured 5
node scripts/prepare-explain.mjs               # 深掘りタスクを切り出す
node scripts/apply-explain.mjs                 # 解説を差し込む
node scripts/build-html.mjs                    # 2ページ生成
node scripts/notify-discord.mjs --dry-run      # 送信せずペイロードを表示

# Claude Code 上で LLM 込みのフル実行
/weekly-news
```

生成された `docs/index.html` をブラウザで開けば見た目を確認できます。

---

## 設定

### 環境変数

| 変数 | 必須 | 用途 |
|---|---|---|
| `DISCORD_WEBHOOK_URL_WEEKLY_NEWS` | 通知する場合のみ | Discord Webhook URL。**リポジトリには保存しない** |
| `PAGES_BASE_URL` | 任意 | 公開 URL のベース。既定 `https://kskrm.github.io/claude-agent-sdk-demo/docs` |

### GitHub Pages

リポジトリの **Settings → Pages** で

- Source: `Deploy from a branch`
- Branch: `main` / `/ (root)`

ルート配信なので README がトップページになり、サイトは `/docs/` 配下で公開されます。

Branch を `/docs` に変更した場合は、サイトがリポジトリ直下の URL で公開されるため、
環境変数 `PAGES_BASE_URL=https://kskrm.github.io/claude-agent-sdk-demo` を設定してください。

### 週次 Routine

Claude Code の Routine 機能で、毎週土曜 07:00 JST（UTC では金曜 22:00 = `0 22 * * 5`）に
`/weekly-news` を実行するよう登録します。
Routine は毎回まっさらなセッションで起動するため、手順はすべて `.claude/commands/weekly-news.md` に
書かれており、セッションをまたいだ記憶に依存しません。

---

## チューニング

| やりたいこと | 変更する場所 |
|---|---|
| 解説の本数を変える | `node scripts/merge.mjs --featured 3` |
| 情報源を足す・外す | `scripts/lib/feeds.mjs` の `SOURCES` |
| 対象期間を変える | `node scripts/collect.mjs --days 14` |
| 一覧の採録件数を変える | `node scripts/merge.mjs --top 30` |
| 1情報源の偏りを調整 | `node scripts/merge.mjs --maxPerSource 3` |
| **解説の書き方・読者像を変える** | `.claude/agents/topic-explainer.md` |
| 重要度の判定基準を変える | `.claude/agents/news-curator.md` のスコア表 |
| 自動採点のキーワードを変える | `scripts/lib/score.mjs` の `KEYWORDS` |
| 図の見た目を変える | `scripts/lib/render.mjs` の `renderDiagram()` |
| 数値タイルの見た目を変える | `scripts/lib/render.mjs` の `renderMetric()` |
| アイコンを足す | `scripts/lib/icons.mjs` に24x24のパスを追加し、`topic-explainer.md` の一覧にも追記 |
| 配色を変える | `scripts/lib/render.mjs` の `:root` と `[data-theme="dark"]` |
| 全体の見た目を変える | `scripts/lib/render.mjs` の `css` |

### 図の型を足したいとき

1. `.claude/agents/topic-explainer.md` の「型の選び方」に新しい型を追記
2. `scripts/apply-explain.mjs` の `DIAGRAM_TYPES` に型名を追加し、`normalizeDiagram()` に検証を追加
3. `scripts/lib/render.mjs` の `renderDiagram()` に描画を追加

### アイコンを足したいとき

1. `scripts/lib/icons.mjs` の `ICONS` に `名前: 'SVGのパス'` を追加（24x24 の viewBox、線画のみ）
2. `.claude/agents/topic-explainer.md` のアイコン名一覧の表に名前を追記

一覧にない名前をサブエージェントが返しても、`apply-explain.mjs` が捨てるだけなので
ページは壊れません（アイコンが省かれるだけ）。

---

## ライセンス

MIT
