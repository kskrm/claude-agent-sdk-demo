#!/usr/bin/env node
/**
 * 深掘り対象トピックを1件ずつのタスクファイルに切り出す。
 * topic-explainer サブエージェントはこの1ファイルだけを読めばよい。
 *
 *   node scripts/prepare-explain.mjs [--date YYYY-MM-DD]
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jstDateString } from './lib/util.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const RUN_DATE = args.date ?? jstDateString();

const report = JSON.parse(await readFile(resolve(`data/${RUN_DATE}.json`), 'utf8'));
const byId = new Map(report.topics.map((t) => [t.id, t]));

const tasksDir = resolve('.cache/explain-tasks');
await rm(tasksDir, { recursive: true, force: true });
await rm(resolve('.cache/explained'), { recursive: true, force: true });
await mkdir(tasksDir, { recursive: true });
await mkdir(resolve('.cache/explained'), { recursive: true });

const manifest = [];
for (const id of report.featuredIds ?? []) {
  const t = byId.get(id);
  if (!t) continue;
  const path = `.cache/explain-tasks/${id}.json`;
  await writeFile(
    resolve(path),
    `${JSON.stringify(
      {
        id: t.id,
        title: t.titleJa || t.title,
        originalTitle: t.title,
        url: t.url,
        source: t.sourceLabel,
        publishedAt: t.publishedAt,
        summaryJa: t.summaryJa,
        whyJa: t.whyJa,
        tags: t.tags,
        score: t.score,
        weeklyHeadline: report.headline,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  manifest.push({ id, taskFile: path, outFile: `.cache/explained/${id}.json`, title: t.titleJa || t.title });
}

await writeFile(
  resolve('.cache/explain-manifest.json'),
  `${JSON.stringify({ runDate: RUN_DATE, tasks: manifest }, null, 2)}\n`,
  'utf8'
);
console.log(`[prepare-explain] ${manifest.length} 件の深掘りタスクを作成`);
for (const t of manifest) console.log(`  - ${t.id}: ${t.title}`);
