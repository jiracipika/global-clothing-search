import { NextRequest, NextResponse } from 'next/server';
import { buildMarkets } from '@/lib/markets';
import { parseDuckDuckGoHtml, type DdgResult } from '@/lib/ddg';

export const runtime = 'nodejs';

async function duckDuckGoHtml(query: string): Promise<DdgResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ThreadHunt/0.1 clothing price research',
      accept: 'text/html',
    },
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
  const html = await res.text();
  return parseDuckDuckGoHtml(html);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query ?? '').trim();
    const region = String(body.region ?? 'global').trim();
    const maxPrice = String(body.maxPrice ?? '').trim();
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

    const pricePhrase = maxPrice ? ` under ${maxPrice}` : ' cheap sale price';
    const searchQuery = `${query} clothing ${pricePhrase} ${region} buy online`;
    const [web, used, dupes] = await Promise.allSettled([
      duckDuckGoHtml(searchQuery),
      duckDuckGoHtml(`${query} site:ebay.com OR site:vinted.com OR site:depop.com OR site:poshmark.com`),
      duckDuckGoHtml(`${query} dupe alternative similar cheaper`),
    ]);

    const collect = (...sets: PromiseSettledResult<DdgResult[]>[]) => {
      const seen = new Set<string>();
      return sets.flatMap((s) => s.status === 'fulfilled' ? s.value : []).filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      }).slice(0, 18);
    };

    return NextResponse.json({
      query,
      generatedAt: new Date().toISOString(),
      freeSources: ['DuckDuckGo HTML search', 'marketplace search URLs', 'manual visual-search handoff links'],
      results: collect(web, used, dupes),
      markets: buildMarkets(query),
      caveats: [
        'Reverse image engines rarely expose free legal APIs; this app creates the handoff links and frame/image workflow instead of pretending a paid API is free.',
        'Marketplace prices can change or include shipping later. Treat results as leads, not final checkout totals.',
        'Cheap luxury listings need counterfeit checks.',
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown search error' }, { status: 500 });
  }
}
