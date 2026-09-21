#!/usr/bin/env node
/**
 * 週次レポートを Discord に通知する。
 * Webhook URL は環境変数 DISCORD_WEBHOOK_URL_WEEKLY_NEWS から読む（リポジトリには保存しない）。
 *
 *   node scripts/notify-discord.mjs [--date YYYY-MM-DD] [--dry-run]
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jstLabel, jstDateString } from './lib/util.mjs';

const argv = process.argv.slice(2);
const args = Object.fromEntries(
  argv.reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const DRY_RUN = argv.includes('--dry-run');
const RUN_DATE = args.date ?? jstDateString();
// GitHub Pages はリポジトリのルートから配信しているため、レポートは /docs 配下に置かれる。
// Pages の Source を main / docs に変更した場合は PAGES_BASE_URL で上書きする。
const PAGES_BASE = (process.env.PAGES_BASE_URL ?? 'https://kskrm.github.io/claude-agent-sdk-demo/docs').replace(/\/$/, '');
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL_WEEKLY_NEWS;

const report = JSON.parse(await readFile(resolve(`data/${RUN_DATE}.json`), 'utf8'));
const reportUrl = `${PAGES_BASE}/${RUN_DATE}.html`;

const top = report.topics.slice(0, 5);
const lines = top.map((t, i) => {
  const title = (t.titleJa || t.title).replace(/\n/g, ' ');
  return `**${i + 1}. [${title}](${t.url})**\n　${t.sourceLabel}・${jstLabel(t.publishedAt)}・重要度 ${t.score}\n　${t.summaryJa.slice(0, 110)}`;
});

const payload = {
  username: 'AI週次トレンド',
  embeds: [
    {
      title: `🗞 AI業界トレンド 週次まとめ（${jstLabel(report.since)} 〜 ${jstLabel(report.until)}）`,
      url: reportUrl,
      description: [
        report.headline,
        report.summaryJa,
        '',
        ...lines,
        '',
        `📊 ${report.collectedCount} 件を収集 → ${report.topics.length} 件を採録`,
        `🎨 [グラレコ風レポート全文はこちら](${reportUrl})`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000),
      color: 0xe2603c,
      footer: { text: `#${report.topTags.map((t) => t.tag).join(' #')}` },
      timestamp: report.generatedAt,
    },
  ],
};

if (DRY_RUN || !WEBHOOK) {
  if (!WEBHOOK && !DRY_RUN) console.warn('[discord] DISCORD_WEBHOOK_URL_WEEKLY_NEWS が未設定のため送信をスキップします。');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

let lastStatus = 0;
let lastBody = '';
for (let attempt = 0; attempt < 3; attempt += 1) {
  const post = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }));

  if (post.ok) {
    console.log(`[discord] 送信しました -> ${reportUrl}`);
    process.exit(0);
  }
  lastStatus = post.status;
  lastBody = await post.text();
  // 429 はレート制限。retry_after を尊重する。
  const wait = lastStatus === 429 ? (JSON.parse(lastBody || '{}').retry_after ?? 5) * 1000 : 2000 * 2 ** attempt;
  if (attempt < 2) await new Promise((r) => setTimeout(r, wait));
}

console.error(`[discord] 送信失敗 HTTP ${lastStatus}: ${lastBody}`);
process.exit(1);
