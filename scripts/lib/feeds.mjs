// 情報源の定義。type ごとに parse.mjs のパーサが選ばれる。
// weight: 重要度スコアの情報源ボーナス（0〜15点）。
export const SOURCES = [
  {
    id: 'anthropic',
    label: 'Anthropic News',
    type: 'html-anthropic',
    url: 'https://www.anthropic.com/news',
    lang: 'en',
    weight: 15,
    category: 'vendor',
  },
  {
    id: 'openai',
    label: 'OpenAI News',
    type: 'rss',
    url: 'https://openai.com/news/rss.xml',
    lang: 'en',
    weight: 15,
    category: 'vendor',
  },
  {
    id: 'aws-ml',
    label: 'AWS Machine Learning Blog',
    type: 'rss',
    url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    lang: 'en',
    weight: 10,
    category: 'vendor',
  },
  {
    id: 'aws-jp-ml',
    label: 'AWS ML Blog (日本語)',
    type: 'rss',
    url: 'https://aws.amazon.com/jp/blogs/machine-learning/feed/',
    lang: 'ja',
    weight: 10,
    category: 'vendor',
  },
  {
    id: 'aws-jp-news',
    label: 'AWS Japan Blog',
    type: 'rss',
    url: 'https://aws.amazon.com/jp/blogs/news/feed/',
    lang: 'ja',
    weight: 8,
    category: 'vendor',
  },
  {
    id: 'qiita',
    label: 'Qiita (tag: AI)',
    type: 'atom',
    // Qiita のタグフィードは 1 タグあたり数件しか返らないため複数タグを合算する
    url: 'https://qiita.com/tags/ai/feed',
    extraUrls: [
      'https://qiita.com/tags/%E7%94%9F%E6%88%90ai/feed',
      'https://qiita.com/tags/llm/feed',
      'https://qiita.com/tags/claude/feed',
    ],
    lang: 'ja',
    weight: 5,
    category: 'community',
  },
  {
    id: 'zenn',
    label: 'Zenn (topic: AI)',
    type: 'rss',
    url: 'https://zenn.dev/topics/ai/feed',
    lang: 'ja',
    weight: 5,
    category: 'community',
  },
  {
    id: 'hackernews',
    label: 'Hacker News',
    type: 'hn',
    // Algolia API。スクレイピング不要・公式・レート制限が緩い。
    url: 'https://hn.algolia.com/api/v1/search_by_date',
    lang: 'en',
    weight: 8,
    category: 'community',
    // HN は AI 以外も流れるためクエリで絞る
    queries: ['AI', 'LLM', 'Anthropic', 'OpenAI', 'Claude'],
    minPoints: 80,
  },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
