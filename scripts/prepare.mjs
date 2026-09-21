#!/usr/bin/env node
/**
 * collect.mjs の生データを情報源ごとのタスクファイルに分割する。
 * サブエージェントはこの 1 ファイルだけを読めばよいので、並列起動しても
 * それぞれのコンテキストが小さく収まる。
 *
 *   node scripts/prepare.mjs [--date YYYY-MM-DD] [--max 12]
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fallbackScore } from './lib/score.mjs';
import { jstDateString } from './lib/util.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const RUN_DATE = args.date ?? jstDateString();
const MAX_PER_SOURCE = Number(args.max ?? 12);

const raw = JSON.parse(await readFile(resolve(`.cache/raw-${RUN_DATE}.json`), 'utf8'));

const bySource = new Map();
for (const item of raw.items) {
  if (!bySource.has(item.sourceId)) bySource.set(item.sourceId, []);
  bySource.get(item.sourceId).push({ ...item, preScore: fallbackScore(item, { until: raw.until }) });
}

const tasksDir = resolve('.cache/tasks');
await rm(tasksDir, { recursive: true, force: true });
await rm(resolve('.cache/curated'), { recursive: true, force: true });
await mkdir(tasksDir, { recursive: true });
await mkdir(resolve('.cache/curated'), { recursive: true });

const manifest = [];
for (const [sourceId, items] of bySource) {
  const picked = items.sort((a, b) => b.preScore - a.preScore).slice(0, MAX_PER_SOURCE);
  const path = `.cache/tasks/${sourceId}.json`;
  await writeFile(
    resolve(path),
    `${JSON.stringify(
      {
        sourceId,
        sourceLabel: picked[0].sourceLabel,
        runDate: RUN_DATE,
        items: picked.map(({ preScore, sourceCategory, ...rest }) => rest),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  manifest.push({ sourceId, taskFile: path, outFile: `.cache/curated/${sourceId}.json`, count: picked.length });
}

await writeFile(resolve('.cache/manifest.json'), `${JSON.stringify({ runDate: RUN_DATE, tasks: manifest }, null, 2)}\n`, 'utf8');
console.log(`[prepare] ${manifest.length} 情報源 / 合計 ${manifest.reduce((n, t) => n + t.count, 0)} 件`);
for (const t of manifest) console.log(`  - ${t.sourceId}: ${t.count} 件 -> ${t.taskFile}`);
