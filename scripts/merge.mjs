#!/usr/bin/env node
/**
 * サブエージェントの出力（.cache/curated/*.json）と生データを突き合わせ、
 * 週次レポートの確定データ data/YYYY-MM-DD.json を作る。
 * サブエージェントの出力が欠けていてもフォールバックで必ず成立させる。
 *
 *   node scripts/merge.mjs [--date YYYY-MM-DD] [--top 24]
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fallbackScore, fallbackSummary, fallbackTags } from './lib/score.mjs';
import { jstDateString } from './lib/util.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const RUN_DATE = args.date ?? jstDateString();
const TOP = Number(args.top ?? 24);
// 1つの情報源がレポートを占有しないよう上限を設ける（多様性の確保）
const MAX_PER_SOURCE = Number(args.maxPerSource ?? 5);
// 深掘り解説の対象にする本数。情報源が偏らないよう1情報源あたり2本までに抑える。
const FEATURED = Number(args.featured ?? 5);

const raw = JSON.parse(await readFile(resolve(`.cache/raw-${RUN_DATE}.json`), 'utf8'));
const rawById = new Map(raw.items.map((i) => [i.id, i]));

/** .cache/curated/*.json を読み込む（無ければ空） */
const curated = new Map();
let curatedFiles = [];
try {
  curatedFiles = (await readdir(resolve('.cache/curated'))).filter((f) => f.endsWith('.json'));
} catch {
  curatedFiles = [];
}
for (const file of curatedFiles) {
  try {
    const parsed = JSON.parse(await readFile(resolve('.cache/curated', file), 'utf8'));
    for (const item of parsed.items ?? []) {
      if (item?.id && rawById.has(item.id)) curated.set(item.id, item);
    }
  } catch (error) {
    console.warn(`[merge] ${file} を読めませんでした: ${error.message}`);
  }
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));

const topics = raw.items
  .map((item) => {
    const c = curated.get(item.id);
    const score = c && Number.isFinite(Number(c.score)) ? clamp(c.score) : fallbackScore(item, { until: raw.until });
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      sourceCategory: item.sourceCategory,
      lang: item.lang,
      url: item.url,
      publishedAt: item.publishedAt,
      author: item.author,
      title: item.title,
      titleJa: (c?.titleJa || c?.title_ja || (item.lang === 'ja' ? item.title : '')).trim(),
      summaryJa: (c?.summaryJa || c?.summary_ja || fallbackSummary(item)).trim(),
      whyJa: (c?.whyJa || c?.why_ja || '').trim(),
      tags: Array.isArray(c?.tags) && c.tags.length ? c.tags.slice(0, 3) : fallbackTags(item),
      score,
      curatedBy: c ? 'subagent' : 'fallback',
      ...(typeof item.points === 'number'
        ? { points: item.points, comments: item.comments, discussionUrl: item.discussionUrl }
        : {}),
    };
  })
  .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));

/** 情報源ごとの上限を守りつつ上位から採用し、枠が余ればスコア順で埋める */
function pickWithDiversity(sorted) {
  const perSource = new Map();
  const picked = [];
  const overflow = [];
  for (const t of sorted) {
    const n = perSource.get(t.sourceId) ?? 0;
    if (picked.length < TOP && n < MAX_PER_SOURCE) {
      perSource.set(t.sourceId, n + 1);
      picked.push(t);
    } else {
      overflow.push(t);
    }
  }
  return picked.concat(overflow.slice(0, Math.max(0, TOP - picked.length)));
}

const selected = pickWithDiversity(topics).map((t, i) => ({ ...t, rank: i + 1 }));

// 全体サマリ（オーケストレータが .cache/overview.json に書く）。無ければ自動生成。
let overview = null;
try {
  overview = JSON.parse(await readFile(resolve('.cache/overview.json'), 'utf8'));
} catch {
  overview = null;
}

// 深掘り対象の選定: スコア上位から、1情報源あたり最大2本まで
const featuredIds = [];
const featuredPerSource = new Map();
for (const t of selected) {
  if (featuredIds.length >= FEATURED) break;
  const n = featuredPerSource.get(t.sourceId) ?? 0;
  if (n >= 2) continue;
  featuredPerSource.set(t.sourceId, n + 1);
  featuredIds.push(t.id);
}
// 多様性の制約で埋まらなかった場合はスコア順で補充
for (const t of selected) {
  if (featuredIds.length >= FEATURED) break;
  if (!featuredIds.includes(t.id)) featuredIds.push(t.id);
}

const tagCount = new Map();
for (const t of selected) for (const tag of t.tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));

const report = {
  runDate: RUN_DATE,
  windowDays: raw.windowDays,
  since: raw.since,
  until: raw.until,
  generatedAt: new Date().toISOString(),
  headline: (overview?.headline || `今週のAI業界トレンド（${selected.length}件）`).trim(),
  summaryJa: (overview?.summaryJa || overview?.summary_ja || '').trim(),
  keyPoints: (overview?.keyPoints || overview?.key_points || []).slice(0, 4),
  topTags,
  featuredIds,
  deepDives: [],
  sourceStats: raw.sourceStats,
  collectedCount: raw.itemCount,
  curatedCount: selected.filter((t) => t.curatedBy === 'subagent').length,
  topics: selected,
};

await mkdir(resolve('data'), { recursive: true });
const out = resolve(`data/${RUN_DATE}.json`);
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[merge] 深掘り対象: ${featuredIds.join(', ')}`);
console.log(
  `[merge] ${selected.length} 件を採用（サブエージェント採点 ${report.curatedCount} / フォールバック ${selected.length - report.curatedCount}） -> ${out}`
);
