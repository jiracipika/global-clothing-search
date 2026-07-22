import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDuckDuckGoHtml } from './ddg.ts';

const result = (classSuffix = ' ') => `
  <div class="result results_links results_links_deep web-result${classSuffix}">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example%2Fblack-cardigan&amp;rut=abc">Black &amp; ribbed cardigan</a>
    </h2>
    <a class="result__snippet">Soft &quot;cotton&quot; layer</a>
  </div>`;

test('parses current DuckDuckGo result markup with trailing class whitespace', () => {
  const [item] = parseDuckDuckGoHtml(result());
  assert.deepEqual(item, {
    title: 'Black & ribbed cardigan',
    url: 'https://shop.example/black-cardigan',
    snippet: 'Soft "cotton" layer',
    source: 'shop.example',
  });
});

test('continues to parse the older exact class form', () => {
  assert.equal(parseDuckDuckGoHtml(result('')).length, 1);
});

test('rejects non-http redirect targets', () => {
  const html = '<div class="result results_links results_links_deep web-result "><a rel="nofollow" class="result__a" href="javascript:alert(1)">Bad</a></div>';
  assert.deepEqual(parseDuckDuckGoHtml(html), []);
});

test('honors the result limit', () => {
  assert.equal(parseDuckDuckGoHtml(result().repeat(3), 2).length, 2);
});
