#!/usr/bin/env node
/**
 * data/*.json から GitHub Pages 用の HTML を 2 ページ生成する。
 *   docs/<date>.html       … 主要トピックの深掘り解説（メイン）
 *   docs/<date>-list.html  … 今週集めたトピックの一覧（サブ）
 *   docs/index.html        … 最新週の解説ページ
 *
 *   node scripts/build-html.mjs [--date YYYY-MM-DD]
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderExplainPage, renderListPage } from './lib/render.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const dataDir = resolve('data');
const docsDir = resolve('docs');
await mkdir(docsDir, { recursive: true });

const files = (await readdir(dataDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (files.length === 0) {
  console.error('[build-html] data/*.json が見つかりません。先に merge.mjs を実行してください。');
  process.exit(1);
}

const archive = files.map((f) => f.replace('.json', ''));
const targets = args.date ? [`${args.date}.json`] : files;

for (const file of targets) {
  const report = JSON.parse(await readFile(resolve(dataDir, file), 'utf8'));
  const date = file.replace('.json', '');
  const nav = { archive, current: date };
  await writeFile(resolve(docsDir, `${date}.html`), renderExplainPage(report, nav), 'utf8');
  await writeFile(resolve(docsDir, `${date}-list.html`), renderListPage(report, nav), 'utf8');
  console.log(`[build-html] docs/${date}.html（解説 ${report.deepDives?.length ?? 0} 本） + docs/${date}-list.html`);
}

// 最新週の解説ページを index.html に複製
const latest = archive[0];
const latestReport = JSON.parse(await readFile(resolve(dataDir, `${latest}.json`), 'utf8'));
await writeFile(resolve(docsDir, 'index.html'), renderExplainPage(latestReport, { archive, current: latest }), 'utf8');
// Jekyll の処理を無効化（_ 始まりのパスや特殊文字で崩れるのを防ぐ）
await writeFile(resolve(docsDir, '.nojekyll'), '', 'utf8');
console.log(`[build-html] docs/index.html （最新: ${latest}）`);
