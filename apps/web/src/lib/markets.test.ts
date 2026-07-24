import { describe, expect, it } from 'vitest';
import { buildMarkets, exampleQueries, sortMarketsByRegion } from './markets';

describe('buildMarkets', () => {
  it('produces markets with encoded query in their URLs', () => {
    const markets = buildMarkets('wool coat size M');
    expect(markets.length).toBeGreaterThanOrEqual(15);
    const ebay = markets.find((m) => m.name === 'eBay');
    expect(ebay?.url).toContain('wool%20coat%20size%20M');
  });

  it('every market has required fields and a valid URL', () => {
    for (const m of buildMarkets('dress')) {
      expect(m.name).toBeTruthy();
      expect(m.region).toBeTruthy();
      expect(['marketplace', 'brand', 'luxury', 'secondhand', 'search']).toContain(m.kind);
      expect(m.notes).toBeTruthy();
      expect(() => new URL(m.url)).not.toThrow();
    }
  });

  it('encodes special characters safely', () => {
    const markets = buildMarkets('shirt & tie "black"');
    const amazon = markets.find((m) => m.name === 'Amazon');
    expect(amazon?.url).not.toContain('"');
    expect(amazon?.url).not.toContain(' ');
  });

  it('handles empty query gracefully', () => {
    const markets = buildMarkets('');
    expect(markets.length).toBeGreaterThan(0);
    expect(() => new URL(markets[0].url)).not.toThrow();
  });
});

describe('sortMarketsByRegion', () => {
  it('returns markets unchanged for global region', () => {
    const markets = buildMarkets('coat');
    const sorted = sortMarketsByRegion(markets, 'global');
    expect(sorted.map((m) => m.name)).toEqual(markets.map((m) => m.name));
  });

  it('returns markets unchanged for invalid region', () => {
    const markets = buildMarkets('coat');
    const sorted = sortMarketsByRegion(markets, 'Antarctica');
    expect(sorted).toEqual(markets);
  });

  it('prioritizes US-relevant marketplaces when US is selected', () => {
    const markets = buildMarkets('coat');
    const sorted = sortMarketsByRegion(markets, 'US');
    const firstFew = sorted.slice(0, 8);
    // Visual search tools always stay first; after that, US-prioritized names appear
    const usMarkets = firstFew.filter((m) => ['Poshmark', 'The RealReal', 'Amazon', 'eBay', 'Etsy', 'Depop'].includes(m.name));
    expect(usMarkets.length).toBeGreaterThan(0);
    // No non-prioritized market should appear before a prioritized one
    const priorityNames = new Set(['Poshmark', 'The RealReal', 'Amazon', 'eBay', 'Etsy', 'Depop', 'Google Lens', 'Bing visual search', 'Yandex images', 'DuckDuckGo shopping/web']);
    const nonPriorityIndex = sorted.findIndex((m) => !priorityNames.has(m.name));
    const lastPriorityIndex = sorted.map((m) => priorityNames.has(m.name)).lastIndexOf(true);
    if (nonPriorityIndex !== -1 && lastPriorityIndex !== -1) {
      expect(nonPriorityIndex).toBeGreaterThan(lastPriorityIndex);
    }
  });

  it('prioritizes EU-relevant marketplaces when EU is selected', () => {
    const sorted = sortMarketsByRegion(buildMarkets('coat'), 'EU');
    const firstFew = sorted.slice(0, 8);
    expect(firstFew.some((m) => ['Vinted', 'Zalando', 'ASOS'].includes(m.name))).toBe(true);
  });

  it('preserves all markets (no data loss)', () => {
    const markets = buildMarkets('coat');
    const sorted = sortMarketsByRegion(markets, 'Japan');
    expect(sorted).toHaveLength(markets.length);
    expect(new Set(sorted.map((m) => m.name))).toEqual(new Set(markets.map((m) => m.name)));
  });

  it('does not mutate the input array', () => {
    const markets = buildMarkets('coat');
    const original = markets.map((m) => m.name);
    sortMarketsByRegion(markets, 'UK');
    expect(markets.map((m) => m.name)).toEqual(original);
  });
});

describe('exampleQueries', () => {
  it('provides non-empty example queries for the UI', () => {
    expect(exampleQueries.length).toBeGreaterThan(0);
    for (const q of exampleQueries) {
      expect(q.trim().length).toBeGreaterThanOrEqual(2);
    }
  });
});
