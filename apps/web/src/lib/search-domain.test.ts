import { describe, expect, it } from 'vitest';
import { decodeDdgUrl, decodeHtml, filterAndSort, mergeResults, parseDdgHtml, safePublicUrl, type SearchResult } from './search-domain';

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
