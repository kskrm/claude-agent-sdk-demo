export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 実行日（JST基準）の YYYY-MM-DD */
export function jstDateString(date = new Date()) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function jstLabel(iso) {
  if (!iso) return '日付不明';
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** トラッキングパラメータを落として URL を比較可能な形に揃える */
export function canonicalUrl(raw = '') {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|mc_|source$|trk$)/i.test(key)) u.searchParams.delete(key);
    }
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return (raw || '').trim();
  }
}

/** タイトル重複判定用の正規化キー（記号・空白・大小文字を無視） */
export function titleKey(title = '') {
  return title
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 60);
}

export async function fetchWithRetry(url, { retries = 3, timeoutMs = 25000, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'weekly-ai-news-bot/1.0 (+github.com/kskrm/claude-agent-sdk-demo)', ...headers },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
}
