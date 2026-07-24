export type SearchResult = { title: string; url: string; snippet: string; source: string };
export type SortMode = 'relevance' | 'source' | 'title';
export type LeadStatus = 'researching' | 'contender' | 'purchased';
export type ReturnPolicy = '' | 'accepted' | 'exchange-only' | 'final-sale' | 'marketplace-protected';
export type ListingStatus = '' | 'available' | 'reserved' | 'sold' | 'removed';
export type ShortlistFilter = 'all' | LeadStatus;
export type ShortlistSort = 'newest' | 'title' | 'status';
export type EvidenceFilter = 'all' | 'complete' | 'incomplete' | 'stale';
export type SearchHistory = { query: string; region: string; at: string };
export type SavedLead = SearchResult & {
  status: LeadStatus;
  quotedPrice: string;
  shippingCost: string;
  size: string;
  condition: string;
  returnPolicy: ReturnPolicy;
  seller: string;
  listingStatus: ListingStatus;
  checkedAt: string;
  notes: string;
  savedAt: string;
};
export const MAX_COMPARISON_LEADS = 4;

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
const RETURN_POLICIES = new Set<ReturnPolicy>(['', 'accepted', 'exchange-only', 'final-sale', 'marketplace-protected']);
const LISTING_STATUSES = new Set<ListingStatus>(['', 'available', 'reserved', 'sold', 'removed']);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function createSavedLead(result: SearchResult, savedAt = new Date().toISOString()): SavedLead {
  return { ...result, status: 'researching', quotedPrice: '', shippingCost: '', size: '', condition: '', returnPolicy: '', seller: '', listingStatus: '', checkedAt: '', notes: '', savedAt };
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
    const listingStatus = typeof raw.listingStatus === 'string' && LISTING_STATUSES.has(raw.listingStatus as ListingStatus) ? raw.listingStatus as ListingStatus : '';
    const checkedAt = listingStatus && typeof raw.checkedAt === 'string' && Number.isFinite(Date.parse(raw.checkedAt)) ? raw.checkedAt : '';
    leads.push({
      title, source, snippet, url,
      status: typeof raw.status === 'string' && LEAD_STATUSES.has(raw.status as LeadStatus) ? raw.status as LeadStatus : 'researching',
      quotedPrice: text(raw.quotedPrice, 80),
      shippingCost: text(raw.shippingCost, 80),
      size: text(raw.size, 80),
      condition: text(raw.condition, 120),
      returnPolicy: typeof raw.returnPolicy === 'string' && RETURN_POLICIES.has(raw.returnPolicy as ReturnPolicy) ? raw.returnPolicy as ReturnPolicy : '',
      seller: text(raw.seller, 160),
      listingStatus,
      checkedAt,
      notes: text(raw.notes, 1000),
      savedAt: typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt)) ? raw.savedAt : migratedAt,
    });
  }
  return leads.slice(0, 100);
}

export function normalizeComparisonUrls(value: unknown, leads: SavedLead[]): string[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(leads.map((lead) => lead.url));
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && available.has(entry)) unique.add(entry);
    if (unique.size === MAX_COMPARISON_LEADS) break;
  }
  return [...unique];
}

export function toggleComparisonUrl(current: string[], url: string, leads: SavedLead[]): string[] {
  const normalized = normalizeComparisonUrls(current, leads);
  if (normalized.includes(url)) return normalized.filter((entry) => entry !== url);
  if (!leads.some((lead) => lead.url === url) || normalized.length >= MAX_COMPARISON_LEADS) return normalized;
  return [...normalized, url];
}

function csvCell(value: string): string {
  const spreadsheetSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(spreadsheetSafe) ? `"${spreadsheetSafe.replace(/"/g, '""')}"` : spreadsheetSafe;
}

