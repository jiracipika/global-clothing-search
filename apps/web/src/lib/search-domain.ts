export type SearchResult = { title: string; url: string; snippet: string; source: string };
export type SortMode = 'relevance' | 'source' | 'title';

export function decodeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}

export function safePublicUrl(raw: string): string | null {
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return null;
    if (/^(10|127|169\.254|192\.168)\./.test(host)) return null;
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(Number.isInteger) && (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 224 || parts[0] >= 240)) return null;
    url.username = ''; url.password = '';
    return url.toString();
  } catch { return null; }
}

export function decodeDdgUrl(raw: string): string | null {
  try {
    const wrapper = new URL(raw.startsWith('//') ? `https:${raw}` : raw, 'https://duckduckgo.com');
    const candidate = wrapper.searchParams.get('uddg') || wrapper.toString();
    return safePublicUrl(candidate);
  } catch { return null; }
}

export function parseDdgHtml(html: string, limit = 8): SearchResult[] {
  const chunks = html.split(/class=["'][^"']*\bresult\b[^"']*["']/gi).slice(1);
  const results: SearchResult[] = [];
  for (const chunk of chunks) {
    const link = chunk.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      ?? chunk.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = decodeDdgUrl(link[1]);
    if (!url) continue;
    const snippet = chunk.match(/<([a-z][\w:-]*)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? '';
    results.push({ title: decodeHtml(link[2]), url, snippet: decodeHtml(snippet), source: new URL(url).hostname.replace(/^www\./, '') });
    if (results.length >= limit) break;
  }
  return results;
}

export function mergeResults(groups: SearchResult[][], limit = 18): SearchResult[] {
  const seen = new Set<string>();
  return groups.flat().filter((item) => {
    const key = item.url.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, limit);
}

export function filterAndSort(results: SearchResult[], term: string, sort: SortMode): SearchResult[] {
  const needle = term.trim().toLowerCase();
  const filtered = needle ? results.filter((r) => `${r.title} ${r.source} ${r.snippet}`.toLowerCase().includes(needle)) : results;
  if (sort === 'relevance') return filtered;
  return [...filtered].sort((a, b) => (sort === 'source' ? a.source.localeCompare(b.source) : a.title.localeCompare(b.title)));
}
