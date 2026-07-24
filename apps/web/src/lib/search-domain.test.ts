import { describe, expect, it } from 'vitest';
import {
  buildSearchQueries,
  createSavedLead,
  decodeDdgUrl,
  decodeHtml,
  exportShortlistCsv,
  exportWorkspaceBackup,
  filterAndSort,
  filterAndSortSavedLeads,
  formatLandedCost,
  isLeadVerificationStale,
  landedCost,
  leadMissingFields,
  mergeResults,
  normalizeComparisonUrls,
  normalizeSavedLeads,
  parseDdgHtml,
  parseMoney,
  parseWorkspaceBackup,
  safePublicUrl,
  toggleComparisonUrl,
  type SearchResult,
} from './search-domain';

const result = (title: string, url: string, source = 'shop.test'): SearchResult => ({ title, url, source, snippet: `${title} details` });

describe('DuckDuckGo parsing', () => {
  it('extracts, decodes and sanitizes results', () => {
    const html = `<div class="result results_links web-result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example%2Fcoat">Wool &amp; Coat</a></h2><a class="result__snippet">Warm <b>coat</b> &quot;sale&quot;</a></div>`;
    expect(parseDdgHtml(html)).toEqual([{ title: 'Wool & Coat', url: 'https://shop.example/coat', snippet: 'Warm coat "sale"', source: 'shop.example' }]);
  });
  it('decodes wrappers and rejects unsafe destinations', () => {
    expect(decodeDdgUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fx')).toBe('https://example.com/x');
    expect(safePublicUrl('http://127.0.0.1/admin')).toBeNull(); expect(safePublicUrl('javascript:alert(1)')).toBeNull();
  });
  it('strips active markup and normalizes text', () => { expect(decodeHtml('<script>x</script> A   <b>B</b>')).toBe('A B'); });
});

describe('research domain', () => {
  it('deduplicates groups while preserving rank', () => { expect(mergeResults([[result('A','https://a.test')],[result('Again','https://a.test/'),result('B','https://b.test')]]) .map((x) => x.title)).toEqual(['A','B']); });
  it('filters all useful fields and sorts without mutating input', () => { const input=[result('Zebra','https://z.test','z.test'),result('Alpha','https://a.test','a.test')]; expect(filterAndSort(input,'a.test','relevance')).toHaveLength(1); expect(filterAndSort(input,'','title').map(x=>x.title)).toEqual(['Alpha','Zebra']); expect(input[0].title).toBe('Zebra'); });
});

describe('shortlist research workflow', () => {
  it('creates an editable lead with stable research defaults', () => {
    expect(createSavedLead(result('Coat', 'https://shop.test/coat'), '2026-07-22T00:00:00.000Z')).toEqual({
      ...result('Coat', 'https://shop.test/coat'),
      status: 'researching',
      quotedPrice: '',
      shippingCost: '',
      size: '',
      condition: '',
      returnPolicy: '',
      seller: '',
      listingStatus: '',
      checkedAt: '',
      notes: '',
      savedAt: '2026-07-22T00:00:00.000Z',
    });
  });

  it('migrates legacy storage, rejects malformed entries, and deduplicates URLs', () => {
    const legacy = result('Legacy coat', 'https://shop.test/coat');
    const saved = normalizeSavedLeads([
      legacy,
      { ...legacy, title: 'Duplicate' },
      { title: 'Unsafe', url: 'javascript:alert(1)', source: 'bad', snippet: '' },
      null,
    ], '2026-07-22T00:00:00.000Z');

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: 'Legacy coat', status: 'researching', notes: '' });
  });

  it('preserves valid research fields while bounding user-entered text', () => {
    const saved = normalizeSavedLeads([{
      ...result('Coat', 'https://shop.test/coat'),
      status: 'contender', quotedPrice: '$120', shippingCost: 'free', size: 'M', condition: 'New with tags', returnPolicy: 'accepted', seller: '  Studio seller  ', listingStatus: 'available', checkedAt: '2026-07-22T00:00:00.000Z', notes: 'x'.repeat(1200), savedAt: '2026-07-21T00:00:00.000Z',
    }]);

    expect(saved[0].status).toBe('contender');
    expect(saved[0].quotedPrice).toBe('$120');
    expect(saved[0].condition).toBe('New with tags');
    expect(saved[0].returnPolicy).toBe('accepted');
    expect(saved[0]).toMatchObject({ seller: 'Studio seller', listingStatus: 'available', checkedAt: '2026-07-22T00:00:00.000Z' });
    expect(saved[0].notes).toHaveLength(1000);
  });

  it('exports spreadsheet-safe CSV with research context', () => {
    const lead = { ...createSavedLead(result('"Wool, coat"', 'https://shop.test/coat'), '2026-07-22T00:00:00.000Z'), status: 'contender' as const, quotedPrice: '=1+1', shippingCost: '+$8', size: 'M', condition: 'Used, excellent', returnPolicy: 'final-sale' as const, seller: '@trusted-shop', listingStatus: 'available' as const, checkedAt: '2026-07-22T12:00:00.000Z', notes: 'Seller says "new"' };
    const csv = exportShortlistCsv([lead]);

    expect(csv).toContain('Title,Source,Status,Item price,Shipping / fees,Landed cost,Size / variant,Condition,Returns / protection,Seller,Listing status,Last verified,Notes,URL,Saved at');
    expect(csv).toContain('"""Wool, coat"""');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"Used, excellent",Final sale');
    expect(csv).toContain("'@trusted-shop,Available,2026-07-22T12:00:00.000Z");
    expect(csv).toContain('"Seller says ""new"""');
  });

  it('filters and sorts the decision queue without mutating saved order', () => {
    const older = { ...createSavedLead(result('Zebra coat', 'https://shop.test/z'), '2026-07-20T00:00:00.000Z'), status: 'contender' as const };
    const newer = createSavedLead(result('Alpha coat', 'https://shop.test/a'), '2026-07-22T00:00:00.000Z');
    const input = [older, newer];

    expect(filterAndSortSavedLeads(input, 'contender', 'newest')).toEqual([older]);
    expect(filterAndSortSavedLeads(input, 'all', 'title').map((lead) => lead.title)).toEqual(['Alpha coat', 'Zebra coat']);
    expect(filterAndSortSavedLeads(input, 'all', 'newest').map((lead) => lead.title)).toEqual(['Alpha coat', 'Zebra coat']);
    expect(input).toEqual([older, newer]);
  });

  it('identifies the evidence still missing from a lead and filters the research queue', () => {
    const lead = createSavedLead(result('Coat', 'https://shop.test/coat'));
    const now = new Date('2026-07-23T00:00:00.000Z');
    const complete = { ...lead, quotedPrice: '$80', shippingCost: 'free', size: 'M', condition: 'New', returnPolicy: 'accepted' as const, seller: 'Seller 42', listingStatus: 'available' as const, checkedAt: '2026-07-22T00:00:00.000Z', notes: 'Seller measurements checked' };
    expect(leadMissingFields(lead, now)).toEqual(['price', 'shipping', 'size', 'condition', 'returns', 'seller', 'availability', 'notes']);
    expect(leadMissingFields(complete, now)).toEqual([]);
    expect(filterAndSortSavedLeads([lead, complete], 'all', 'newest', 'complete', now)).toEqual([complete]);
    expect(filterAndSortSavedLeads([lead, complete], 'all', 'newest', 'incomplete', now)).toEqual([lead]);
  });

  it('surfaces stale listing verification separately from other missing evidence', () => {
    const now = new Date('2026-07-23T00:00:00.000Z');
    const fresh = { ...createSavedLead(result('Fresh', 'https://shop.test/fresh')), listingStatus: 'available' as const, checkedAt: '2026-07-16T00:00:01.000Z' };
    const stale = { ...createSavedLead(result('Stale', 'https://shop.test/stale')), listingStatus: 'available' as const, checkedAt: '2026-07-15T23:59:59.000Z' };
    const missingStatus = { ...createSavedLead(result('Missing status', 'https://shop.test/missing')), checkedAt: '2026-07-22T00:00:00.000Z' };
    const futureDated = { ...createSavedLead(result('Future', 'https://shop.test/future')), listingStatus: 'available' as const, checkedAt: '2026-07-24T00:00:00.000Z' };
    const purchased = { ...stale, status: 'purchased' as const };
    expect(isLeadVerificationStale(fresh, now)).toBe(false);
    expect(isLeadVerificationStale(stale, now)).toBe(true);
    expect(isLeadVerificationStale(missingStatus, now)).toBe(true);
    expect(isLeadVerificationStale(futureDated, now)).toBe(true);
    expect(isLeadVerificationStale(purchased, now)).toBe(false);
    expect(filterAndSortSavedLeads([fresh, stale, missingStatus, futureDated, purchased], 'all', 'newest', 'stale', now)).toEqual([stale, missingStatus, futureDated]);
  });

  it('calculates landed cost only from compatible, parseable amounts', () => {
    expect(parseMoney('$1,299.50')).toEqual({ currency: '$', amount: 1299.5 });
    expect(parseMoney('EUR 12,50')).toEqual({ currency: 'EUR', amount: 12.5 });
    expect(parseMoney('EUR 1.234,56')).toEqual({ currency: 'EUR', amount: 1234.56 });
    expect(parseMoney('free')).toEqual({ currency: '', amount: 0 });
    expect(parseMoney('ask seller')).toBeNull();
    expect(parseMoney('$80–$95')).toBeNull();
    expect(landedCost({ quotedPrice: '$95', shippingCost: '$8.50' })).toEqual({ currency: '$', amount: 103.5 });
    expect(formatLandedCost({ quotedPrice: '$95', shippingCost: 'included' })).toBe('$95.00');
    expect(landedCost({ quotedPrice: 'USD 95', shippingCost: 'EUR 8' })).toBeNull();
  });

  it('maintains a bounded, unique comparison set containing only saved leads', () => {
    const leads = Array.from({ length: 5 }, (_, index) => createSavedLead(result(`Coat ${index}`, `https://shop.test/${index}`)));
    expect(normalizeComparisonUrls([leads[0].url, 'https://missing.test', leads[0].url, ...leads.slice(1).map((lead) => lead.url)], leads)).toEqual(leads.slice(0, 4).map((lead) => lead.url));
    expect(toggleComparisonUrl([], leads[0].url, leads)).toEqual([leads[0].url]);
    expect(toggleComparisonUrl([leads[0].url], leads[0].url, leads)).toEqual([]);
    expect(toggleComparisonUrl(leads.slice(0, 4).map((lead) => lead.url), leads[4].url, leads)).toEqual(leads.slice(0, 4).map((lead) => lead.url));
  });

  it('round-trips a versioned portable workspace backup', () => {
    const lead = { ...createSavedLead(result('Coat', 'https://shop.test/coat'), '2026-07-21T00:00:00.000Z'), notes: 'Check measurements' };
    const history = [{ query: 'wool coat', region: 'UK', at: '2026-07-21T10:00:00.000Z' }];
    const backup = exportWorkspaceBackup([lead], history, [lead.url], '2026-07-22T00:00:00.000Z');
    const restored = parseWorkspaceBackup(backup, '2026-07-22T00:00:00.000Z');

    expect(restored.saved).toEqual([lead]);
    expect(restored.history).toEqual(history);
    expect(restored.comparisonUrls).toEqual([lead.url]);
    expect(JSON.parse(backup)).toMatchObject({ product: 'ThreadHunt', version: 5, exportedAt: '2026-07-22T00:00:00.000Z' });
  });

  it('rejects invalid backups and bounds imported history', () => {
    expect(() => parseWorkspaceBackup('{"product":"Other","version":1}')).toThrow('not a ThreadHunt workspace backup');
    expect(() => parseWorkspaceBackup('not json')).toThrow('valid JSON');
    const backup = JSON.stringify({ product: 'ThreadHunt', version: 1, saved: [], history: Array.from({ length: 20 }, (_, index) => ({ query: `coat ${index}`, region: 'global', at: '2026-07-21T10:00:00.000Z' })) });
    expect(parseWorkspaceBackup(backup).history).toHaveLength(8);
  });

  it('restores version 1 backups without comparison state', () => {
    const legacy = JSON.stringify({ product: 'ThreadHunt', version: 1, saved: [result('Coat', 'https://shop.test/coat')], history: [] });
    expect(parseWorkspaceBackup(legacy).comparisonUrls).toEqual([]);
  });

  it('migrates version 3 comparison backups to purchase-risk evidence defaults', () => {
    const url = 'https://shop.test/coat';
    const legacy = JSON.stringify({ product: 'ThreadHunt', version: 3, saved: [result('Coat', url)], history: [], comparisonUrls: [url] });
    const restored = parseWorkspaceBackup(legacy);
    expect(restored.comparisonUrls).toEqual([url]);
    expect(restored.saved[0]).toMatchObject({ condition: '', returnPolicy: '' });
  });

  it('migrates version 4 backups to listing-verification defaults', () => {
    const legacy = JSON.stringify({ product: 'ThreadHunt', version: 4, saved: [result('Coat', 'https://shop.test/coat')], history: [], comparisonUrls: [] });
    expect(parseWorkspaceBackup(legacy).saved[0]).toMatchObject({ seller: '', listingStatus: '', checkedAt: '' });
  });

  it('drops verification dates that are not paired with a valid listing status', () => {
    const malformed = { ...result('Coat', 'https://shop.test/coat'), listingStatus: 'unknown', checkedAt: '2026-07-22T00:00:00.000Z' };
    expect(normalizeSavedLeads([malformed])[0]).toMatchObject({ listingStatus: '', checkedAt: '' });
  });
});

