# AI Weekly — Claude Agent SDK 学習プロジェクト

毎週土曜 7:00(JST) に直近1週間の AI 業界トレンドを自動収集し、
HTML レポートを GitHub Pages に公開して Discord に通知します。

```
GitHub Actions (毎週土 07:00 JST)
   ↓
Claude Agent SDK
   ├─ news-scout ×5 を並列起動して各情報源を調査
   │    ├ Anthropic   … WebFetch で一覧ページを読む（公式RSSが無いため）
   │    ├ OpenAI      ┐
   │    ├ AWS ML Blog │ 自作ツール fetch_feed で RSS を取得
   │    ├ Qiita       │
   │    └ Zenn        ┘
   ├─ 重複排除・重要度付け・日本語要約
   └─ data/YYYY-MM-DD.json を出力
   ↓
render.py  → docs/index.html を生成（ライト/ダーク切替つき）
   ↓
git push → GitHub Pages で公開 → Discord Webhook で通知
```

## ディレクトリ構成

| パス | 役割 | 最初に読む順 |
|---|---|---|
| `src/ai_weekly/config.py` | 情報源と実行パラメータの定義 | 1 |
| `src/ai_weekly/tools.py` | **自作ツール**（RSS取得）。`@tool` の書き方の実例 | 2 |
| `src/ai_weekly/prompts.py` | **プロンプト設計**とサブエージェント定義 | 3 |
| `src/ai_weekly/main.py` | **エージェントループ本体**。`query()` の呼び出し | 4 |
| `src/ai_weekly/render.py` | JSON → HTML 変換 | 5 |
| `src/ai_weekly/notify.py` | Discord 通知 | 6 |
| `templates/report.html.j2` | HTML テンプレート | — |
| `.github/workflows/weekly-report.yml` | 週次実行の設定 | — |
| `data/*.json` | AI が出力した生データ | — |
| `docs/` | 公開される HTML（GitHub Pages の公開元） | — |

## セットアップ

### 1. ローカルで動かす

```bash
# 依存関係のインストール（uv を使用: https://docs.astral.sh/uv/）
uv sync

# API キーなどを設定
cp .env.example .env    # 中身を自分の値に書き換える
export $(grep -v '^#' .env | xargs)

# ① まず情報源の疎通確認（API 課金なし）
uv run python -m ai_weekly.tools --check

# ② HTML の描画だけ確認（API 課金なし。付属のサンプル JSON を使う）
uv run python -m ai_weekly.main --skip-agent --no-notify --date 2026-09-11
open docs/index.html

# ③ 本番実行（Claude API を消費します）
uv run python -m ai_weekly.main --no-notify
```

### 2. GitHub 側の設定

**Secrets**（Settings → Secrets and variables → Actions → New repository secret）

| 名前 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | https://platform.claude.com/ で発行したキー |
| `DISCORD_WEBHOOK_URL` | Discord: チャンネル設定 → 連携サービス → ウェブフック → URLをコピー |

**GitHub Pages**（Settings → Pages）

- Source: `Deploy from a branch`
- Branch: `main` / フォルダ `/docs`
- 公開先: `https://<ユーザー名>.github.io/claude-agent-sdk-demo/`

**動作確認**: Actions タブ → `AI Weekly Report` → `Run workflow` で手動実行できます。

## 実行コマンド

| コマンド | 動作 |
|---|---|
| `uv run python -m ai_weekly.main` | 収集 → HTML 生成 → Discord 通知 |
| `uv run python -m ai_weekly.main --skip-agent` | 既存 JSON から HTML だけ作り直す |
| `uv run python -m ai_weekly.main --no-notify` | 通知せず生成のみ |
| `uv run python -m ai_weekly.main --date 2026-09-11` | 基準日を指定 |
| `uv run python -m ai_weekly.tools --check` | 全 RSS の疎通確認 |

## あなたの実装ポイント（TODO）

コード中に `TODO(あなたの実装ポイント N)` として埋め込んであります。
上から順にやると、Agent SDK の要素を一通り触れます。

| # | 場所 | 内容 | 学べること |
|---|---|---|---|
| 1 | `config.py` | 情報源を追加する | 設定とコードの分離 |
| 2 | `tools.py` | RSS 要約の HTML タグを除去する | ツールの戻り値設計 |
| 3 | `prompts.py` | 選別基準・スコア基準の明文化、サブエージェント追加 | **プロンプト設計**（最重要） |
| 4 | `render.py` | 過去号の一覧ページを作る | 出力の拡張 |
| 5 | `notify.py` | 通知内容のカスタマイズ | 外部サービス連携 |

## コスト目安

親に Sonnet、子（調査役）に Haiku を使う構成です。1回あたり数十円程度を想定。
`config.py` の `ORCHESTRATOR_MODEL` / `SCOUT_MODEL` で変更できます。

## 参考

- [Claude Agent SDK 公式ドキュメント](https://code.claude.com/docs/en/agent-sdk/overview)
- [カスタムツールの作り方](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [MCP サーバの接続](https://code.claude.com/docs/en/agent-sdk/mcp)
