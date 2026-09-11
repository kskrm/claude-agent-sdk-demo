"""エントリポイント。Claude Agent SDK を回して週次レポートを生成する。

実行:
    uv run python -m ai_weekly.main              # 収集 → HTML 生成 → Discord 通知
    uv run python -m ai_weekly.main --skip-agent # 既存 JSON から HTML だけ作り直す
    uv run python -m ai_weekly.main --no-notify  # 通知せずに生成だけ
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

from . import config, notify, prompts, render
from .tools import ALLOWED_TOOL_NAMES, feed_server

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
DOCS_DIR = ROOT / "docs"


async def collect(since: str, until: str, output_path: Path) -> None:
    """AI に情報収集させ、結果を JSON ファイルとして書かせる。"""

    options = ClaudeAgentOptions(
        # ① AI の役割設定
        system_prompt=prompts.SYSTEM_PROMPT,
        model=config.ORCHESTRATOR_MODEL,
        # ② 自作ツールを登録。キー "feeds" が mcp__feeds__... の feeds になる
        mcp_servers={"feeds": feed_server},
        # ③ 許可する道具。ここに書かれていない道具は AI からは使えない
        allowed_tools=[
            "WebFetch",      # Anthropic の一覧ページを読むのに必要
            "WebSearch",     # 裏取り用
            "Read",          # 書いた JSON を読み直して検証させる
            "Write",         # JSON を書き出す
            "Task",          # サブエージェントを起動する道具
            *ALLOWED_TOOL_NAMES,
        ],
        # ④ 部下エージェントの定義
        agents=prompts.AGENTS,
        # ⑤ 作業フォルダ。ここより外のファイルには触れない
        cwd=str(ROOT),
        permission_mode="acceptEdits",  # ③で許可した範囲の書き込みを自動承認
        max_turns=80,
    )

    task = prompts.build_task_prompt(
        since=since, until=until, output_path=str(output_path.relative_to(ROOT))
    )

    print(f"[agent] 収集開始: {since} 〜 {until}")

    # ⑥ ここが「エージェントループ」。SDK が 考える→道具を使う→結果を見る を自動で繰り返す
    async for message in query(prompt=task, options=options):
        if isinstance(message, SystemMessage) and message.subtype == "init":
            servers = message.data.get("mcp_servers", [])
            print(f"[agent] MCP: {[(s.get('name'), s.get('status')) for s in servers]}")

        elif isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text = block.text.strip()
                    if text:
                        print(f"[think] {text[:160]}")
                elif isinstance(block, ToolUseBlock):
                    print(f"[tool ] {block.name}")

        elif isinstance(message, ResultMessage):
            cost = getattr(message, "total_cost_usd", None)
            print(f"[agent] 終了: {message.subtype}" + (f" / ${cost:.4f}" if cost else ""))
            if message.subtype != "success":
                raise RuntimeError(f"エージェントが異常終了しました: {message.subtype}")


def main() -> int:
    parser = argparse.ArgumentParser(description="AI 業界の週次トレンドレポートを生成する")
    parser.add_argument("--skip-agent", action="store_true", help="収集を飛ばし既存 JSON を使う")
    parser.add_argument("--no-notify", action="store_true", help="Discord 通知をしない")
    parser.add_argument("--date", default=None, help="基準日 YYYY-MM-DD（既定: 今日）")
    args = parser.parse_args()

    until_date = date.fromisoformat(args.date) if args.date else date.today()
    since_date = until_date - timedelta(days=config.LOOKBACK_DAYS)
    slug = until_date.isoformat()

    DATA_DIR.mkdir(exist_ok=True)
    json_path = DATA_DIR / f"{slug}.json"

    if not args.skip_agent:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ERROR: 環境変数 ANTHROPIC_API_KEY が未設定です", file=sys.stderr)
            return 1
        asyncio.run(collect(since_date.isoformat(), until_date.isoformat(), json_path))

    if not json_path.exists():
        print(f"ERROR: {json_path} がありません", file=sys.stderr)
        return 1

    report = render.load_report(json_path)
    index = render.write_site(report, DOCS_DIR, slug)
    print(f"[render] {index} を生成しました（{len(report['items'])}件）")

    if not args.no_notify:
        site_url = os.environ.get("SITE_BASE_URL", "").rstrip("/")
        notify.notify(report, f"{site_url}/" if site_url else "")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
