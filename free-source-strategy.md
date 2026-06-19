# Free source strategy

## What is genuinely free right now

- DuckDuckGo HTML search: no API key, usable from server route handlers, may rate limit.
- Marketplace search URLs: reliable handoff to each marketplace's own search page.
- Browser image/video processing: preview, color extraction, and frame extraction happen locally without an API.
- Manual visual search engines: Google Lens, Bing Visual Search, Yandex Images, Pinterest Lens.

## What is not honestly free

- Google Shopping API: not freely available for general product search.
- Google Lens API: no official free public API.
- Amazon Product Advertising API: requires approval and affiliate account.
- eBay Browse API: free tier exists, but requires developer app credentials and OAuth.
- SerpAPI, Zenserp, DataForSEO, Oxylabs, Bright Data: useful, but paid.

## Future upgrades when keys are available

- eBay Browse API for structured prices and item URLs.
- SerpAPI Google Lens or Google Shopping for richer reverse-image results.
- Vinted/Depop/Poshmark unofficial scrapers only if legal/rate-limit risk is accepted.
- A small CLIP embedding service for local similarity against user-saved products.
