'use client';

/* eslint-disable @next/next/no-img-element -- previews use browser-only blob and data URLs */

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { exampleQueries, type Market } from '@/lib/markets';
import { filterAndSort, type SearchResult, type SortMode } from '@/lib/search-domain';

type Diagnostic = { source: string; status: 'ok' | 'unavailable'; count: number };
type SearchResponse = { query: string; results: SearchResult[]; markets: Market[]; caveats: string[]; freeSources: string[]; generatedAt: string; diagnostics: Diagnostic[] };
type Frame = { url: string; at: number };
type History = { query: string; region: string; at: string };
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const load = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };

function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function googleLensUrl(imageUrl: string) { try { const u = new URL(imageUrl); return /^https?:$/.test(u.protocol) ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u.toString())}` : 'https://lens.google.com/'; } catch { return 'https://lens.google.com/'; } }

export default function SearchWorkbench() {
  const [query, setQuery] = useState('black ribbed cropped cardigan');
  const [region, setRegion] = useState('global'); const [maxPrice, setMaxPrice] = useState('');
  const [imageUrl, setImageUrl] = useState(''); const [preview, setPreview] = useState('');
  const [palette, setPalette] = useState<string[]>([]); const [frames, setFrames] = useState<Frame[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [mediaError, setMediaError] = useState('');
  const [resultFilter, setResultFilter] = useState(''); const [sort, setSort] = useState<SortMode>('relevance');
  const [saved, setSaved] = useState<SearchResult[]>([]); const [history, setHistory] = useState<History[]>([]); const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const videoInput = useRef<HTMLInputElement>(null); const previewRef = useRef('');

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSaved(load('threadhunt:saved', []));
      setHistory(load('threadhunt:history', []));
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('threadhunt:saved', JSON.stringify(saved)); }, [saved, ready]);
  useEffect(() => { if (ready) localStorage.setItem('threadhunt:history', JSON.stringify(history)); }, [history, ready]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const shown = useMemo(() => filterAndSort(data?.results || [], resultFilter, sort), [data, resultFilter, sort]);
  const visualLinks = useMemo(() => [
    ['Google Lens', googleLensUrl(imageUrl), imageUrl ? 'Open the public image URL directly' : 'Upload or paste an image there'],
    ['Bing Visual Search', 'https://www.bing.com/visualsearch', 'Upload an image or extracted frame'],
    ['Yandex Images', 'https://yandex.com/images/search', 'Useful exact-match fallback'],
    ['Pinterest Lens', 'https://www.pinterest.com/lens/', 'Explore styling and outfit matches'],
  ], [imageUrl]);

  async function runSearch(nextQuery = query) {
    const clean = nextQuery.trim(); if (clean.length < 2) { setError('Enter at least 2 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: clean, region, maxPrice }) });
      const json = await res.json() as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Search failed.');
      setData(json); setHistory((old) => [{ query: clean, region, at: new Date().toISOString() }, ...old.filter((h) => h.query !== clean)].slice(0, 8));
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed.'); } finally { setLoading(false); }
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
  function toggleSaved(item: SearchResult) { setSaved((old) => old.some((x) => x.url === item.url) ? old.filter((x) => x.url !== item.url) : [...old, item]); }

  return <main>
    <header className="topbar"><a className="brand" href="#top">THREADHUNT</a><nav aria-label="Workspace sections"><a href="#search">Search</a><a href="#visual">Visual tools</a><a href="#shortlist">Shortlist <span>{saved.length}</span></a></nav></header>
    <section className="hero" id="top"><p className="eyebrow">Independent shopping research</p><h1>Find the piece.<br/>Compare the market.</h1><p className="sub">Search open web and resale leads, create a durable shortlist, and move images or video frames into visual-search tools—all from one private workspace.</p></section>

    <form className="panel searchPanel" id="search" onSubmit={submit} aria-describedby="search-help">
      <div className="sectionTitle"><div><p className="step">01 / Search brief</p><h2>What are you looking for?</h2></div><span className="privacy">Saved locally in this browser</span></div>
      <label htmlFor="query">Item description</label><textarea id="query" required minLength={2} maxLength={160} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Color, garment, fabric, brand, fit…" />
      <p id="search-help" className="hint">Specific materials, cuts, and model names produce stronger leads.</p>
      <div className="chips" aria-label="Example searches">{exampleQueries.map((ex) => <button type="button" key={ex} onClick={() => { setQuery(ex); void runSearch(ex); }}>{ex}</button>)}</div>
      <div className="formRow"><div><label htmlFor="region">Shopping region</label><select id="region" value={region} onChange={(e) => setRegion(e.target.value)}><option>global</option><option>US</option><option>EU</option><option>UK</option><option>Japan</option><option>China</option><option>Australia</option></select></div><div><label htmlFor="price">Maximum price <span>(optional)</span></label><input id="price" maxLength={30} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="$80, €120, ¥12,000" /></div><button className="primary" disabled={loading}>{loading ? 'Researching…' : 'Search sources →'}</button></div>
      <div className="status" role="status" aria-live="polite">{loading ? 'Checking web, resale, and alternatives sources.' : error ? <strong>{error}</strong> : data ? `${data.results.length} unique leads found.` : 'Ready to search.'}</div>
      {history.length > 0 && <div className="history"><span>Recent</span>{history.map((h) => <button type="button" key={h.query} onClick={() => { setQuery(h.query); void runSearch(h.query); }}>{h.query}</button>)}<button type="button" className="clear" onClick={() => setHistory([])}>Clear</button></div>}
    </form>

    <section className="panel visual" id="visual"><div><p className="step">02 / Visual tools</p><h2>Turn media into search inputs</h2><p className="muted">Files stay in your browser. Extract palette cues from an image or four downloadable frames from a short video.</p><div className="uploadRow"><input ref={fileInput} hidden type="file" accept={IMAGE_TYPES.join(',')} onChange={(e) => e.target.files?.[0] && void handleImage(e.target.files[0])}/><input ref={videoInput} hidden type="file" accept={VIDEO_TYPES.join(',')} onChange={(e) => e.target.files?.[0] && void extractFrames(e.target.files[0])}/><button type="button" onClick={() => fileInput.current?.click()}>＋ Add image <small>10 MB max</small></button><button type="button" onClick={() => videoInput.current?.click()}>▻ Add video <small>75 MB / 5 min</small></button></div><label htmlFor="image-url">Public image URL <span>(optional)</span></label><input id="image-url" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />{mediaError && <p className="mediaError" role="alert">{mediaError}</p>}<div className="visualLinks">{visualLinks.map(([name,url,note]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer"><strong>{name} ↗</strong><span>{note}</span></a>)}</div></div><div className="previewBox">{preview ? <img src={preview} alt="Selected clothing preview" onError={() => setMediaError('Image preview failed to load.')}/> : <div className="empty"><b>No image selected</b><span>JPEG, PNG, WebP, or GIF</span></div>}{palette.length > 0 && <div className="palette" aria-label="Extracted color palette">{palette.map((c) => <span key={c} title={c} style={{backgroundColor:c}}/>)}</div>}</div></section>

    {frames.length > 0 && <section className="panel"><div className="sectionTitle"><h2>Extracted frames</h2><span>Download, then upload to a visual engine</span></div><div className="frames">{frames.map((f) => <a key={f.at} href={f.url} download={`threadhunt-${Math.round(f.at)}s.jpg`}><img src={f.url} alt={`Video frame at ${f.at.toFixed(1)} seconds`}/><span>{f.at.toFixed(1)} sec ↓</span></a>)}</div></section>}

    {data && <section className="results"><div className="resultsHead"><div><p className="step">03 / Research desk</p><h2>{data.query}</h2><p>{data.results.length} leads · {new Date(data.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><div className="resultTools"><label htmlFor="filter">Filter leads</label><input id="filter" type="search" value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} placeholder="Title, site, detail…"/><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="relevance">Relevance</option><option value="source">Source</option><option value="title">Title</option></select></div></div><div className="diagnostics" aria-label="Source status">{data.diagnostics.map((d) => <span className={d.status} key={d.source}><i/> {d.source}: {d.status === 'ok' ? `${d.count} found` : 'unavailable'}</span>)}</div><div className="cards">{shown.map((r) => <article className="card" key={r.url}><div><small>{r.source}</small><h3><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a></h3><p>{r.snippet || 'Open this result to review the current listing and price.'}</p></div><button type="button" aria-label={`${saved.some((x) => x.url === r.url) ? 'Remove' : 'Add'} ${r.title} ${saved.some((x) => x.url === r.url) ? 'from' : 'to'} shortlist`} onClick={() => toggleSaved(r)}>{saved.some((x) => x.url === r.url) ? 'Saved ✓' : '＋ Shortlist'}</button></article>)}</div>{shown.length === 0 && <p className="emptyResults">No leads match this filter.</p>}<details className="marketPanel"><summary>Browse {data.markets.length} direct marketplace searches</summary><div className="markets">{data.markets.map((m) => <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"><strong>{m.name} ↗</strong><span>{m.region} · {m.kind}</span><p>{m.notes}</p><em>{host(m.url)}</em></a>)}</div></details></section>}

    <section className="panel shortlist" id="shortlist"><div className="sectionTitle"><div><p className="step">04 / Comparison shortlist</p><h2>Saved leads</h2></div>{saved.length > 0 && <button className="quiet" onClick={() => setSaved([])}>Clear all</button>}</div>{saved.length ? <div className="compare" role="table" aria-label="Saved lead comparison"><div className="compareRow compareHead" role="row"><span>Lead</span><span>Source</span><span>Action</span></div>{saved.map((r) => <div className="compareRow" role="row" key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a><span>{r.source}</span><button onClick={() => toggleSaved(r)}>Remove</button></div>)}</div> : <div className="emptySaved"><b>Your shortlist is empty.</b><span>Save promising leads to compare them here across searches.</span></div>}</section>
    <footer><b>ThreadHunt</b><span>Open-source shopping research · No affiliate links</span></footer>
  </main>;
}
