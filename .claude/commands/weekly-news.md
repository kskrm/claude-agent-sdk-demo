---
description: AI業界トレンドを直近7日分収集し、主要トピックを初心者向けに深掘り解説したグラレコ風サイトを生成して GitHub Pages へ公開し Discord に通知する（週次Routineの本体）
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# 週次 AI トレンド収集・解説パイプライン

リポジトリのルート（`claude-agent-sdk-demo`）で、以下を**上から順に**実行する。
途中で失敗しても、可能な限り後続を続行して「何かは必ず公開される」状態にすること。

このサイトの目的は**トピックを並べることではなく、主要なトピックを IT 初心者にも分かるように
かみ砕いて解説すること**。手順 4〜6 がこのパイプラインの中心。

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
**必ず 1 回のメッセージ内にすべての Agent 呼び出しをまとめて発行し、並列実行させること。**

各サブエージェントへのプロンプトは次の形にする。

> `.claude/agents/news-curator.md` を Read して、その役割・ルール・出力スキーマに厳密に従ってください。
> 担当タスクファイル: `.cache/tasks/<sourceId>.json`
> 出力先: `.cache/curated/<sourceId>.json`

完了後、出力が揃っているか確認する。

```bash
ls -1 .cache/curated/
```

欠けている情報源があれば、その情報源だけ再度起動する（2 回試して駄目なら諦めてよい。
`merge.mjs` が自動採点でフォールバックする）。

## 3. 全体サマリを書く

`.cache/curated/*.json` 全体に目を通し、**今週いちばん重要な流れ**を 1 つの見出しにまとめて
`.cache/overview.json` を Write する。これがページ中央の「今週の要点」になる。

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

## 4. 確定データを作り、深掘り対象を決める

```bash
node scripts/merge.mjs
node scripts/prepare-explain.mjs
cat .cache/explain-manifest.json
```

`merge.mjs` がスコア上位から 5 件（1 情報源あたり最大 2 件）を深掘り対象に選び、
`prepare-explain.mjs` が 1 件ずつのタスクファイルに切り出す。

## 5. サブエージェントを並列起動して深掘り解説を書かせる ★ここが中心★

`explain-manifest.json` の**タスク 1 件につき 1 つ**、`topic-explainer` サブエージェントを起動する。
ここも**必ず 1 回のメッセージ内にまとめて発行して並列実行させる**こと。

各サブエージェントへのプロンプトは次の形にする。

> `.claude/agents/topic-explainer.md` を Read して、その役割・ルール・出力スキーマに厳密に従ってください。
> あなたはそのファイルが定義する「IT初心者向けの技術ライター」です。
> 担当タスクファイル: `.cache/explain-tasks/<id>.json`
> 出力先: `.cache/explained/<id>.json`
> タスクファイルを Read し、`url` を WebFetch で本文まで読んだうえで、スキーマどおりの JSON を Write してください。

完了後、出力を確認する。

```bash
ls -1 .cache/explained/
node scripts/apply-explain.mjs
```

`apply-explain.mjs` は不正な値を落として `data/<RUN_DATE>.json` に差し込み、
各件の**図の種類・数値の個数・要素技術の数**をログに出す。**そのログを必ず確認すること。**

このページは文章だけでは読まれない。見て分かる状態になっているかを、ここで確認する。

- 「図: なし」が出た件は、図の仕様が壊れている。その 1 件だけ再度起動する。
- **「数値 0 件」の件**は、記事に数字があるのに拾えていない可能性が高い。記事を確認し、
  数字があるならその 1 件だけ `metrics` を必ず入れるよう指示して再度起動する。
- **5 件すべてが同じ図の型（例: 全部 `compare`）になっていたら**、内容的に `flow` `layers`
  `cycle` のほうが正確なものを 1〜2 件選び、型を指定して書き直させる。図が全部同じだと読み手が飽きる。
  型を指定するときは「この記事は手続きの話なので `flow` か `cycle` を選び、`compare` は選ばないこと」
  のように、理由とあわせて伝える。
- 要素技術（`concepts`）が 0 件の件があれば、その 1 件だけ再度起動する。

アイコン名が一覧外だった場合は `apply-explain.mjs` が黙って捨てる（アイコンが省かれるだけで
ページは壊れない）ので、再実行は不要。

## 6. HTML の生成

```bash
node scripts/build-html.mjs
```

2 ページできる。

- `docs/<RUN_DATE>.html` … 深掘り解説（メイン）。`docs/index.html` にも複製される
- `docs/<RUN_DATE>-list.html` … 今週集めたトピックの一覧（サブ）

## 7. コミットして公開

```bash
git add data docs
git commit -m "chore(weekly): AI業界トレンド週次レポート <RUN_DATE>"
git push -u origin main
```

GitHub Pages が数十秒で更新される。

## 8. Discord 通知

```bash
node scripts/notify-discord.mjs
```

Webhook URL は環境変数 `DISCORD_WEBHOOK_URL_WEEKLY_NEWS` から読む。
**URL をファイルに書き込んだりログに出したりしないこと。**
未設定の場合は送信がスキップされ、ペイロードが標準出力に出るだけで終わる。

## 9. 報告

最後に次の 6 行だけを報告する。長い要約は不要（サイト本体が成果物）。

- 収集件数 / 採録件数 / 解説本数
- サブエージェント採点件数 / フォールバック件数
- 深掘り 5 本の見出し
- 図の型の内訳（例: flow 2 / compare 2 / cycle 1）と、数値の総数
- 公開 URL
- Discord 通知の成否
