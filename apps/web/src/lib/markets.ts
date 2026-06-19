export type Market = {
  name: string;
  region: string;
  kind: 'marketplace' | 'brand' | 'luxury' | 'secondhand' | 'search';
  url: string;
  notes: string;
};

const q = (query: string) => encodeURIComponent(query.trim());

export function buildMarkets(query: string): Market[] {
  const e = q(query);
  return [
    { name: 'Google Lens', region: 'global', kind: 'search', url: 'https://lens.google.com/uploadbyurl?url=', notes: 'Best reverse image path, paste an image URL or upload manually.' },
    { name: 'Bing visual search', region: 'global', kind: 'search', url: 'https://www.bing.com/visualsearch', notes: 'Free visual match workflow; upload image manually.' },
    { name: 'Yandex images', region: 'global', kind: 'search', url: 'https://yandex.com/images/search', notes: 'Often strong for exact visual matches.' },
    { name: 'DuckDuckGo shopping/web', region: 'global', kind: 'search', url: `https://duckduckgo.com/?q=${e}+clothing+price+shop`, notes: 'Privacy-friendly broad web search.' },
    { name: 'eBay', region: 'global', kind: 'marketplace', url: `https://www.ebay.com/sch/i.html?_nkw=${e}`, notes: 'Used/new price floor and sold-comps if you filter manually.' },
    { name: 'AliExpress', region: 'global/CN', kind: 'marketplace', url: `https://www.aliexpress.com/wholesale?SearchText=${e}`, notes: 'Cheap global listings; watch shipping time and counterfeit risk.' },
    { name: 'Temu', region: 'global/CN', kind: 'marketplace', url: `https://www.temu.com/search_result.html?search_key=${e}`, notes: 'Very cheap, quality varies heavily.' },
    { name: 'Amazon', region: 'global', kind: 'marketplace', url: `https://www.amazon.com/s?k=${e}`, notes: 'Good for alternatives, not always cheapest.' },
    { name: 'Etsy', region: 'global', kind: 'marketplace', url: `https://www.etsy.com/search?q=${e}`, notes: 'Handmade/vintage lookalikes.' },
    { name: 'Vinted', region: 'EU/US', kind: 'secondhand', url: `https://www.vinted.com/catalog?search_text=${e}`, notes: 'Secondhand price discovery.' },
    { name: 'Depop', region: 'global', kind: 'secondhand', url: `https://www.depop.com/search/?q=${e}`, notes: 'Streetwear and youth resale.' },
    { name: 'Poshmark', region: 'US/CA', kind: 'secondhand', url: `https://poshmark.com/search?query=${e}&type=listings`, notes: 'US resale comps.' },
    { name: 'Grailed', region: 'global', kind: 'secondhand', url: `https://www.grailed.com/shop/${e}`, notes: 'Menswear/designer resale.' },
    { name: 'The RealReal', region: 'US', kind: 'luxury', url: `https://www.therealreal.com/products?keywords=${e}`, notes: 'Authenticated luxury reference prices.' },
    { name: 'Vestiaire Collective', region: 'global', kind: 'luxury', url: `https://www.vestiairecollective.com/search/?q=${e}`, notes: 'Designer resale across regions.' },
    { name: 'ASOS', region: 'global/UK', kind: 'brand', url: `https://www.asos.com/search/?q=${e}`, notes: 'Fast fashion and brand aggregation.' },
    { name: 'Zara', region: 'global/ES', kind: 'brand', url: `https://www.zara.com/search?searchTerm=${e}`, notes: 'Official brand search.' },
    { name: 'H&M', region: 'global/SE', kind: 'brand', url: `https://www2.hm.com/en_us/search-results.html?q=${e}`, notes: 'Official cheaper basics.' },
    { name: 'Uniqlo', region: 'global/JP', kind: 'brand', url: `https://www.uniqlo.com/us/en/search?q=${e}`, notes: 'Official basics and alternatives.' },
    { name: 'SHEIN', region: 'global/CN', kind: 'brand', url: `https://us.shein.com/pdsearch/${e}/`, notes: 'Very cheap trend matches; quality/ethics caveat.' },
    { name: 'Zalando', region: 'EU', kind: 'marketplace', url: `https://www.zalando.com/catalog/?q=${e}`, notes: 'EU prices for popular brands.' },
    { name: 'Farfetch', region: 'global', kind: 'luxury', url: `https://www.farfetch.com/shopping/search/items.aspx?q=${e}`, notes: 'Luxury retail high-anchor pricing.' },
  ];
}

export const exampleQueries = [
  'black ribbed cropped cardigan',
  'white linen drawstring pants',
  'nike acg fleece vest green',
  'boxy leather bomber jacket women',
  'wide leg cargo jeans washed black',
];
