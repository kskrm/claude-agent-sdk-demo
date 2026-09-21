#!/usr/bin/env node
/**
 * 各情報源を並列に取得し、直近7日分を重複排除して .cache/raw-YYYY-MM-DD.json に出力する。
 * LLM は使わない決定論的な処理なので、いつ実行しても同じ入力から同じ結果になる。
 *
 *   node scripts/collect.mjs [--days 7] [--date YYYY-MM-DD] [--out <path>]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SOURCES } from './lib/feeds.mjs';
import { parseRss, parseAtom, parseAnthropicHtml, parseHn } from './lib/parse.mjs';
import { canonicalUrl, titleKey, jstDateString, fetchWithRetry } from './lib/util.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const DAYS = Number(args.days ?? 7);
const RUN_DATE = args.date ?? jstDateString();
const OUT = resolve(args.out ?? `.cache/raw-${RUN_DATE}.json`);

// 対象期間: 実行日 JST 07:00 を基準に遡って DAYS 日。
// 予定時刻より後に手動実行した場合も取りこぼさないよう、終端は「今」まで広げる。
const anchor = new Date(`${RUN_DATE}T07:00:00+09:00`);
const since = new Date(anchor.getTime() - DAYS * 24 * 60 * 60 * 1000);
const until = new Date(Math.max(anchor.getTime(), Date.now()));

async function fetchSource(source) {
  if (source.type === 'hn') {
    const after = Math.floor(since.getTime() / 1000);
    const perQuery = await Promise.all(
      source.queries.map(async (q) => {
        const url =
          `${source.url}?query=${encodeURIComponent(q)}&tags=story` +
          `&numericFilters=created_at_i>${after},points>${source.minPoints}&hitsPerPage=30`;
        const res = await fetchWithRetry(url);
        return parseHn(await res.json());
      })
    );
    return perQuery.flat();
  }

  const urls = [source.url, ...(source.extraUrls ?? [])];
  const perUrl = await Promise.all(
    urls.map(async (url) => {
      const body = await (await fetchWithRetry(url)).text();
      if (source.type === 'rss') return parseRss(body);
      if (source.type === 'atom') return parseAtom(body);
      if (source.type === 'html-anthropic') return parseAnthropicHtml(body);
      throw new Error(`unknown source type: ${source.type}`);
    })
  );
  return perUrl.flat();
}

const results = await Promise.all(
  SOURCES.map(async (source) => {
    try {
      const items = await fetchSource(source);
      return { source, items, error: null };
    } catch (error) {
      // 1つの情報源が落ちても週次レポート全体は止めない
      return { source, items: [], error: String(error?.message ?? error) };
    }
  })
);

const seenUrl = new Set();
const seenTitle = new Set();
const items = [];
const sourceStats = [];

for (const { source, items: raw, error } of results) {
  let kept = 0;
  for (const item of raw) {
    if (!item.title || !item.url) continue;
    const at = item.publishedAt ? new Date(item.publishedAt) : null;
    if (!at || at < since || at > until) continue;

    const urlKey = canonicalUrl(item.url);
    const tKey = titleKey(item.title);
    if (seenUrl.has(urlKey) || (tKey && seenTitle.has(tKey))) continue;
    seenUrl.add(urlKey);
    if (tKey) seenTitle.add(tKey);

    items.push({
      id: `${source.id}-${items.length + 1}`,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceCategory: source.category,
      lang: source.lang,
      title: item.title,
      url: urlKey,
      publishedAt: item.publishedAt,
      author: item.author || '',
      excerpt: item.excerpt || '',
      ...(item.points !== undefined ? { points: item.points, comments: item.comments, discussionUrl: item.discussionUrl } : {}),
    });
    kept += 1;
  }
  sourceStats.push({ id: source.id, label: source.label, fetched: raw.length, kept, error });
}

items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

const payload = {
  runDate: RUN_DATE,
  windowDays: DAYS,
  since: since.toISOString(),
  until: until.toISOString(),
  generatedAt: new Date().toISOString(),
  sourceStats,
  itemCount: items.length,
  items,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[collect] ${items.length} 件 / 期間 ${since.toISOString()} 〜 ${until.toISOString()}`);
for (const s of sourceStats) {
  console.log(`  - ${s.label}: ${s.kept}/${s.fetched}${s.error ? `  ERROR: ${s.error}` : ''}`);
}
console.log(`[collect] -> ${OUT}`);
