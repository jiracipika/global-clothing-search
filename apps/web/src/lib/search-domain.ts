export type SearchResult = { title: string; url: string; snippet: string; source: string };
export type SortMode = 'relevance' | 'source' | 'title';
export type LeadStatus = 'researching' | 'contender' | 'purchased';
export type ShortlistFilter = 'all' | LeadStatus;
export type ShortlistSort = 'newest' | 'title' | 'status';
export type SearchHistory = { query: string; region: string; at: string };
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

const HISTORY_REGIONS = new Set(['global', 'US', 'EU', 'UK', 'Japan', 'China', 'Australia']);
const STATUS_ORDER: Record<LeadStatus, number> = { contender: 0, researching: 1, purchased: 2 };

export function filterAndSortSavedLeads(leads: SavedLead[], filter: ShortlistFilter, sort: ShortlistSort): SavedLead[] {
  const filtered = filter === 'all' ? leads : leads.filter((lead) => lead.status === filter);
  return [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.savedAt.localeCompare(a.savedAt);
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export function leadMissingFields(lead: SavedLead): Array<'price' | 'size' | 'notes'> {
  const missing: Array<'price' | 'size' | 'notes'> = [];
  if (!lead.quotedPrice.trim()) missing.push('price');
  if (!lead.size.trim()) missing.push('size');
  if (!lead.notes.trim()) missing.push('notes');
  return missing;
}

export function normalizeSearchHistory(value: unknown): SearchHistory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const history: SearchHistory[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const query = text(raw.query, 160);
    const region = typeof raw.region === 'string' && HISTORY_REGIONS.has(raw.region) ? raw.region : 'global';
    const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : '';
    const key = `${query.toLowerCase()}\u0000${region}`;
    if (!query || !at || seen.has(key)) continue;
    seen.add(key);
    history.push({ query, region, at });
  }
  return history.slice(0, 8);
}

export function exportWorkspaceBackup(saved: SavedLead[], history: SearchHistory[], exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ product: 'ThreadHunt', version: 1, exportedAt, saved: normalizeSavedLeads(saved, exportedAt), history: normalizeSearchHistory(history) }, null, 2);
}

export function parseWorkspaceBackup(input: string, importedAt = new Date().toISOString()): { saved: SavedLead[]; history: SearchHistory[] } {
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('The selected backup is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The selected file is not a ThreadHunt workspace backup.');
  const backup = value as Record<string, unknown>;
  if (backup.product !== 'ThreadHunt' || backup.version !== 1) throw new Error('The selected file is not a ThreadHunt workspace backup.');
  return { saved: normalizeSavedLeads(backup.saved, importedAt), history: normalizeSearchHistory(backup.history) };
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