export function exportShortlistCsv(leads: SavedLead[]): string {
  const rows = leads.map((lead) => [lead.title, lead.source, lead.status, lead.quotedPrice, lead.shippingCost, formatLandedCost(lead), lead.size, lead.condition, returnPolicyLabel(lead.returnPolicy), lead.seller, listingStatusLabel(lead.listingStatus), lead.checkedAt, lead.notes, lead.url, lead.savedAt]);
  return [['Title', 'Source', 'Status', 'Item price', 'Shipping / fees', 'Landed cost', 'Size / variant', 'Condition', 'Returns / protection', 'Seller', 'Listing status', 'Last verified', 'Notes', 'URL', 'Saved at'], ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

const HISTORY_REGIONS = new Set(['global', 'US', 'EU', 'UK', 'Japan', 'China', 'Australia']);
const STATUS_ORDER: Record<LeadStatus, number> = { contender: 0, researching: 1, purchased: 2 };

export function filterAndSortSavedLeads(leads: SavedLead[], filter: ShortlistFilter, sort: ShortlistSort, evidence: EvidenceFilter = 'all', now = new Date()): SavedLead[] {
  const filtered = leads.filter((lead) => {
    const evidenceMatches = evidence === 'all' || (evidence === 'stale'
      ? isLeadVerificationStale(lead, now)
      : (leadMissingFields(lead, now).length === 0) === (evidence === 'complete'));
    return (filter === 'all' || lead.status === filter) && evidenceMatches;
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.savedAt.localeCompare(a.savedAt);
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export function returnPolicyLabel(policy: ReturnPolicy): string {
  return ({ '': '', accepted: 'Returns accepted', 'exchange-only': 'Exchange only', 'final-sale': 'Final sale', 'marketplace-protected': 'Marketplace protection' })[policy];
}

export function listingStatusLabel(status: ListingStatus): string {
  return ({ '': '', available: 'Available', reserved: 'Reserved', sold: 'Sold', removed: 'Listing removed' })[status];
}

const VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function isLeadVerificationStale(lead: Pick<SavedLead, 'status' | 'listingStatus' | 'checkedAt'>, now = new Date()): boolean {
  if (lead.status === 'purchased') return false;
  const checkedAt = Date.parse(lead.checkedAt);
  const age = now.getTime() - checkedAt;
  return !lead.listingStatus || !Number.isFinite(checkedAt) || age > VERIFICATION_MAX_AGE_MS || age < -VERIFICATION_FUTURE_TOLERANCE_MS;
}

export function leadMissingFields(lead: SavedLead, now = new Date()): Array<'price' | 'shipping' | 'size' | 'condition' | 'returns' | 'seller' | 'availability' | 'freshness' | 'notes'> {
  const missing: Array<'price' | 'shipping' | 'size' | 'condition' | 'returns' | 'seller' | 'availability' | 'freshness' | 'notes'> = [];
  if (!lead.quotedPrice.trim()) missing.push('price');
  if (!lead.shippingCost.trim()) missing.push('shipping');
  if (!lead.size.trim()) missing.push('size');
  if (!lead.condition.trim()) missing.push('condition');
  if (!lead.returnPolicy) missing.push('returns');
  if (!lead.seller.trim()) missing.push('seller');
  if (lead.status !== 'purchased' && !lead.listingStatus) missing.push('availability');
  else if (isLeadVerificationStale(lead, now)) missing.push('freshness');
  if (!lead.notes.trim()) missing.push('notes');
  return missing;
}

export type MoneyAmount = { currency: string; amount: number };

const CURRENCY_SYMBOLS = new Set(['$', '€', '£', '¥', '₹', '₩']);

export function parseMoney(input: string): MoneyAmount | null {
  const clean = input.trim();
  if (!clean) return null;
  if (/^(free|included|no charge)$/i.test(clean)) return { currency: '', amount: 0 };
  const symbol = [...CURRENCY_SYMBOLS].find((entry) => clean.includes(entry));
  const code = clean.match(/\b(USD|EUR|GBP|JPY|CNY|CAD|AUD|INR|KRW)\b/i)?.[1].toUpperCase();
  const currency = code || symbol || '';
  const matches = clean.match(/\d[\d.,]*/g);
  if (!matches || matches.length !== 1 || /-\s*\d/.test(clean)) return null;
  const numeric = matches[0];
  const comma = numeric.lastIndexOf(',');
  const dot = numeric.lastIndexOf('.');
  let normalized = numeric;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? numeric.replace(/\./g, '').replace(',', '.')
      : numeric.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(numeric) ? numeric.replace(',', '.') : numeric.replace(/,/g, '');
  } else if (dot >= 0 && !/\.\d{1,2}$/.test(numeric)) {
    normalized = numeric.replace(/\./g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? { currency, amount } : null;
}

export function landedCost(lead: Pick<SavedLead, 'quotedPrice' | 'shippingCost'>): MoneyAmount | null {
  const item = parseMoney(lead.quotedPrice);
  const shipping = parseMoney(lead.shippingCost);
  if (!item || !shipping) return null;
  if (item.currency && shipping.currency && item.currency !== shipping.currency) return null;
  return { currency: item.currency || shipping.currency, amount: item.amount + shipping.amount };
}

export function formatLandedCost(lead: Pick<SavedLead, 'quotedPrice' | 'shippingCost'>): string {
  const total = landedCost(lead);
  if (!total) return '';
  if (!total.currency) return total.amount.toFixed(2);
  if (CURRENCY_SYMBOLS.has(total.currency)) return `${total.currency}${total.amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: total.currency, maximumFractionDigits: total.currency === 'JPY' || total.currency === 'KRW' ? 0 : 2 }).format(total.amount);
  } catch { return `${total.currency} ${total.amount.toFixed(2)}`; }
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

export function exportWorkspaceBackup(saved: SavedLead[], history: SearchHistory[], comparisonUrls: string[] = [], exportedAt = new Date().toISOString()): string {
  const normalizedSaved = normalizeSavedLeads(saved, exportedAt);
  return JSON.stringify({ product: 'ThreadHunt', version: 5, exportedAt, saved: normalizedSaved, history: normalizeSearchHistory(history), comparisonUrls: normalizeComparisonUrls(comparisonUrls, normalizedSaved) }, null, 2);
}

export function parseWorkspaceBackup(input: string, importedAt = new Date().toISOString()): { saved: SavedLead[]; history: SearchHistory[]; comparisonUrls: string[] } {
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error('The selected backup is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The selected file is not a ThreadHunt workspace backup.');
  const backup = value as Record<string, unknown>;
  if (backup.product !== 'ThreadHunt' || ![1, 2, 3, 4, 5].includes(backup.version as number)) throw new Error('The selected file is not a ThreadHunt workspace backup.');
  const saved = normalizeSavedLeads(backup.saved, importedAt);
  return { saved, history: normalizeSearchHistory(backup.history), comparisonUrls: backup.version === 1 ? [] : normalizeComparisonUrls(backup.comparisonUrls, saved) };
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

export type SearchRegion = 'global' | 'US' | 'EU' | 'UK' | 'Japan' | 'China' | 'Australia';
const SEARCH_REGIONS = new Set<SearchRegion>(['global', 'US', 'EU', 'UK', 'Japan', 'China', 'Australia']);

const REGION_RESALE_SITES: Record<Exclude<SearchRegion, 'global'>, string> = {
  US: 'site:ebay.com OR site:poshmark.com OR site:depop.com',
  EU: 'site:vinted.com OR site:zalando.com OR site:vestiairecollective.com',
  UK: 'site:vinted.co.uk OR site:ebay.co.uk OR site:depop.com',
  Japan: 'site:mercari.com OR site:rakuten.co.jp OR site:yahoo.co.jp',
  China: 'site:taobao.com OR site:aliexpress.com OR site:tmall.com',
  Australia: 'site:ebay.com.au OR site:depop.com OR site:facebook.com/marketplace',
};

/**
 * Build the three bucketed DuckDuckGo queries for a given search brief.
 * Region-specific resale queries replace the generic resale bucket when
 * a non-global region is selected, surfacing leads from marketplaces
 * the shopper can actually buy from.
 */
export function buildSearchQueries(query: string, region: unknown, maxPrice: string): string[] {
  const priceClause = maxPrice.trim() ? `under ${maxPrice.trim()}` : 'sale price';
  const resaleSites = typeof region === 'string' && SEARCH_REGIONS.has(region as SearchRegion) && region !== 'global'
    ? REGION_RESALE_SITES[region as Exclude<SearchRegion, 'global'>]
    : 'site:ebay.com OR site:vinted.com OR site:depop.com OR site:poshmark.com';
  return [
    `${query} clothing ${priceClause} ${region} buy online`,
    `${query} ${resaleSites}`,
    `${query} dupe alternative similar cheaper`,
  ];
}

export const SEARCH_SOURCE_LABELS = ['web', 'resale', 'alternatives'] as const;
