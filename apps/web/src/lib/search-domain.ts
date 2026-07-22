export type SearchResult = { title: string; url: string; snippet: string; source: string };
export type SortMode = 'relevance' | 'source' | 'title';
export type LeadStatus = 'researching' | 'contender' | 'purchased';
export type SavedLead = SearchResult & {
  status: LeadStatus;
  quotedPrice: string;
  size: string;
  notes: string;
  savedAt: string;
};

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

const LEAD_STATUSES = new Set<LeadStatus>(['researching', 'contender', 'purchased']);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function createSavedLead(result: SearchResult, savedAt = new Date().toISOString()): SavedLead {
  return { ...result, status: 'researching', quotedPrice: '', size: '', notes: '', savedAt };
}

export function normalizeSavedLeads(value: unknown, migratedAt = new Date().toISOString()): SavedLead[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const leads: SavedLead[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const title = text(raw.title, 300); const source = text(raw.source, 160); const snippet = text(raw.snippet, 1000);
    const url = typeof raw.url === 'string' ? safePublicUrl(raw.url) : null;
    if (!title || !source || !url) continue;
    const key = url.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push({
      title, source, snippet, url,
      status: typeof raw.status === 'string' && LEAD_STATUSES.has(raw.status as LeadStatus) ? raw.status as LeadStatus : 'researching',
      quotedPrice: text(raw.quotedPrice, 80),
      size: text(raw.size, 80),
      notes: text(raw.notes, 1000),
      savedAt: typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt)) ? raw.savedAt : migratedAt,
    });
  }
  return leads.slice(0, 100);
}

function csvCell(value: string): string {
  const spreadsheetSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(spreadsheetSafe) ? `"${spreadsheetSafe.replace(/"/g, '""')}"` : spreadsheetSafe;
}

export function exportShortlistCsv(leads: SavedLead[]): string {
  const rows = leads.map((lead) => [lead.title, lead.source, lead.status, lead.quotedPrice, lead.size, lead.notes, lead.url, lead.savedAt]);
  return [['Title', 'Source', 'Status', 'Quoted price', 'Size', 'Notes', 'URL', 'Saved at'], ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
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
