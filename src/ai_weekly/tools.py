"""AI に渡す自作ツール（SDK MCP サーバ）。

【この章の読み方】
  @tool(...)          ... 直下の関数を「AI が呼べる道具」に変えるデコレータ
    第1引数 name      ... AI が呼ぶときの ID
    第2引数 description ... ★最重要。AI はコードではなくこの説明文を読んで
                            「今これを使うべきか」を判断する
    第3引数 schema    ... AI に埋めさせる引数の型
  戻り値の形は固定     ... {"content": [{"type": "text", "text": "..."}]}
                            この text がそのまま AI の目に入る
  create_sdk_mcp_server(...) ... 道具をまとめて1つのサーバにする
  → main.py 側で  mcp_servers={"feeds": feed_server}  と登録し、
     allowed_tools=["mcp__feeds__fetch_feed"]  で使用を許可する
     （mcp__ + サーバ名 + __ + 道具名。アンダースコアは2本）
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import feedparser
import httpx
from claude_agent_sdk import ToolAnnotations, create_sdk_mcp_server, tool

from . import config

_UA = "ai-weekly-bot/0.1 (+https://github.com/kskrm/claude-agent-sdk-demo)"


def _within_period(entry: Any, since: datetime) -> bool:
    """記事が指定日時より新しいかを判定する。日付が取れないものは残す。"""
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return True
    published = datetime(*parsed[:6], tzinfo=timezone.utc)
    return published >= since


def _entry_date(entry: Any) -> str:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return "unknown"
    return datetime(*parsed[:6], tzinfo=timezone.utc).strftime("%Y-%m-%d")


@tool(
    "fetch_feed",
    (
        "指定した RSS/Atom フィードから、直近 days 日以内に公開された記事の "
        "タイトル・URL・公開日・冒頭要約を取得する。"
        "AI 業界の新着情報を情報源ごとに収集するために使う。"
        "引数 days は省略可能（既定 7）。limit も省略可能（既定 20）。"
    ),
    # Python の簡易スキーマは「書いた項目 = 全部必須」。
    # days と limit は任意にしたいので、あえてここには書かず
    # 説明文で触れて、下の handler で args.get() から読む。
    {"url": str},
    annotations=ToolAnnotations(readOnlyHint=True),  # 副作用なし → 並列実行を許可
)
async def fetch_feed(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    days = int(args.get("days", config.LOOKBACK_DAYS))
    limit = int(args.get("limit", 20))
    since = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True, headers={"User-Agent": _UA}
        ) as client:
            response = await client.get(url)
        if response.status_code != 200:
            # 例外を投げっぱなしにせず is_error で返すと、
            # AI が「別の情報源に切り替える」等の判断をできる。
            return {
                "content": [
                    {"type": "text", "text": f"取得失敗: HTTP {response.status_code} ({url})"}
                ],
                "is_error": True,
            }
        feed = feedparser.parse(response.content)
    except Exception as exc:  # noqa: BLE001 - AI に読ませるメッセージを組み立てる
        return {
            "content": [{"type": "text", "text": f"取得失敗: {exc} ({url})"}],
            "is_error": True,
        }

    entries = [e for e in feed.entries if _within_period(e, since)][:limit]
    if not entries:
        return {
            "content": [
                {"type": "text", "text": f"{url} に直近{days}日以内の新着記事はありませんでした。"}
            ]
        }

    # AI が読みやすい整形済みテキストで返す。
    # 生 JSON をそのまま返すとトークンを浪費するので避ける。
    lines = [f"# {feed.feed.get('title', url)} — 直近{days}日 / {len(entries)}件"]
    for entry in entries:
        summary = (entry.get("summary", "") or "").strip().replace("\n", " ")
        # TODO(あなたの実装ポイント 2)
        #   summary には HTML タグが混ざることがあります。
        #   タグを除去して読みやすくしてみてください（html.unescape / 正規表現 / bs4 など）。
        lines.append(
            f"\n- title: {entry.get('title', '(no title)')}\n"
            f"  url: {entry.get('link', '')}\n"
            f"  date: {_entry_date(entry)}\n"
            f"  excerpt: {summary[:300]}"
        )

    return {"content": [{"type": "text", "text": "\n".join(lines)}]}


# 道具をサーバにまとめる（このプロセス内で動くので別途起動は不要）
feed_server = create_sdk_mcp_server(
    name="feeds",
    version="1.0.0",
    tools=[fetch_feed],
)

# main.py から参照する許可リスト
ALLOWED_TOOL_NAMES = ["mcp__feeds__fetch_feed"]


async def _check() -> None:
    """`uv run python -m ai_weekly.tools --check` で全フィードの疎通を確認する。"""
    for source in config.rss_sources():
        # @tool を付けた関数は SdkMcpTool オブジェクトになるため、
        # 素の関数として呼ぶときは .handler を経由する。
        result = await fetch_feed.handler(
            {"url": source.url, "days": config.LOOKBACK_DAYS, "limit": 3}
        )
        head = result["content"][0]["text"].splitlines()[0]
        mark = "NG" if result.get("is_error") else "OK"
        print(f"[{mark}] {source.label}: {head}")


if __name__ == "__main__":
    import sys

    if "--check" in sys.argv:
        asyncio.run(_check())
    else:
        print("usage: python -m ai_weekly.tools --check")
