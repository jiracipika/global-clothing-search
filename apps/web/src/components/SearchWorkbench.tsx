'use client';

import { useMemo, useRef, useState } from 'react';
import { exampleQueries, type Market } from '@/lib/markets';

type Result = { title: string; url: string; snippet: string; source: string };
type SearchResponse = { results: Result[]; markets: Market[]; caveats: string[]; freeSources: string[]; generatedAt: string };
type Frame = { url: string; at: number };

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function googleLensUrl(imageUrl: string) {
  return imageUrl ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}` : 'https://lens.google.com/';
}

export default function SearchWorkbench() {
  const [query, setQuery] = useState('black ribbed cropped cardigan');
  const [region, setRegion] = useState('global');
  const [maxPrice, setMaxPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState<string>('');
  const [palette, setPalette] = useState<string[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const visualLinks = useMemo(() => [
    { name: 'Google Lens', url: googleLensUrl(imageUrl), note: imageUrl ? 'opens directly with your image URL' : 'upload/paste image there' },
    { name: 'Bing visual search', url: 'https://www.bing.com/visualsearch', note: 'upload image or extracted video frame' },
    { name: 'Yandex images', url: 'https://yandex.com/images/search', note: 'strong exact-match fallback' },
    { name: 'Pinterest Lens', url: 'https://www.pinterest.com/lens/', note: 'good for outfits and styling matches' },
    { name: 'AliExpress image search', url: 'https://www.aliexpress.com/', note: 'mobile app is better; web still useful for cheap dupes' },
  ], [imageUrl]);

  async function runSearch(nextQuery = query) {
    setLoading(true); setError(''); setData(null);
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: nextQuery, region, maxPrice }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleImage(file: File) {
    const url = URL.createObjectURL(file);
    setPreview(url);
    const colors = await extractPalette(url);
    setPalette(colors);
    const words = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    if (words && query.length < 6) setQuery(words);
  }

  async function extractPalette(url: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, number>();
    for (let i = 0; i < pixels.length; i += 16) {
      const r = Math.round(pixels[i] / 32) * 32;
      const g = Math.round(pixels[i + 1] / 32) * 32;
      const b = Math.round(pixels[i + 2] / 32) * 32;
      if (pixels[i + 3] < 80) continue;
      const key = `rgb(${Math.min(r,255)},${Math.min(g,255)},${Math.min(b,255)})`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()].sort((a,b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  }

  async function extractFrames(file: File) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Could not read video')); });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth || 720, 960);
    canvas.height = Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 720)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const times = [0.1, 0.35, 0.6, 0.85].map((x) => Math.max(0, Math.min(video.duration * x, video.duration - 0.1)));
    const out: Frame[] = [];
    for (const at of times) {
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = at; });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      out.push({ at, url: canvas.toDataURL('image/jpeg', 0.82) });
    }
    setFrames(out);
  }

  return <main>
    <section className="hero">
      <p className="eyebrow">ThreadHunt</p>
      <h1>Find cheaper clothing matches across global markets.</h1>
      <p className="sub">Text search, image handoff, video frame extraction, resale checks, brand searches, and honest caveats. Free sources only. No fake “magic reverse image API” claims.</p>
    </section>

    <section className="panel grid">
      <div>
        <label htmlFor="item-query">Describe the item</label>
        <textarea id="item-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="brand + garment + color + material + cut" />
        <div className="chips">{exampleQueries.map((ex) => <button key={ex} onClick={() => { setQuery(ex); runSearch(ex); }}>{ex}</button>)}</div>
      </div>
      <div className="controls">
        <label htmlFor="search-region">Region</label>
        <select id="search-region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option>global</option><option>US</option><option>EU</option><option>UK</option><option>Japan</option><option>China</option><option>Australia</option>
        </select>
        <label htmlFor="max-price">Target max price</label>
        <input id="max-price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="$50 / €40 / ¥5000" />
        <button className="primary" onClick={() => runSearch()} disabled={loading}>{loading ? 'Searching...' : 'Search free sources'}</button>
      </div>
    </section>

    <section className="panel visual">
      <div>
        <h2>Reverse image / video workflow</h2>
        <p>Upload an image for palette hints, paste a public image URL for Lens, or upload a video and grab frames to feed into visual search engines.</p>
        <div className="uploadRow">
          <input ref={fileInput} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} />
          <input ref={videoInput} hidden type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && extractFrames(e.target.files[0])} />
          <button onClick={() => fileInput.current?.click()}>Upload image</button>
          <button onClick={() => videoInput.current?.click()}>Extract video frames</button>
        </div>
        <label htmlFor="image-url" className="srOnly">Public image URL for visual search</label>
        <input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Optional public image URL for Google Lens" />
        <div className="visualLinks">{visualLinks.map((l) => <a key={l.name} href={l.url} target="_blank" rel="noreferrer">{l.name}<span>{l.note}</span></a>)}</div>
      </div>
      <div className="previewBox">
        {preview ? <img src={preview} alt="Uploaded clothing preview" /> : <div className="empty">image preview</div>}
        {palette.length > 0 && <div className="palette">{palette.map((c) => <span key={c} title={c} style={{ background: c }} />)}</div>}
      </div>
    </section>

    {frames.length > 0 && <section className="panel"><h2>Video frames</h2><div className="frames">{frames.map((f) => <a key={f.at} href={f.url} download={`threadhunt-frame-${Math.round(f.at)}.jpg`}><img src={f.url} alt={`Frame at ${f.at.toFixed(1)} seconds`} /><span>{f.at.toFixed(1)}s download</span></a>)}</div></section>}

    {error && <section className="error" role="alert">{error}</section>}

    {data && <section className="results">
      <div className="panel">
        <h2>Live web leads</h2>
        <p className="muted">Pulled from DuckDuckGo HTML search. Use these as leads, then verify size, shipping, seller, and return policy.</p>
        <div className="cards">{data.results.map((r) => <a className="card" key={r.url} href={r.url} target="_blank" rel="noreferrer"><b>{r.title}</b><small>{r.source}</small><p>{r.snippet}</p></a>)}</div>
      </div>
      <div className="panel">
        <h2>Market jump list</h2>
        <div className="markets">{data.markets.map((m) => <a key={m.name} href={m.url} target="_blank" rel="noreferrer"><strong>{m.name}</strong><span>{m.region} · {m.kind}</span><p>{m.notes}</p><em>{host(m.url)}</em></a>)}</div>
      </div>
      <div className="panel caveats"><h2>Reality check</h2><ul>{data.caveats.map((c) => <li key={c}>{c}</li>)}</ul><p>Free sources used: {data.freeSources.join(', ')}.</p></div>
    </section>}
  </main>;
}
