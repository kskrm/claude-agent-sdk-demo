"""AI が出した JSON を検証し、HTML レポートに変換する。

AI に HTML を直接書かせず、いったん JSON を経由させているのは
毎回レイアウトが崩れないようにするため。
「AI は判断、プログラムは整形」と役割を分けるのが定石です。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = ROOT / "templates"

REQUIRED_ITEM_KEYS = {"title", "url", "source", "date", "summary"}
VALID_TAGS = {"モデル", "エージェント", "開発ツール", "研究", "事例"}


def load_report(json_path: Path) -> dict[str, Any]:
    """AI が書いた JSON を読み、壊れていれば分かるエラーを出す。"""
    raw = json_path.read_text(encoding="utf-8").strip()

    # AI が ```json ... ``` で囲ってしまった場合の保険
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    report = json.loads(raw)

    if not isinstance(report.get("items"), list) or not report["items"]:
        raise ValueError("items が空です。AI の収集が失敗している可能性があります。")

    cleaned: list[dict[str, Any]] = []
    for i, item in enumerate(report["items"]):
        missing = REQUIRED_ITEM_KEYS - item.keys()
        if missing:
            raise ValueError(f"items[{i}] に必須項目がありません: {sorted(missing)}")
        if not str(item["url"]).startswith("http"):
            raise ValueError(f"items[{i}] の url が不正です: {item['url']}")

        # 表示側が落ちないように型と範囲をここで整える
        try:
            item["importance"] = max(1, min(5, int(item.get("importance", 3))))
        except (TypeError, ValueError):
            item["importance"] = 3
        item["tags"] = [t for t in item.get("tags", []) if t in VALID_TAGS]
        item.setdefault("title_ja", "")
        item.setdefault("why", "")
        cleaned.append(item)

    # 重要度の高い順 → 同点なら新しい順
    # （Python の sort は安定なので、日付で並べてから重要度で並べ直せば両立する）
    by_date = sorted(cleaned, key=lambda x: x["date"], reverse=True)
    report["items"] = sorted(by_date, key=lambda x: -x["importance"])
    report.setdefault("highlights", [])
    report.setdefault("period", {"from": "", "to": ""})
    return report


def render_html(report: dict[str, Any]) -> str:
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html"]),  # 記事タイトルの記号で崩れないように
    )
    template = env.get_template("report.html.j2")
    sources = sorted({item["source"] for item in report["items"]})
    return template.render(
        report=report,
        sources=sources,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
    )


def write_site(report: dict[str, Any], docs_dir: Path, slug: str) -> Path:
    """docs/ 配下に HTML を書き出す。docs/ は GitHub Pages の公開元。"""
    html = render_html(report)
    docs_dir.mkdir(parents=True, exist_ok=True)
    (docs_dir / ".nojekyll").touch()  # Jekyll 変換を無効化（必須）

    archive = docs_dir / "archive"
    archive.mkdir(exist_ok=True)
    (archive / f"{slug}.html").write_text(html, encoding="utf-8")

    index = docs_dir / "index.html"  # 最新号をトップに配置
    index.write_text(html, encoding="utf-8")
    return index


# ---------------------------------------------------------------------------
# TODO(あなたの実装ポイント 4)
#   過去号の一覧ページ（docs/archive/index.html）を作ってみましょう。
#   archive/*.html を glob で集めて、日付降順のリンク一覧を出すだけで作れます。
# ---------------------------------------------------------------------------
