"""収集対象と実行パラメータの定義。

ここが「何を調べるか」を決める唯一の場所です。
情報源を増やしたいときは SOURCES にエントリを足すだけで、
プロンプトやツールのコードを触る必要はありません。
"""

from __future__ import annotations

from dataclasses import dataclass, field

# 何日前までを「直近1週間」とみなすか
LOOKBACK_DAYS = 7

# 使用モデル。"opus" / "sonnet" / "haiku" のエイリアスが使えます。
# 親（統括役）は判断力、子（調査役）は速度と費用を優先する構成。
ORCHESTRATOR_MODEL = "sonnet"
SCOUT_MODEL = "haiku"


@dataclass(frozen=True)
class Source:
    """情報源1つ分の定義。

    key    : 内部識別子
    label  : レポートに表示する名前
    kind   : "rss" なら自作ツールで取得、"web" なら AI が WebFetch で読む
    url    : RSS の URL、または一覧ページの URL
    focus  : この情報源から特に拾ってほしい内容（プロンプトに埋め込まれる）
    limit  : 1回あたり何件まで見るか（トークン節約のため）
    """

    key: str
    label: str
    kind: str
    url: str
    focus: str
    limit: int = 20


SOURCES: list[Source] = [
    Source(
        key="anthropic",
        label="Anthropic",
        # Anthropic は 2026-09 時点で公式 RSS を提供していないため、
        # 一覧ページを AI に読ませて記事を抽出する方式にしている。
        kind="web",
        url="https://www.anthropic.com/news",
        focus="モデルの新リリース、Claude / Agent SDK の新機能、安全性に関する研究発表",
        limit=15,
    ),
    Source(
        key="openai",
        label="OpenAI",
        kind="rss",
        url="https://openai.com/news/rss.xml",
        focus="モデルの新リリース、API の新機能、製品アップデート",
        limit=20,
    ),
    Source(
        key="aws_ml",
        label="AWS Machine Learning Blog",
        kind="rss",
        url="https://aws.amazon.com/blogs/machine-learning/feed/",
        focus="Bedrock / SageMaker / Strands Agents など、AWS 上での生成AI活用",
        limit=25,
    ),
    Source(
        key="qiita",
        label="Qiita",
        kind="rss",
        url="https://qiita.com/tags/ai/feed",
        focus="日本語圏の実装ノウハウ、新ツールの検証記事",
        limit=30,
    ),
    Source(
        key="zenn",
        label="Zenn",
        kind="rss",
        url="https://zenn.dev/topics/ai/feed",
        focus="日本語圏の実装ノウハウ、アーキテクチャ解説",
        limit=30,
    ),
]

# ---------------------------------------------------------------------------
# TODO(あなたの実装ポイント 1)
#   情報源を追加してみましょう。RSS を持つサイトなら kind="rss" で足すだけです。
#   候補: Google AI Blog       https://blog.google/technology/ai/rss/
#         Hugging Face Blog    https://huggingface.co/blog/feed.xml
#         GitHub Blog (AI)     https://github.blog/ai-and-ml/feed/
#   追加したら `uv run python -m ai_weekly.tools --check` で疎通確認できます。
# ---------------------------------------------------------------------------


def rss_sources() -> list[Source]:
    return [s for s in SOURCES if s.kind == "rss"]


def web_sources() -> list[Source]:
    return [s for s in SOURCES if s.kind == "web"]
