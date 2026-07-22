import { describe, expect, it } from 'vitest';
import {
  createSavedLead,
  decodeDdgUrl,
  decodeHtml,
  exportShortlistCsv,
  exportWorkspaceBackup,
  filterAndSort,
  filterAndSortSavedLeads,
  leadMissingFields,
  mergeResults,
  normalizeSavedLeads,
  parseDdgHtml,
  parseWorkspaceBackup,
  safePublicUrl,
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
      size: '',
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
      status: 'contender', quotedPrice: '$120', size: 'M', notes: 'x'.repeat(1200), savedAt: '2026-07-21T00:00:00.000Z',
    }]);

    expect(saved[0].status).toBe('contender');
    expect(saved[0].quotedPrice).toBe('$120');
    expect(saved[0].notes).toHaveLength(1000);
  });

  it('exports spreadsheet-safe CSV with research context', () => {
    const lead = { ...createSavedLead(result('"Wool, coat"', 'https://shop.test/coat'), '2026-07-22T00:00:00.000Z'), status: 'contender' as const, quotedPrice: '=1+1', size: 'M', notes: 'Seller says "new"' };
    const csv = exportShortlistCsv([lead]);

    expect(csv).toContain('Title,Source,Status,Quoted price,Size,Notes,URL,Saved at');
    expect(csv).toContain('"""Wool, coat"""');
    expect(csv).toContain("'=1+1");
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

  it('identifies the evidence still missing from a lead', () => {
    const lead = createSavedLead(result('Coat', 'https://shop.test/coat'));
    expect(leadMissingFields(lead)).toEqual(['price', 'size', 'notes']);
    expect(leadMissingFields({ ...lead, quotedPrice: '$80', size: 'M', notes: 'Returns accepted' })).toEqual([]);
  });

  it('round-trips a versioned portable workspace backup', () => {
    const lead = { ...createSavedLead(result('Coat', 'https://shop.test/coat'), '2026-07-21T00:00:00.000Z'), notes: 'Check measurements' };
    const history = [{ query: 'wool coat', region: 'UK', at: '2026-07-21T10:00:00.000Z' }];
    const backup = exportWorkspaceBackup([lead], history, '2026-07-22T00:00:00.000Z');
    const restored = parseWorkspaceBackup(backup, '2026-07-22T00:00:00.000Z');

    expect(restored.saved).toEqual([lead]);
    expect(restored.history).toEqual(history);
    expect(JSON.parse(backup)).toMatchObject({ product: 'ThreadHunt', version: 1, exportedAt: '2026-07-22T00:00:00.000Z' });
  });

  it('rejects invalid backups and bounds imported history', () => {
    expect(() => parseWorkspaceBackup('{"product":"Other","version":1}')).toThrow('not a ThreadHunt workspace backup');
    expect(() => parseWorkspaceBackup('not json')).toThrow('valid JSON');
    const backup = JSON.stringify({ product: 'ThreadHunt', version: 1, saved: [], history: Array.from({ length: 20 }, (_, index) => ({ query: `coat ${index}`, region: 'global', at: '2026-07-21T10:00:00.000Z' })) });
    expect(parseWorkspaceBackup(backup).history).toHaveLength(8);
  });
});
