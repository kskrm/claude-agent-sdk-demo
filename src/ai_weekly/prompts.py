"""プロンプト設計とサブエージェント定義。

【この章の読み方】
  system_prompt   ... AI の「役割・性格・守るべきルール」。毎回必ず読まれる。
  task prompt     ... 今回やってほしい具体的な指示。
  AgentDefinition ... 部下エージェントの定義。
       description : 親がこれを読んで「この部下に振るか」を判断する
       prompt      : 部下自身の system_prompt
       tools       : 部下に渡す道具（親より狭くできる = 安全）
       model       : 部下だけ安いモデルにして費用を抑えられる
"""

from __future__ import annotations

import json

from claude_agent_sdk import AgentDefinition

from . import config

# 出力してほしい JSON の形。プロンプトにそのまま埋め込む。
OUTPUT_SCHEMA = {
    "period": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
    "highlights": ["今週の要点を3つ、各60字程度の日本語で"],
    "items": [
        {
            "title": "記事タイトル（原題のまま）",
            "title_ja": "日本語タイトル（原題が英語の場合のみ。日本語記事は原題と同じでよい）",
            "url": "記事URL",
            "source": "情報源のラベル（Anthropic / OpenAI / AWS Machine Learning Blog / Qiita / Zenn）",
            "date": "YYYY-MM-DD",
            "summary": "日本語2〜3文の要約。何が新しいのかを具体的に書く",
            "why": "なぜ注目に値するかを1文で",
            "importance": "1〜5の整数。5が最重要",
            "tags": ["モデル / エージェント / 開発ツール / 研究 / 事例 の中から1〜3個を選び配列にする"],
        }
    ],
}


SYSTEM_PROMPT = """あなたは AI 業界を専門とするリサーチアナリストです。

厳守事項:
- 事実のみを書く。推測や誇張を混ぜない。
- すべての項目に必ず実在する URL を付ける。URL を捏造してはいけない。
- 取得できなかった情報源があれば、黙って省略せず報告する。
- 出力は日本語。ただし製品名・固有名詞は原語のまま残す。
- 同じ話題を扱った複数記事は1件にまとめ、最も一次情報に近いものを URL に採用する。
"""


def build_task_prompt(since: str, until: str, output_path: str) -> str:
    """今週分のレポートを作らせる指示文を組み立てる。"""
    rss_lines = "\n".join(
        f"- {s.label}: fetch_feed(url=\"{s.url}\", days={config.LOOKBACK_DAYS}, limit={s.limit})"
        f" / 注目点: {s.focus}"
        for s in config.rss_sources()
    )
    web_lines = "\n".join(
        f"- {s.label}: WebFetch で {s.url} を読み、{since} 以降に公開された記事を抽出する"
        f" / 注目点: {s.focus}"
        for s in config.web_sources()
    )

    return f"""{since} から {until} までの1週間の AI 業界トレンドをまとめてください。

## 手順

1. 収集: 以下の情報源をすべて調べる。情報源ごとに news-scout サブエージェントへ並列に振ること。

### RSS（mcp__feeds__fetch_feed ツールを使う）
{rss_lines}

### Web ページ（WebFetch を使う）
{web_lines}

2. 選別: 集めた記事から、AI 業界の動向として重要なものを **12〜20件** 選ぶ。
   - 単なる宣伝記事、内容の薄い紹介記事は除外する。
   - 同一話題の重複はまとめる。
   - 日本語圏（Qiita / Zenn）からは必ず3件以上含める。

3. 出力: 次のスキーマに従った JSON だけを `{output_path}` に Write ツールで書き込む。
   JSON 以外の文字（```json などのコードフェンスを含む）を一切混ぜないこと。

```
{json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}
```

4. 書き込み後、Read ツールで読み直して JSON として壊れていないことを確認する。

## 完了条件
`{output_path}` に妥当な JSON が存在し、items が12件以上あること。
"""


# ---------------------------------------------------------------------------
# サブエージェント（部下）の定義
# ---------------------------------------------------------------------------
AGENTS: dict[str, AgentDefinition] = {
    "news-scout": AgentDefinition(
        description=(
            "1つの情報源を担当して直近の記事を収集する調査員。"
            "情報源ごとに1体ずつ並列で起動して使う。"
        ),
        prompt=(
            "あなたは1つの情報源だけを担当する調査員です。\n"
            "指示された情報源から記事を取得し、AI 業界の動向として意味のあるものだけを\n"
            "「タイトル / URL / 公開日 / 日本語で2文の要約 / 重要度1-5」の形式で列挙して返してください。\n"
            "自分で選別まで行い、明らかに宣伝目的の記事や内容の薄い記事は落としてください。\n"
            "URL は取得したものをそのまま使い、絶対に書き換えないこと。"
        ),
        tools=["WebFetch", "WebSearch", "mcp__feeds__fetch_feed"],  # 書き込み系は渡さない
        model=config.SCOUT_MODEL,
    ),
}

# ---------------------------------------------------------------------------
# TODO(あなたの実装ポイント 3) — プロンプト設計はここが本番です
#
#  (a) build_task_prompt の「2. 選別」の基準を、自分の関心に合わせて書き換える。
#      例:「エージェント開発に関わる話題を優先」「日本企業の事例を必ず1件含める」
#
#  (b) importance のスコアリング基準が今は曖昧です。明文化してみてください。
#      例: 5=新モデル/大型リリース, 4=主要APIの新機能, 3=有用な実装知見,
#          2=周辺ニュース, 1=参考程度
#
#  (c) サブエージェントをもう1体追加してみる。
#      例: "editor" = 集まった記事を読んで highlights(今週の要点3つ) だけを書く担当
#      AGENTS に足せば、親が必要に応じて自動で呼び分けます。
# ---------------------------------------------------------------------------
