# ThreadHunt

ThreadHunt is a free-source clothing price search workbench.

It helps a user search for cheaper clothing matches globally using:

- DuckDuckGo HTML web search through a Next.js route handler
- Marketplace jump links for eBay, AliExpress, Temu, Amazon, Etsy, Vinted, Depop, Poshmark, Grailed, The RealReal, Vestiaire, ASOS, Zara, H&M, Uniqlo, SHEIN, Zalando, and Farfetch
- Manual reverse-image handoff links for Google Lens, Bing Visual Search, Yandex Images, Pinterest Lens, and AliExpress
- Browser-side image palette extraction
- Browser-side video frame extraction for visual searching

Important honesty note: most true reverse-image and shopping APIs are paid, key-gated, or legally restricted. This app uses free sources and direct search handoffs instead of pretending a paid API is free.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

## Deploy

The repo is Vercel-ready. Import it into Vercel and set the project root to:

`apps/web`

No environment variables are required for the current free-source version.
