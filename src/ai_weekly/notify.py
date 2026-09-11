"""Discord への通知。

Discord の Webhook は「URL に JSON を POST するだけ」で投稿できます。
API キーもライブラリも不要なので、通知先として最も手軽です。

取得方法: Discord → チャンネルの歯車 → 連携サービス → ウェブフック
          → 新しいウェブフック → ウェブフックURLをコピー
"""

from __future__ import annotations

import os
from typing import Any

import httpx

MAX_ITEMS = 5


def build_payload(report: dict[str, Any], site_url: str) -> dict[str, Any]:
    """Discord の embed（カード表示）を組み立てる。"""
    period = report.get("period", {})
    top = report["items"][:MAX_ITEMS]

    lines = [
        f"**{i}. [{(it.get('title_ja') or it['title'])}]({it['url']})**\n"
        f"`{it['source']}` {'★' * it['importance']}\n{it['summary']}"
        for i, it in enumerate(top, start=1)
    ]

    highlights = report.get("highlights") or []
    description = "\n".join(f"- {h}" for h in highlights[:3])

    return {
        "username": "AI Weekly",
        "embeds": [
            {
                "title": f"AI Weekly: {period.get('from', '')} 〜 {period.get('to', '')}",
                "url": site_url,
                "description": description[:4000],
                "color": 0xC15F3C,
                "fields": [
                    {"name": f"注目 {len(top)}件", "value": "\n\n".join(lines)[:1024]}
                ],
                "footer": {"text": f"全{len(report['items'])}件 — 詳細はレポートページへ"},
            }
        ],
    }


def notify(report: dict[str, Any], site_url: str) -> bool:
    """Webhook URL が設定されていれば投稿する。未設定ならスキップ。"""
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print("[notify] DISCORD_WEBHOOK_URL 未設定のため通知をスキップしました")
        return False

    response = httpx.post(webhook, json=build_payload(report, site_url), timeout=30.0)
    if response.status_code >= 300:
        print(f"[notify] 失敗: HTTP {response.status_code} {response.text[:200]}")
        return False
    print("[notify] Discord に投稿しました")
    return True


# ---------------------------------------------------------------------------
# TODO(あなたの実装ポイント 5)
#   通知内容を好みに合わせて変えてみましょう。
#   例: importance が 5 の記事だけ通知する / タグごとに分けて投稿する
#       0件だった週は「今週は目立った動きなし」とだけ送る
#   embed の仕様: https://discord.com/developers/docs/resources/message#embed-object
# ---------------------------------------------------------------------------
