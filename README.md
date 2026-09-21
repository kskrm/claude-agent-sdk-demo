# AI業界トレンド 週次自動収集

毎週土曜 07:00 JST に AI 業界の情報を自動収集し、**グラレコ（グラフィックレコーディング）風の HTML レポート**を
GitHub Pages に公開して Discord に通知する仕組みです。

📖 **公開レポート: https://kskrm.github.io/claude-agent-sdk-demo/**

---

## 全体の流れ

```
Claude Code Routine（毎週土曜 07:00 JST / cron: 0 22 * * 5 UTC）
  │
  └─ /weekly-news スラッシュコマンドを実行
       │
       ├─ 1. collect.mjs    8つの情報源を並列取得 → 直近7日分に絞る → 重複排除
       ├─ 2. prepare.mjs    情報源ごとのタスクファイルに分割
       ├─ 3. サブエージェント並列起動（情報源の数だけ同時に走る）
       │       news-curator が日本語要約・重要度スコア・タグ付けを担当
       ├─ 4. 全体サマリ      Claude が「今週の要点」を1つにまとめる
       ├─ 5. merge.mjs      data/YYYY-MM-DD.json を確定
       ├─ 6. build-html.mjs docs/*.html（グラレコ風）を生成
       ├─ 7. git push       GitHub Pages が自動で更新される
       └─ 8. notify-discord.mjs  Discord Webhook に通知
```

### なぜ「決定論的な処理」と「LLM の処理」を分けているのか

| 工程 | 担当 | 理由 |
|---|---|---|
| 取得・日付絞り込み・重複排除 | Node スクリプト | 毎回同じ結果になるべき処理。LLM に任せると取りこぼしや幻覚が起きる |
| 要約・重要度判定・タグ付け | サブエージェント（LLM） | 「重要かどうか」は規則で書ききれない。人間的な判断が要る |
| HTML 生成 | Node スクリプト | 見た目が毎週変わると読みにくい。テンプレートで固定する |

LLM 工程が失敗しても、`merge.mjs` がキーワードベースの自動採点にフォールバックするので
**レポートが 0 件になることはありません**。

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
  commands/weekly-news.md   Routine が実行する手順書（スラッシュコマンド）
  agents/news-curator.md    情報源1つを担当するサブエージェントの定義
scripts/
  collect.mjs               情報源を並列取得 → .cache/raw-YYYY-MM-DD.json
  prepare.mjs               情報源ごとのタスクに分割 → .cache/tasks/*.json
  merge.mjs                 サブエージェント出力を統合 → data/YYYY-MM-DD.json
  build-html.mjs            グラレコ風HTMLを生成 → docs/*.html
  notify-discord.mjs        Discord Webhook へ通知
  lib/
    feeds.mjs               情報源の定義
    parse.mjs               RSS / Atom / HTML / HN API のパーサ（依存ゼロ）
    score.mjs               LLM を使わないフォールバック採点
    render.mjs              グラレコ風レンダラ（インライン SVG + CSS）
    util.mjs                JST 変換・URL 正規化・リトライ付き fetch
data/YYYY-MM-DD.json        週次レポートの確定データ（コミットする）
docs/                       GitHub Pages の公開ディレクトリ
```

---

## 手元で動かす

Node.js 20 以上のみ必要です（npm install 不要 / 依存パッケージゼロ）。

```bash
# LLM を使わずパイプライン全体を通す（動作確認用）
npm run pipeline:nollm

# 個別に実行
node scripts/collect.mjs --days 7          # 収集
node scripts/prepare.mjs --max 12          # 情報源ごとに最大12件へ絞る
node scripts/merge.mjs --top 24 --maxPerSource 5
node scripts/build-html.mjs
node scripts/notify-discord.mjs --dry-run  # 送信せずペイロードを表示

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
| `PAGES_BASE_URL` | 任意 | 公開 URL のベース。既定 `https://kskrm.github.io/claude-agent-sdk-demo` |

### GitHub Pages の有効化（初回のみ）

リポジトリの **Settings → Pages** で

- Source: `Deploy from a branch`
- Branch: `main` / `/docs`

を選んで Save します。

### 週次 Routine

Claude Code の Routine 機能で、毎週土曜 07:00 JST（UTC では金曜 22:00 = `0 22 * * 5`）に
`/weekly-news` を実行するよう登録します。
Routine は毎回まっさらなセッションで起動するため、手順はすべて `.claude/commands/weekly-news.md` に
書かれており、セッションをまたいだ記憶に依存しません。

---

## チューニング

| やりたいこと | 変更する場所 |
|---|---|
| 情報源を足す・外す | `scripts/lib/feeds.mjs` の `SOURCES` |
| 対象期間を変える | `node scripts/collect.mjs --days 14` |
| 採録件数を変える | `node scripts/merge.mjs --top 30` |
| 1情報源の偏りを調整 | `node scripts/merge.mjs --maxPerSource 3` |
| 重要度の判定基準を変える | `.claude/agents/news-curator.md` のスコア表 |
| 自動採点のキーワードを変える | `scripts/lib/score.mjs` の `KEYWORDS` |
| 見た目を変える | `scripts/lib/render.mjs` の `css` / SVG パーツ |

---

## ライセンス

MIT
