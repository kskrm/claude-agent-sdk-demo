// 依存ゼロの軽量パーサ群。RSS / Atom / Anthropic の HTML / Hacker News API に対応。

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/',
};

export function decodeEntities(str = '') {
  return str
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

export function stripTags(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function unwrapCdata(s = '') {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

// <tag ...>value</tag> の最初の一致を取り出す
function tagText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

function tagAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"[^>]*>`, 'i');
  const m = xml.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** RSS 2.0 */
export function parseRss(xml) {
  return blocks(xml, 'item').map((item) => ({
    title: stripTags(tagText(item, 'title')),
    url: (tagText(item, 'link') || tagAttr(item, 'link', 'href') || '').trim(),
    publishedAt: toIso(tagText(item, 'pubDate') || tagText(item, 'dc:date')),
    author: stripTags(tagText(item, 'dc:creator') || tagText(item, 'author')),
    excerpt: stripTags(tagText(item, 'description') || tagText(item, 'content:encoded')).slice(0, 700),
  }));
}

/** Atom 1.0 */
export function parseAtom(xml) {
  return blocks(xml, 'entry').map((entry) => ({
    title: stripTags(tagText(entry, 'title')),
    url: tagAttr(entry, 'link', 'href') || tagText(entry, 'id'),
    publishedAt: toIso(tagText(entry, 'published') || tagText(entry, 'updated')),
    author: stripTags(tagText(entry, 'name')),
    excerpt: stripTags(tagText(entry, 'summary') || tagText(entry, 'content')).slice(0, 700),
  }));
}

/**
 * Anthropic News は RSS を提供していないため一覧 HTML を読む。
 * 構造: <a href="/news/SLUG" ...><div ...><time ...>Sep 17, 2026</time><span ...>Subject</span></div><span ...>Title</span></a>
 */
export function parseAnthropicHtml(html, baseUrl = 'https://www.anthropic.com') {
  const items = [];
  const seen = new Set();
  const re = /<a\s+href="(\/news\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    const inner = m[2];
    if (seen.has(path)) continue;
    const time = inner.match(/<time[^>]*>([^<]+)<\/time>/i);
    const titles = [...inner.matchAll(/<(?:span|h\d)[^>]*>([^<]{4,200})<\/(?:span|h\d)>/gi)].map((t) =>
      decodeEntities(t[1]).trim()
    );
    // 日付・カテゴリ以外で最も長いテキストをタイトルとみなす
    const title = titles
      .filter((t) => !/^[A-Z][a-z]{2}\s\d{1,2},\s\d{4}$/.test(t))
      .sort((a, b) => b.length - a.length)[0];
    if (!title) continue;
    seen.add(path);
    items.push({
      title,
      url: baseUrl + path,
      publishedAt: toIso(time ? time[1] : null),
      author: 'Anthropic',
      excerpt: '',
    });
  }
  return items;
}

/** Hacker News (Algolia search_by_date) */
export function parseHn(json) {
  return (json.hits || []).map((hit) => ({
    title: hit.title || hit.story_title || '',
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    publishedAt: toIso(hit.created_at),
    author: hit.author ? `@${hit.author}` : '',
    excerpt: stripTags(hit.story_text || '').slice(0, 700),
    points: hit.points || 0,
    comments: hit.num_comments || 0,
    discussionUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
  }));
}
