'use client';

/* eslint-disable @next/next/no-img-element -- previews use browser-only blob and data URLs */

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { exampleQueries, type Market } from '@/lib/markets';
import {
  createSavedLead,
  exportShortlistCsv,
  exportWorkspaceBackup,
  filterAndSort,
  formatLandedCost,
  filterAndSortSavedLeads,
  isLeadVerificationStale,
  leadMissingFields,
  listingStatusLabel,
  MAX_COMPARISON_LEADS,
  normalizeComparisonUrls,
  normalizeSavedLeads,
  normalizeSearchHistory,
  parseWorkspaceBackup,
  returnPolicyLabel,
  toggleComparisonUrl,
  type EvidenceFilter,
  type LeadStatus,
  type ListingStatus,
  type ReturnPolicy,
  type SavedLead,
  type SearchHistory,
  type SearchResult,
  type ShortlistFilter,
  type ShortlistSort,
  type SortMode,
} from '@/lib/search-domain';

type Diagnostic = { source: string; status: 'ok' | 'unavailable'; count: number };
type SearchResponse = { query: string; results: SearchResult[]; markets: Market[]; caveats: string[]; freeSources: string[]; generatedAt: string; diagnostics: Diagnostic[] };
type Frame = { url: string; at: number };
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const load = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };

