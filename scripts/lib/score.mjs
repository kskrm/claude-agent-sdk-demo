// LLM を使わない決定論的スコアリング。
// サブエージェントが採点できなかった項目のフォールバック、および
// サブエージェントへ渡す候補の事前絞り込みに使う。

import { SOURCE_BY_ID } from './feeds.mjs';

// 重み付きキーワード。日本語・英語の両方を拾う。
const KEYWORDS = [
  [30, /\b(gpt-?5|claude\s?5|opus\s?5|gemini\s?3|llama\s?4)\b/i],
  [22, /(発表|リリース|release|launch|announc|introduc|general availability|\bGA\b)/i],
  [20, /(model|モデル|foundation model|基盤モデル|frontier)/i],
  [18, /(agent|エージェント|agentic|mcp|model context protocol|tool use)/i],
  [15, /(open[- ]?source|オープンソース|weights|重み公開)/i],
  [14, /(benchmark|ベンチマーク|eval|評価|sota)/i],
  [13, /(price|pricing|値下げ|コスト|cost|無料|free tier)/i],
  [12, /(security|セキュリティ|safety|安全性|alignment|脆弱性|prompt injection)/i],
  [12, /(規制|regulation|法|policy|eu ai act|ガイドライン)/i],
  [10, /(rag|fine[- ]?tun|蒸留|distill|推論|inference|reasoning)/i],
  [10, /(生成ai|generative ai|llm|大規模言語モデル)/i],
  [8, /(bedrock|sagemaker|vertex|azure openai|api)/i],
  [-25, /(求人|採用|hiring|we.re hiring|ポエム|日記|やってみた感想)/i],
];

/** 0〜100 の重要度スコアを返す */
export function fallbackScore(item, { until = new Date() } = {}) {
  const source = SOURCE_BY_ID[item.sourceId];
  let score = source?.weight ?? 5;

  const text = `${item.title} ${item.excerpt ?? ''}`;
  for (const [weight, re] of KEYWORDS) {
    if (re.test(text)) score += weight;
  }

  // 新しいほど加点（0〜15点）
  const ageDays = (new Date(until) - new Date(item.publishedAt)) / 86400000;
  score += Math.max(0, 15 - ageDays * 2);

  // Hacker News は支持数を反映（0〜20点）
  if (typeof item.points === 'number') {
    score += Math.min(20, Math.round(item.points / 30));
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** サブエージェントが要約を返さなかった場合の抜粋ベースの代替要約 */
export function fallbackSummary(item) {
  const base = (item.excerpt || item.title || '').replace(/\s+/g, ' ').trim();
  const clipped = base.length > 120 ? `${base.slice(0, 118)}…` : base;
  return clipped || item.title;
}

/** タイトル・抜粋から粗いタグを推定 */
export function fallbackTags(item) {
  const text = `${item.title} ${item.excerpt ?? ''}`;
  const tags = [];
  const table = [
    ['モデル', /(model|モデル|gpt|claude|gemini|llama)/i],
    ['エージェント', /(agent|エージェント|mcp|tool use)/i],
    ['開発', /(sdk|api|library|ライブラリ|実装|開発|code)/i],
    ['クラウド', /(aws|bedrock|sagemaker|azure|gcp|vertex)/i],
    ['安全性', /(safety|security|安全|セキュリティ|alignment|規制|policy)/i],
    ['研究', /(research|paper|論文|benchmark|評価)/i],
    ['ビジネス', /(enterprise|企業|導入事例|料金|pricing|投資)/i],
  ];
  for (const [tag, re] of table) if (re.test(text)) tags.push(tag);
  return tags.length ? tags.slice(0, 3) : ['その他'];
}
