export type DdgResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

function decodeEntities(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(input: string) {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDdgUrl(raw: string) {
  const decoded = decodeEntities(raw);
  try {
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : decoded;
  } catch {
    return decoded;
  }
}

export function parseDuckDuckGoHtml(html: string, limit = 8): DdgResult[] {
  const chunks = html
    .split(/<div\s+class="[^"]*\bresult\s+results_links\s+results_links_deep\s+web-result\b[^"]*"[^>]*>/gi)
    .slice(1, limit + 1);

  const results: DdgResult[] = [];
  for (const chunk of chunks) {
    const linkMatch = chunk.match(/<a\s+rel="nofollow"\s+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = chunk.match(/<(?:a|div)\s+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const url = decodeDdgUrl(linkMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;

    let source = url;
    try {
      source = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // The protocol check above keeps malformed links out; retain the URL as a fallback label.
    }

    results.push({
      title: stripTags(linkMatch[2]),
      url,
      snippet: stripTags(snippetMatch?.[1] ?? ''),
      source,
    });
  }
  return results;
}
