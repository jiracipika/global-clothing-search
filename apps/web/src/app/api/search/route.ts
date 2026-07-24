import { NextRequest, NextResponse } from 'next/server';
import { buildMarkets, sortMarketsByRegion } from '@/lib/markets';
import { buildSearchQueries, mergeResults, parseDdgHtml, SEARCH_SOURCE_LABELS, type SearchResult } from '@/lib/search-domain';

export const runtime = 'nodejs';
const REGIONS = new Set(['global', 'US', 'EU', 'UK', 'Japan', 'China', 'Australia']);
const buckets = new Map<string, { count: number; reset: number }>();
const cache = new Map<string, { expires: number; value: SearchResult[] }>();

function limited(ip: string) {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.reset < now) { buckets.set(ip, { count: 1, reset: now + 60_000 }); return false; }
  bucket.count += 1;
  return bucket.count > 12;
}

async function duckDuckGoHtml(query: string): Promise<SearchResult[]> {
  const cached = cache.get(query);
  if (cached && cached.expires > Date.now()) return cached.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ThreadHunt/1.0; shopping research)', accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: query }),
    });
    if (!res.ok) throw new Error(`upstream status ${res.status}`);
    const html = await res.text();
    if (html.length > 2_000_000) throw new Error('upstream response too large');
    const value = parseDdgHtml(html);
    cache.set(query, { expires: Date.now() + 5 * 60_000, value });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    return value;
  } finally { clearTimeout(timer); }
}

type SearchPayload = { query: string; region: string; maxPrice: string };

function parseInput(input: Record<string, unknown>): SearchPayload | { error: string; status: number } {
  if (typeof input.query !== 'string') return { error: 'Query must be text.', status: 400 };
  const query = input.query.replace(/\s+/g, ' ').trim();
  if (query.length < 2 || query.length > 160) return { error: 'Query must be 2–160 characters.', status: 400 };
  const region = typeof input.region === 'string' && REGIONS.has(input.region) ? input.region : 'global';
  const maxPrice = typeof input.maxPrice === 'string' ? input.maxPrice.replace(/\s+/g, ' ').trim() : '';
  if (maxPrice.length > 30) return { error: 'Price target is too long.', status: 400 };
  return { query, region, maxPrice };
}

async function executeSearch(payload: SearchPayload, ip: string) {
  if (limited(ip)) return NextResponse.json({ error: 'Too many searches. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  const searches = buildSearchQueries(payload.query, payload.region, payload.maxPrice);
  const settled = await Promise.allSettled(searches.map(duckDuckGoHtml));
  const diagnostics = settled.map((result, index) => ({ source: SEARCH_SOURCE_LABELS[index], status: result.status === 'fulfilled' ? 'ok' : 'unavailable', count: result.status === 'fulfilled' ? result.value.length : 0 }));
  const results = mergeResults(settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
  const markets = sortMarketsByRegion(buildMarkets(payload.query), payload.region);
  return NextResponse.json({ query: payload.query, generatedAt: new Date().toISOString(), results, diagnostics, markets, freeSources: ['DuckDuckGo HTML search', 'marketplace search URLs', 'manual visual-search handoff links'], caveats: ['Listings are leads: verify total price, sizing, seller, authenticity, and returns.', 'Visual search providers require a manual handoff because their public APIs are restricted.'] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  try {
    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    const parsed = parseInput(body as Record<string, unknown>);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const result = await executeSearch(parsed, ip);
    return result;
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Malformed JSON.' : 'Search is temporarily unavailable.';
    console.error('search route error', error);
    return NextResponse.json({ error: message }, { status: error instanceof SyntaxError ? 400 : 502 });
  }
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  try {
    const { searchParams } = req.nextUrl;
    const parsed = parseInput(Object.fromEntries(searchParams));
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const result = await executeSearch(parsed, ip);
    return result;
  } catch (error) {
    console.error('search route error', error);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 502 });
  }
}
