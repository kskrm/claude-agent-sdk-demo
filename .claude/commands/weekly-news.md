---
description: AI業界トレンドを直近7日分収集し、グラレコ風HTMLを生成して GitHub Pages へ公開し Discord に通知する（週次Routineの本体）
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# 週次 AI トレンド収集パイプライン

リポジトリのルート（`claude-agent-sdk-demo`）で、以下を**上から順に**実行する。
途中で失敗しても、可能な限り後続を続行して「何かは必ず公開される」状態にすること。

## 0. 準備

```bash
git checkout main && git pull origin main
```

実行日（JST）を `RUN_DATE` とする。`date -u -d '+9 hours' +%F` で求められる。

## 1. 収集（決定論的・LLM不使用）

```bash
node scripts/collect.mjs
node scripts/prepare.mjs
cat .cache/manifest.json
```

`manifest.json` の `tasks` 配列に、情報源ごとのタスクファイルが並ぶ。

## 2. サブエージェントを並列起動して採点・要約

`manifest.json` の**タスク 1 件につき 1 つ**、`news-curator` サブエージェントを起動する。
**必ず 1 回のメッセージ内ですべての Agent 呼び出しをまとめて発行し、並列実行させること。**
逐次起動すると所要時間が情報源の数だけ伸びる。

各サブエージェントへのプロンプトは次の形にする。

> `.cache/tasks/<sourceId>.json` を担当してください。
> 指示どおり採点・日本語要約し、`.cache/curated/<sourceId>.json` に書き出してください。

全サブエージェントの完了後、出力が揃っているか確認する。

```bash
ls -1 .cache/curated/
```

欠けている情報源があれば、その情報源だけ再度起動する（2 回試して駄目なら諦めてよい。
`merge.mjs` が自動採点でフォールバックする）。

## 3. 全体サマリを書く

`.cache/curated/*.json` 全体に目を通し、**今週いちばん重要な流れ**を 1 つの見出しにまとめて
`.cache/overview.json` を Write する。これがレポート中央の「今週の要点」になる。

```json
{
  "headline": "今週の最大の動き（40字以内・体言止め可）",
  "summaryJa": "全体の流れを 120〜200 字で。個別記事の羅列ではなく『今週何が起きたか』を書く。",
  "keyPoints": [
    { "label": "見出し（10字以内）", "text": "要点を 50 字以内で" }
  ]
}
```

`keyPoints` は 3〜4 個。付箋として表示されるので短く切ること。

## 4. 確定データと HTML の生成

```bash
node scripts/merge.mjs
node scripts/build-html.mjs
```

`data/<RUN_DATE>.json` と `docs/<RUN_DATE>.html` / `docs/index.html` ができる。
`merge.mjs` のログで「サブエージェント採点 N 件」が 0 になっていたら、手順 2 の出力が
読めていないので `.cache/curated/` を確認する。

## 5. コミットして公開

```bash
git add data docs
git commit -m "chore(weekly): AI業界トレンド週次レポート <RUN_DATE>"
git push -u origin main
```

GitHub Pages（main ブランチの `/docs`）が数十秒で更新される。

## 6. Discord 通知

```bash
node scripts/notify-discord.mjs
```

Webhook URL は環境変数 `DISCORD_WEBHOOK_URL_WEEKLY_NEWS` から読む。
**URL をファイルに書き込んだりログに出したりしないこと。**
未設定の場合は送信がスキップされ、ペイロードが標準出力に出るだけで終わる。

## 7. 報告

最後に次の 5 行だけを報告する。長い要約は不要（レポート本体が成果物）。

- 収集件数 / 採録件数
- サブエージェント採点件数 / フォールバック件数
- 今週の見出し（`headline`）
- 公開 URL
- Discord 通知の成否
