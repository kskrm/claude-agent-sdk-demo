#!/usr/bin/env node
/**
 * topic-explainer サブエージェントの出力を検証して data/YYYY-MM-DD.json に差し込む。
 * スキーマから外れた値は落とすか既定値に寄せるので、多少崩れた出力でもページは壊れない。
 *
 *   node scripts/apply-explain.mjs [--date YYYY-MM-DD]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jstDateString } from './lib/util.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const RUN_DATE = args.date ?? jstDateString();

const reportPath = resolve(`data/${RUN_DATE}.json`);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const byId = new Map(report.topics.map((t) => [t.id, t]));

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v) => (Array.isArray(v) ? v : []);

const DIAGRAM_TYPES = new Set(['flow', 'compare', 'layers']);

/** ノード配列を {label, note} に正規化。ラベルが無いものは捨てる。 */
function normalizeNodes(v, max) {
  return arr(v)
    .map((n) => ({ label: str(n?.label, 24), note: str(n?.note, 80) }))
    .filter((n) => n.label)
    .slice(0, max);
}

/** 図の仕様を検証する。描けない形なら null を返し、ページ側で図を省く。 */
function normalizeDiagram(d) {
  const type = DIAGRAM_TYPES.has(d?.type) ? d.type : null;
  if (!type) return null;
  const base = { type, title: str(d.title, 40), caption: str(d.caption, 120) };

  if (type === 'compare') {
    const before = normalizeNodes(d?.before?.nodes, 4);
    const after = normalizeNodes(d?.after?.nodes, 4);
    if (before.length < 1 || after.length < 1) return null;
    return {
      ...base,
      before: { title: str(d?.before?.title, 20) || 'これまで', nodes: before },
      after: { title: str(d?.after?.title, 20) || 'これから', nodes: after },
    };
  }

  const nodes = normalizeNodes(d?.nodes, 5);
  if (nodes.length < 2) return null;
  return { ...base, nodes };
}

let files = [];
try {
  files = (await readdir(resolve('.cache/explained'))).filter((f) => f.endsWith('.json'));
} catch {
  files = [];
}

const deepDives = [];
const problems = [];

for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(resolve('.cache/explained', file), 'utf8'));
  } catch (error) {
    problems.push(`${file}: JSON として読めません (${error.message})`);
    continue;
  }

  const topic = byId.get(parsed?.id);
  if (!topic) {
    problems.push(`${file}: id "${parsed?.id}" が今週のトピックに見つかりません`);
    continue;
  }

  const concepts = arr(parsed.concepts)
    .map((c) => ({ term: str(c?.term, 40), plain: str(c?.plain, 80), detail: str(c?.detail, 300) }))
    .filter((c) => c.term && c.plain)
    .slice(0, 4);

  const impact = arr(parsed.impact)
    .map((i) => ({ who: str(i?.who, 20), what: str(i?.what, 160) }))
    .filter((i) => i.who && i.what)
    .slice(0, 3);

  const jargon = arr(parsed.jargon)
    .map((j) => ({ term: str(j?.term, 40), plain: str(j?.plain, 100) }))
    .filter((j) => j.term && j.plain)
    .slice(0, 6);

  const hook = str(parsed.hook, 400);
  if (!hook) {
    problems.push(`${file}: hook が空のため採用しません`);
    continue;
  }

  deepDives.push({
    id: topic.id,
    topicRank: topic.rank,
    sourceLabel: topic.sourceLabel,
    url: topic.url,
    publishedAt: topic.publishedAt,
    originalTitle: topic.title,
    headline: str(parsed.headline, 60) || topic.titleJa || topic.title,
    hook,
    background: {
      title: str(parsed?.background?.title, 30) || 'そもそもの話',
      body: str(parsed?.background?.body, 500),
    },
    analogy: {
      title: str(parsed?.analogy?.title, 30) || 'たとえるなら',
      body: str(parsed?.analogy?.body, 400),
    },
    concepts,
    diagram: normalizeDiagram(parsed.diagram),
    impact,
    jargon,
    nextStep: str(parsed.nextStep, 140),
  });
}

// 元のスコア順（featuredIds の順）に並べ直す
const order = new Map((report.featuredIds ?? []).map((id, i) => [id, i]));
deepDives.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

report.deepDives = deepDives;
report.generatedAt = new Date().toISOString();
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`[apply-explain] ${deepDives.length} / ${(report.featuredIds ?? []).length} 件の深掘り解説を差し込みました`);
for (const d of deepDives) {
  console.log(`  - ${d.id}: ${d.headline}（図: ${d.diagram?.type ?? 'なし'} / 要素技術 ${d.concepts.length} 件）`);
}
for (const p of problems) console.warn(`  ! ${p}`);