describe('region-aware search queries', () => {
  it('produces three bucketed queries with a generic resale set for global region', () => {
    const queries = buildSearchQueries('wool coat', 'global', '');
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('wool coat clothing sale price global buy online');
    expect(queries[1]).toContain('site:ebay.com OR site:vinted.com OR site:depop.com OR site:poshmark.com');
    expect(queries[2]).toBe('wool coat dupe alternative similar cheaper');
  });

  it('uses region-specific resale sites when a non-global region is selected', () => {
    const queries = buildSearchQueries('wool coat', 'EU', '');
    expect(queries[1]).toContain('site:vinted.com OR site:zalando.com OR site:vestiairecollective.com');
    expect(queries[1]).not.toContain('site:poshmark.com');
  });

  it('embeds the price target into the web-search bucket', () => {
    const queries = buildSearchQueries('wool coat', 'US', '$80');
    expect(queries[0]).toContain('under $80');
    expect(queries[0]).toContain('US');
  });

  it('falls back to the generic resale set for invalid or unknown regions', () => {
    const queries = buildSearchQueries('wool coat', 'Antarctica', '');
    expect(queries[1]).toContain('site:ebay.com OR site:vinted.com OR site:depop.com OR site:poshmark.com');
  });

  it('always produces exactly three queries regardless of inputs', () => {
    expect(buildSearchQueries('x', 'global', '')).toHaveLength(3);
    expect(buildSearchQueries('x', 'Japan', '¥5000')).toHaveLength(3);
    expect(buildSearchQueries('x', null, '')).toHaveLength(3);
  });
});