function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function googleLensUrl(imageUrl: string) { try { const u = new URL(imageUrl); return /^https?:$/.test(u.protocol) ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u.toString())}` : 'https://lens.google.com/'; } catch { return 'https://lens.google.com/'; } }
const missingFieldLabels: Record<ReturnType<typeof leadMissingFields>[number], string> = {
  price: 'item price', shipping: 'shipping or fees', size: 'size or variant', condition: 'condition', returns: 'return protection', seller: 'seller', availability: 'current availability', freshness: 'a fresh availability check', notes: 'research notes',
};

// Read deep-link params once during initial render to avoid setState-in-effect.
function readDeepLink() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (!q || q.trim().length < 2) return null;
  const region = params.get('region');
  const validRegion = region && ['global', 'US', 'EU', 'UK', 'Japan', 'China', 'Australia'].includes(region) ? region : null;
  const max = params.get('max');
  return { q, region: validRegion, max };
}

const deepLink = readDeepLink();

export default function SearchWorkbench() {
  const [query, setQuery] = useState(deepLink?.q ?? 'black ribbed cropped cardigan');
  const [region, setRegion] = useState(deepLink?.region ?? 'global'); const [maxPrice, setMaxPrice] = useState(deepLink?.max ?? '');
  const [imageUrl, setImageUrl] = useState(''); const [preview, setPreview] = useState('');
  const [palette, setPalette] = useState<string[]>([]); const [frames, setFrames] = useState<Frame[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [mediaError, setMediaError] = useState('');
  const [resultFilter, setResultFilter] = useState(''); const [sort, setSort] = useState<SortMode>('relevance');
  const [saved, setSaved] = useState<SavedLead[]>([]); const [history, setHistory] = useState<SearchHistory[]>([]); const [ready, setReady] = useState(false);
  const [comparisonUrls, setComparisonUrls] = useState<string[]>([]);
  const [shortlistMessage, setShortlistMessage] = useState('');
  const [shortlistFilter, setShortlistFilter] = useState<ShortlistFilter>('all'); const [shortlistSort, setShortlistSort] = useState<ShortlistSort>('newest');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [lastCleared, setLastCleared] = useState<SavedLead[] | null>(null);
  const [lastClearedComparison, setLastClearedComparison] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null); const videoInput = useRef<HTMLInputElement>(null); const backupInput = useRef<HTMLInputElement>(null); const previewRef = useRef('');
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const restoredSaved = normalizeSavedLeads(load<unknown>('threadhunt:saved', []));
      setSaved(restoredSaved);
      setHistory(normalizeSearchHistory(load<unknown>('threadhunt:history', [])));
      setComparisonUrls(normalizeComparisonUrls(load<unknown>('threadhunt:comparison', []), restoredSaved));
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  const persist = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage quota exceeded — data stays in memory for this session */ } };
  useEffect(() => { if (ready) persist('threadhunt:saved', saved); }, [saved, ready]);
  useEffect(() => { if (ready) persist('threadhunt:history', history); }, [history, ready]);
  useEffect(() => { if (ready) persist('threadhunt:comparison', comparisonUrls); }, [comparisonUrls, ready]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Keyboard shortcut: '/' focuses the search box (unless already in a field)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      queryRef.current?.focus();
      queryRef.current?.setSelectionRange(queryRef.current.value.length, queryRef.current.value.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Deep-link: if URL params were present on load, auto-run the search
  useEffect(() => {
    if (!deepLink) return;
    void runSearch(deepLink.q);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run deep-link search only once on mount
  }, []);

  const shown = useMemo(() => filterAndSort(data?.results || [], resultFilter, sort, data?.query || ''), [data, resultFilter, sort]);
  const shownSaved = useMemo(() => filterAndSortSavedLeads(saved, shortlistFilter, shortlistSort, evidenceFilter), [saved, shortlistFilter, shortlistSort, evidenceFilter]);
  const comparedLeads = useMemo(() => comparisonUrls.flatMap((url) => { const lead = saved.find((item) => item.url === url); return lead ? [lead] : []; }), [comparisonUrls, saved]);
  const readyToCompare = useMemo(() => saved.filter((lead) => leadMissingFields(lead).length === 0).length, [saved]);
  const staleVerificationCount = useMemo(() => saved.filter((lead) => isLeadVerificationStale(lead)).length, [saved]);
  const visualLinks = useMemo(() => [
    ['Google Lens', googleLensUrl(imageUrl), imageUrl ? 'Open the public image URL directly' : 'Upload or paste an image there'],
    ['Bing Visual Search', 'https://www.bing.com/visualsearch', 'Upload an image or extracted frame'],
    ['Yandex Images', 'https://yandex.com/images/search', 'Useful exact-match fallback'],
    ['Pinterest Lens', 'https://www.pinterest.com/lens/', 'Explore styling and outfit matches'],
  ], [imageUrl]);

  async function runSearch(nextQuery = query) {
    if (loading) return;
    const clean = nextQuery.trim(); if (clean.length < 2) { setError('Enter at least 2 characters.'); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: clean, region, maxPrice }), signal: controller.signal });
      const json = await res.json() as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Search failed.');
      setData(json); setHistory((old) => [{ query: clean, region, at: new Date().toISOString() }, ...old.filter((h) => h.query !== clean)].slice(0, 8));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setLoading(false); }
    }
  }
  function submit(e: FormEvent) { e.preventDefault(); void runSearch(); }
  function validate(file: File, types: string[], maxMb: number) {
    if (!types.includes(file.type)) return `Unsupported file type. Choose ${types.map((x) => x.split('/')[1]).join(', ')}.`;
    if (file.size > maxMb * 1024 * 1024) return `File is larger than ${maxMb} MB.`; return '';
  }
  async function handleImage(file: File) {
    const invalid = validate(file, IMAGE_TYPES, 10); if (invalid) { setMediaError(invalid); return; }
    setMediaError(''); setPalette([]); if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file); previewRef.current = url; setPreview(url);
    try { setPalette(await extractPalette(url)); } catch { setMediaError('The image could not be decoded. Try JPEG, PNG, or WebP.'); }
  }
  async function extractPalette(url: string) {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, 64, 64); const pixels = ctx.getImageData(0, 0, 64, 64).data; const buckets = new Map<string, number>();
    for (let i = 0; i < pixels.length; i += 16) { if (pixels[i + 3] < 80) continue; const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]].map((v) => Math.min(255, Math.round(v / 32) * 32)); const key = `rgb(${rgb.join(',')})`; buckets.set(key, (buckets.get(key) || 0) + 1); }
    return [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key]) => key);
  }
  async function extractFrames(file: File) {
    const invalid = validate(file, VIDEO_TYPES, 75); if (invalid) { setMediaError(invalid); return; } setMediaError(''); setFrames([]);
    const url = URL.createObjectURL(file); const video = document.createElement('video'); video.src = url; video.muted = true; video.preload = 'metadata';
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error()); });
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 300) throw new Error();
      const canvas = document.createElement('canvas'); canvas.width = Math.min(video.videoWidth, 960); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error();
      const out: Frame[] = []; for (const at of [0.1, .35, .6, .85].map((x) => Math.min(video.duration * x, video.duration - .05))) { await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error()), 4000); video.onseeked = () => { clearTimeout(timeout); resolve(); }; video.currentTime = at; }); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); out.push({ at, url: canvas.toDataURL('image/jpeg', .82) }); } setFrames(out);
    } catch { setMediaError('Could not process this video. Use MP4/WebM under 5 minutes.'); } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }
  function toggleSaved(item: SearchResult) {
    setLastCleared(null);
    const removing = saved.some((lead) => lead.url === item.url);
    setSaved((old) => removing ? old.filter((lead) => lead.url !== item.url) : [...old, createSavedLead(item)]);
    if (removing) setComparisonUrls((current) => current.filter((url) => url !== item.url));
  }
  function toggleComparison(url: string) {
    const atLimit = !comparisonUrls.includes(url) && comparisonUrls.length >= MAX_COMPARISON_LEADS;
    setComparisonUrls((current) => toggleComparisonUrl(current, url, saved));
    setShortlistMessage(atLimit ? `Compare up to ${MAX_COMPARISON_LEADS} leads at a time. Remove one before adding another.` : '');
  }
  function updateSaved(url: string, patch: Partial<Pick<SavedLead, 'status' | 'quotedPrice' | 'shippingCost' | 'size' | 'condition' | 'returnPolicy' | 'seller' | 'listingStatus' | 'checkedAt' | 'notes'>>) {
    setSaved((old) => old.map((lead) => lead.url === url ? { ...lead, ...patch } : lead));
  }
  function verifyListing(url: string, listingStatus: ListingStatus) {
    updateSaved(url, { listingStatus, checkedAt: listingStatus ? new Date().toISOString() : '' });
    setShortlistMessage(listingStatus ? 'Listing availability marked as checked now.' : 'Listing verification cleared.');
  }
  function downloadText(contents: BlobPart[], type: string, filename: string) {
    const blobUrl = URL.createObjectURL(new Blob(contents, { type }));
    const link = document.createElement('a');
    link.href = blobUrl; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }
  function downloadShortlist() {
    downloadText(['\uFEFF', exportShortlistCsv(saved)], 'text/csv;charset=utf-8', `threadhunt-shortlist-${new Date().toISOString().slice(0, 10)}.csv`);
    setShortlistMessage(`Exported ${saved.length} ${saved.length === 1 ? 'lead' : 'leads'} as CSV.`);
  }
  function downloadBackup() {
    downloadText([exportWorkspaceBackup(saved, history, comparisonUrls)], 'application/json;charset=utf-8', `threadhunt-workspace-${new Date().toISOString().slice(0, 10)}.json`);
    setShortlistMessage(`Backed up ${saved.length} leads, ${comparisonUrls.length} comparison picks, and ${history.length} recent searches.`);
  }
  async function restoreBackup(file: File) {
    if (file.size > 1024 * 1024) { setShortlistMessage('Backup must be 1 MB or smaller.'); if (backupInput.current) backupInput.current.value = ''; return; }
    try {
      const restored = parseWorkspaceBackup(await file.text());
      const mergedSaved = normalizeSavedLeads([...restored.saved, ...saved]);
      setSaved(mergedSaved);
      setHistory((current) => normalizeSearchHistory([...restored.history, ...current]));
      setComparisonUrls((current) => normalizeComparisonUrls([...restored.comparisonUrls, ...current], mergedSaved));
      setLastCleared(null);
      setShortlistMessage(`Restored ${restored.saved.length} leads, ${restored.comparisonUrls.length} comparison picks, and ${restored.history.length} recent searches. Existing unique items were kept.`);
    } catch (restoreError) {
      setShortlistMessage(restoreError instanceof Error ? restoreError.message : 'Could not restore this backup.');
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  }
  function clearShortlist() {
    if (!window.confirm(`Clear all ${saved.length} saved leads? You can undo this until you change the shortlist.`)) return;
    setLastCleared(saved); setLastClearedComparison(comparisonUrls); setSaved([]); setComparisonUrls([]); setShortlistMessage(`Cleared ${saved.length} leads.`);
  }
  function undoClear() {
    if (!lastCleared) return;
    setSaved(lastCleared); setComparisonUrls(normalizeComparisonUrls(lastClearedComparison, lastCleared)); setShortlistMessage(`Restored ${lastCleared.length} leads.`); setLastCleared(null); setLastClearedComparison([]);
  }

  async function shareSearch() {
    const params = new URLSearchParams();
    params.set('q', query.trim());
    if (region !== 'global') params.set('region', region);
    if (maxPrice.trim()) params.set('max', maxPrice.trim());
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'ThreadHunt search', text: query.trim(), url }); return; }
      await navigator.clipboard.writeText(url);
      setShareMessage('Search link copied to clipboard.');
    } catch {
      setShareMessage(url);
    }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareMessage(''), 4000);
  }

  return <>
    <a className="skipLink" href="#workspace">Skip to research workspace</a>
    <main id="workspace">
    <header className="topbar"><a className="brand" href="#top">THREADHUNT</a><nav aria-label="Workspace sections"><a href="#search">Search</a><a href="#visual">Visual tools</a><a href="#shortlist">Shortlist <span>{saved.length}</span></a></nav></header>
    <section className="hero" id="top"><p className="eyebrow">Independent shopping research</p><h1>Find the piece.<br/>Compare the market.</h1><p className="sub">Search open web and resale leads, create a durable shortlist, and move images or video frames into visual-search tools—all from one private workspace.</p></section>

    <form className="panel searchPanel" id="search" onSubmit={submit} aria-describedby="search-help">
      <div className="sectionTitle"><div><p className="step">01 / Search brief</p><h2>What are you looking for?</h2></div><span className="privacy">Saved locally in this browser</span></div>
      <label htmlFor="query">Item description</label><textarea id="query" ref={queryRef} required minLength={2} maxLength={160} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Color, garment, fabric, brand, fit…" />
      <p id="search-help" className="hint">Specific materials, cuts, and model names produce stronger leads. Press <kbd>/</kbd> to jump here.</p>
      <div className="chips" aria-label="Example searches">{exampleQueries.map((ex) => <button type="button" key={ex} onClick={() => { setQuery(ex); void runSearch(ex); }}>{ex}</button>)}</div>
      <div className="formRow"><div><label htmlFor="region">Shopping region</label><select id="region" value={region} onChange={(e) => setRegion(e.target.value)}><option>global</option><option>US</option><option>EU</option><option>UK</option><option>Japan</option><option>China</option><option>Australia</option></select></div><div><label htmlFor="price">Maximum price <span>(optional)</span></label><input id="price" maxLength={30} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="$80, €120, ¥12,000" /></div><button className="primary" aria-disabled={loading}>{loading ? 'Researching…' : 'Search sources →'}</button></div>
      {shareMessage && <p className="shareNotice" role="status" aria-live="polite">{shareMessage}</p>}
      <div className="status" role="status" aria-live="polite">{loading ? 'Checking web, resale, and alternatives sources.' : error ? <strong>{error}</strong> : data ? `${data.results.length} unique leads found.` : 'Ready to search.'}</div>
      {history.length > 0 && <div className="history"><span>Recent</span>{history.map((h) => <button type="button" key={h.query} onClick={() => { setQuery(h.query); void runSearch(h.query); }}>{h.query}</button>)}<button type="button" className="clear" onClick={() => setHistory([])}>Clear</button></div>}
    </form>

    <section className="panel visual" id="visual"><div><p className="step">02 / Visual tools</p><h2>Turn media into search inputs</h2><p className="muted">Files stay in your browser. Extract palette cues from an image or four downloadable frames from a short video.</p><div className="uploadRow"><input ref={fileInput} hidden type="file" accept={IMAGE_TYPES.join(',')} onChange={(e) => e.target.files?.[0] && void handleImage(e.target.files[0])}/><input ref={videoInput} hidden type="file" accept={VIDEO_TYPES.join(',')} onChange={(e) => e.target.files?.[0] && void extractFrames(e.target.files[0])}/><button type="button" onClick={() => fileInput.current?.click()}>＋ Add image <small>10 MB max</small></button><button type="button" onClick={() => videoInput.current?.click()}>▻ Add video <small>75 MB / 5 min</small></button></div><label htmlFor="image-url">Public image URL <span>(optional)</span></label><input id="image-url" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />{mediaError && <p className="mediaError" role="alert">{mediaError}</p>}<div className="visualLinks">{visualLinks.map(([name,url,note]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer"><strong>{name} ↗</strong><span>{note}</span></a>)}</div></div><div className="previewBox">{preview ? <img src={preview} alt="Selected clothing preview" onError={() => setMediaError('Image preview failed to load.')}/> : <div className="empty"><b>No image selected</b><span>JPEG, PNG, WebP, or GIF</span></div>}{palette.length > 0 && <div className="palette" aria-label="Extracted color palette">{palette.map((c) => <span key={c} title={c} style={{backgroundColor:c}}/>)}</div>}</div></section>

    {frames.length > 0 && <section className="panel"><div className="sectionTitle"><h2>Extracted frames</h2><span>Download, then upload to a visual engine</span></div><div className="frames">{frames.map((f) => <a key={f.at} href={f.url} download={`threadhunt-${Math.round(f.at)}s.jpg`}><img src={f.url} alt={`Video frame at ${f.at.toFixed(1)} seconds`}/><span>{f.at.toFixed(1)} sec ↓</span></a>)}</div></section>}

    {data && <section className="results" aria-busy={loading}><div className="resultsHead"><div><p className="step">03 / Research desk</p><h2>{data.query}</h2><p>{data.results.length} leads · {new Date(data.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><div className="resultTools"><label htmlFor="filter">Filter leads</label><input id="filter" type="search" value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} placeholder="Title, site, detail…"/><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="relevance">Relevance</option><option value="source">Source</option><option value="title">Title</option></select><button type="button" className="quiet" onClick={() => void shareSearch()}>Share link ↗</button></div></div><div className="diagnostics" aria-label="Source status">{data.diagnostics.map((d) => <span className={d.status} key={d.source}><i/> {d.source}: {d.status === 'ok' ? `${d.count} found` : 'unavailable'}</span>)}</div><div className="cards">{shown.map((r) => <article className="card" key={r.url}><div><small>{r.source}</small><h3><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a></h3><p>{r.snippet || 'Open this result to review the current listing and price.'}</p></div><button type="button" aria-label={`${saved.some((x) => x.url === r.url) ? 'Remove' : 'Add'} ${r.title} ${saved.some((x) => x.url === r.url) ? 'from' : 'to'} shortlist`} onClick={() => toggleSaved(r)}>{saved.some((x) => x.url === r.url) ? 'Saved ✓' : '＋ Shortlist'}</button></article>)}</div>{shown.length === 0 && <p className="emptyResults">{(data?.results.length || 0) === 0 ? 'No leads found. Try broader terms, a different region, or browse the direct marketplace searches below.' : 'No leads match this filter. Clear the filter to see all results.'}</p>}<details className="marketPanel"><summary>Browse {data.markets.length} direct marketplace searches</summary><div className="markets">{data.markets.map((m) => <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"><strong>{m.name} ↗</strong><span>{m.region} · {m.kind}</span><p>{m.notes}</p><em>{host(m.url)}</em></a>)}</div></details></section>}

    <section className="panel shortlist" id="shortlist" aria-describedby="shortlist-help">
      <div className="sectionTitle shortlistTitle">
        <div><p className="step">04 / Comparison shortlist</p><h2>Decision workspace</h2></div>
        <div className="shortlistActions">
          <input ref={backupInput} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void restoreBackup(event.target.files[0])} />
          <button type="button" className="quiet" onClick={downloadBackup}>Backup JSON ↓</button>
          <button type="button" className="quiet" onClick={() => backupInput.current?.click()}>Restore backup ↑</button>
          {saved.length > 0 && <><button type="button" className="quiet" onClick={downloadShortlist}>Export CSV ↓</button><button type="button" className="quiet danger" onClick={clearShortlist}>Clear all</button></>}
        </div>
      </div>
      <p id="shortlist-help" className="muted shortlistHelp">Capture item price, shipping and fees, size, condition, return protection, seller identity, current availability, and verification notes before deciding. Availability checks expire after seven days; purchased leads leave the recheck queue. ThreadHunt calculates landed cost only when both cost fields are parseable in the same currency. Filter the queue as it grows, export a spreadsheet for analysis, or back up the complete local workspace as JSON.</p>
      {shortlistMessage && <div className="workspaceNotice" role="status" aria-live="polite"><span>{shortlistMessage}</span>{lastCleared && <button type="button" onClick={undoClear}>Undo clear</button>}</div>}
      {saved.length ? <>
        <div className="shortlistSummary" aria-label="Shortlist progress">
          <span><b>{saved.length}</b> saved</span>
          <span><b>{saved.filter((lead) => lead.status === 'contender').length}</b> contenders</span>
          <span><b>{readyToCompare}</b> evidence complete</span>
          <span className={staleVerificationCount ? 'summaryAttention' : ''}><b>{staleVerificationCount}</b> need rechecking</span>
          <span><b>{saved.filter((lead) => lead.status === 'purchased').length}</b> purchased</span>
        </div>
        <div className="queueTools" aria-label="Decision queue controls">
          <div><label htmlFor="shortlist-filter">Show stage</label><select id="shortlist-filter" value={shortlistFilter} onChange={(event) => setShortlistFilter(event.target.value as ShortlistFilter)}><option value="all">All stages ({saved.length})</option><option value="researching">Researching</option><option value="contender">Contenders</option><option value="purchased">Purchased</option></select></div>
          <div><label htmlFor="evidence-filter">Evidence</label><select id="evidence-filter" value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)}><option value="all">Any completeness</option><option value="incomplete">Needs research</option><option value="complete">Evidence complete</option><option value="stale">Needs availability recheck ({staleVerificationCount})</option></select></div>
          <div><label htmlFor="shortlist-sort">Order by</label><select id="shortlist-sort" value={shortlistSort} onChange={(event) => setShortlistSort(event.target.value as ShortlistSort)}><option value="newest">Newest saved</option><option value="status">Decision priority</option><option value="title">Title A–Z</option></select></div>
          <p><b>{shownSaved.length}</b> {shownSaved.length === 1 ? 'lead' : 'leads'} in this view</p>
        </div>
        <section className="comparisonWorkspace" aria-labelledby="comparison-title">
          <div className="comparisonHead">
            <div><p className="step">Side-by-side decision</p><h3 id="comparison-title">Compare selected leads</h3><p>Select 2–{MAX_COMPARISON_LEADS} saved leads below. Your selection stays in this browser and is included in workspace backups.</p></div>
            <div className="comparisonCount" aria-live="polite"><b>{comparedLeads.length}</b> / {MAX_COMPARISON_LEADS} selected{comparedLeads.length > 0 && <button type="button" onClick={() => setComparisonUrls([])}>Clear selection</button>}</div>
          </div>
          {comparedLeads.length >= 2 ? <div className="comparisonScroll" tabIndex={0} aria-label="Scrollable comparison table">
            <table className="comparisonTable">
              <caption className="srOnly">Side-by-side details for selected clothing leads</caption>
              <thead><tr><th scope="col">Evidence</th>{comparedLeads.map((lead) => <th scope="col" key={lead.url}><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title} ↗</a><small>{lead.source}</small></th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">Decision stage</th>{comparedLeads.map((lead) => <td key={lead.url}><span className={`statusPill ${lead.status}`}>{lead.status}</span></td>)}</tr>
                <tr><th scope="row">Item price</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.quotedPrice || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Shipping / fees</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.shippingCost || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Landed cost</th>{comparedLeads.map((lead) => { const total = formatLandedCost(lead); return <td key={lead.url} className={total ? 'landedValue' : ''}>{total || <span className="missingValue">Needs compatible amounts</span>}</td>; })}</tr>
                <tr><th scope="row">Size / variant</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.size || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Condition</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.condition || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Returns / protection</th>{comparedLeads.map((lead) => <td key={lead.url}>{returnPolicyLabel(lead.returnPolicy) || <span className="missingValue">Not verified</span>}</td>)}</tr>
                <tr><th scope="row">Seller</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.seller || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Listing check</th>{comparedLeads.map((lead) => <td key={lead.url}>{lead.listingStatus ? <><span className={`listingPill ${lead.listingStatus}`}>{listingStatusLabel(lead.listingStatus)}</span><small className="checkedDate">{lead.checkedAt ? `Checked ${new Date(lead.checkedAt).toLocaleDateString()}` : 'Not dated'}</small></> : <span className="missingValue">Not verified</span>}</td>)}</tr>
                <tr><th scope="row">Evidence status</th>{comparedLeads.map((lead) => { const count = leadMissingFields(lead).length; return <td key={lead.url} className={count === 0 ? 'completeValue' : ''}>{count === 0 ? 'Complete' : `${count} details needed`}</td>; })}</tr>
                <tr><th scope="row">Research notes</th>{comparedLeads.map((lead) => <td key={lead.url} className="comparisonNotes">{lead.notes || <span className="missingValue">Not recorded</span>}</td>)}</tr>
                <tr><th scope="row">Selection</th>{comparedLeads.map((lead) => <td key={lead.url}><button type="button" className="removeComparison" onClick={() => toggleComparison(lead.url)}>Remove from comparison</button></td>)}</tr>
              </tbody>
            </table>
          </div> : <p className="comparisonPrompt">{comparedLeads.length === 1 ? 'Select one more lead to open the comparison table.' : 'Choose leads with the “Compare” control on each card.'}</p>}
        </section>
        {shownSaved.length > 0 ? <div className="researchList">
          {shownSaved.map((lead, index) => {
            const missing = leadMissingFields(lead);
            return <article className="researchCard" key={lead.url}>
              <div className="researchCardHead">
                <div><span className={`statusPill ${lead.status}`}>{lead.status}</span><h3><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title} ↗</a></h3><p>{lead.source}</p></div>
                <div className="cardActions"><label className="compareToggle"><input type="checkbox" checked={comparisonUrls.includes(lead.url)} onChange={() => toggleComparison(lead.url)} disabled={!comparisonUrls.includes(lead.url) && comparisonUrls.length >= MAX_COMPARISON_LEADS} /><span>Compare</span></label><button type="button" className="removeLead" onClick={() => toggleSaved(lead)} aria-label={`Remove ${lead.title} from shortlist`}>Remove</button></div>
              </div>
              <div className={`evidenceStatus ${missing.length === 0 ? 'complete' : ''}`}><strong>{missing.length === 0 ? 'Evidence complete' : `${missing.length} ${missing.length === 1 ? 'detail' : 'details'} needed`}</strong><span>{missing.length === 0 ? 'Ready for a like-for-like decision.' : `Add ${missing.map((field) => missingFieldLabels[field]).join(', ')} before comparing.`}</span></div>
              <div className="researchFields">
                <div><label htmlFor={`lead-status-${index}`}>Decision stage</label><select id={`lead-status-${index}`} value={lead.status} onChange={(event) => updateSaved(lead.url, { status: event.target.value as LeadStatus })}><option value="researching">Researching</option><option value="contender">Contender</option><option value="purchased">Purchased</option></select></div>
                <div><label htmlFor={`lead-price-${index}`}>Item price</label><input id={`lead-price-${index}`} maxLength={80} value={lead.quotedPrice} onChange={(event) => updateSaved(lead.url, { quotedPrice: event.target.value })} placeholder="$95" /></div>
                <div><label htmlFor={`lead-shipping-${index}`}>Shipping / fees</label><input id={`lead-shipping-${index}`} maxLength={80} value={lead.shippingCost} onChange={(event) => updateSaved(lead.url, { shippingCost: event.target.value })} placeholder="$8 or free" /></div>
                <div><label htmlFor={`lead-size-${index}`}>Size / variant</label><input id={`lead-size-${index}`} maxLength={80} value={lead.size} onChange={(event) => updateSaved(lead.url, { size: event.target.value })} placeholder="M · black" /></div>
                <div><label htmlFor={`lead-condition-${index}`}>Condition</label><input id={`lead-condition-${index}`} maxLength={120} value={lead.condition} onChange={(event) => updateSaved(lead.url, { condition: event.target.value })} placeholder="New · used excellent · flaws" /></div>
                <div><label htmlFor={`lead-returns-${index}`}>Returns / buyer protection</label><select id={`lead-returns-${index}`} value={lead.returnPolicy} onChange={(event) => updateSaved(lead.url, { returnPolicy: event.target.value as ReturnPolicy })}><option value="">Not verified</option><option value="accepted">Returns accepted</option><option value="exchange-only">Exchange only</option><option value="final-sale">Final sale</option><option value="marketplace-protected">Marketplace protection</option></select></div>
                <div><label htmlFor={`lead-seller-${index}`}>Seller / shop</label><input id={`lead-seller-${index}`} maxLength={160} value={lead.seller} onChange={(event) => updateSaved(lead.url, { seller: event.target.value })} placeholder="Seller name or handle" /></div>
                <div><label htmlFor={`lead-availability-${index}`}>Current availability</label><select id={`lead-availability-${index}`} value={lead.listingStatus} onChange={(event) => verifyListing(lead.url, event.target.value as ListingStatus)}><option value="">Not checked</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option><option value="removed">Listing removed</option></select></div>
                <div className="notesField"><label htmlFor={`lead-notes-${index}`}>Research notes</label><textarea id={`lead-notes-${index}`} maxLength={1000} value={lead.notes} onChange={(event) => updateSaved(lead.url, { notes: event.target.value })} placeholder="Returns, condition, measurements, seller questions…" /><small>{lead.notes.length}/1000</small></div>
              </div>
              <div className={`verificationSummary ${isLeadVerificationStale(lead) ? 'stale' : ''}`}><div><span>Listing verification</span><strong>{lead.checkedAt ? `${listingStatusLabel(lead.listingStatus) || 'Status missing'} · checked ${new Date(lead.checkedAt).toLocaleDateString([], { dateStyle: 'medium' })}` : lead.status === 'purchased' ? 'Recheck not required after purchase' : 'Never checked'}</strong></div>{lead.listingStatus && lead.status !== 'purchased' && <button type="button" onClick={() => verifyListing(lead.url, lead.listingStatus)} aria-label={`Mark ${lead.title} as rechecked now`}>Recheck now</button>}</div>
              <div className="landedSummary"><span>Landed cost</span><strong>{formatLandedCost(lead) || 'Add compatible item and shipping amounts'}</strong></div>
              <p className="savedMeta">Saved {new Date(lead.savedAt).toLocaleDateString([], { dateStyle: 'medium' })}</p>
            </article>;
          })}
        </div> : <div className="emptySaved"><b>No leads in this stage.</b><span>Choose another stage or update a lead’s decision stage.</span><button type="button" className="quiet" onClick={() => { setShortlistFilter('all'); setEvidenceFilter('all'); }}>Show all leads</button></div>}
      </> : <div className="emptySaved"><b>Your shortlist is empty.</b><span>Save promising leads, then annotate and compare them here across searches. You can also restore a previous JSON backup.</span></div>}
    </section>
    <footer><b>ThreadHunt</b><span>Open-source shopping research · No affiliate links</span></footer>
    </main>
  </>;
}
