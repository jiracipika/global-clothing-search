# ThreadHunt

ThreadHunt is a private, free-source shopping-research workbench. It combines live open-web leads, direct marketplace searches, browser-only image/video tools, and a locally persisted comparison shortlist without affiliate links or paid API claims.

## Product workflow

- Search by item details, region, and optional price target; filter and sort returned leads.
- Review per-source diagnostics when an upstream source is partially unavailable.
- Save leads across searches into a browser-local decision workspace; record stage, item price, shipping/fees, size/variant, and research notes.
- See a landed-cost total when item and shipping amounts use compatible currencies; free/included shipping is supported.
- Triage larger shortlists by decision stage and evidence completeness, with dedicated “needs research” and “evidence complete” views.
- Select two to four leads for a durable, accessible side-by-side evidence table covering stage, item price, shipping, landed cost, variant, completeness, and notes.
- Export the annotated shortlist—including landed-cost columns—as spreadsheet-safe CSV, or back up and merge-restore the complete workspace—including comparison picks—as validated, versioned JSON; older backups and legacy saved leads migrate automatically.
- Reuse local search history across research sessions.
- Extract an image palette or four frames from an MP4/WebM/QuickTime video, then hand them to Lens, Bing, Yandex, or Pinterest. Uploaded files never leave the browser.
- File controls validate explicit formats and limits (images 10 MB; videos 75 MB and 5 minutes).

The search API validates and bounds input, applies a small per-instance rate limit and five-minute upstream cache, times out upstream requests, filters non-public result URLs, deduplicates leads, and reports partial failures. DuckDuckGo HTML is an unofficial free source and can change or rate-limit; results are research leads, not verified inventory or final prices.

## Develop and verify

Requires a current Node.js LTS release.

```bash
npm install
npm run dev             # http://localhost:3000
npm test
npm run lint
npm run typecheck
npm run build
```

No environment variables are required. Browser data uses the `threadhunt:saved`, `threadhunt:history`, and `threadhunt:comparison` localStorage keys. Clear these in the UI or browser storage. The in-memory API cache/rate buckets are per server instance and intentionally not a distributed enforcement mechanism.

## Deployment

The repository is Vercel-ready. Import the repository root, use the Next.js preset, `npm install`, and `npm --workspace apps/web run build`. See `free-source-strategy.md` for source trade-offs.
