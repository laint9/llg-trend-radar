import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT, 'public', 'data');
export const DAILY_DIR = join(DATA_DIR, 'daily');

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...opts,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url, opts, timeoutMs) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

export async function fetchJson(url, opts, timeoutMs) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Run async fn over items with limited concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/** Date string YYYY-MM-DD in a timezone. */
export function dateInTz(d = new Date(), tz = 'Asia/Ho_Chi_Minh') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** "200+" / "10K+" / "2M+" → number */
export function parseTraffic(s) {
  const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Math.round(m[2].toLowerCase() === 'k' ? n * 1e3 : m[2].toLowerCase() === 'm' ? n * 1e6 : n);
}

export function extractHashtags(text) {
  return [...String(text || '').matchAll(/#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[1].toLowerCase());
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

export async function listDailyDates() {
  try {
    return (await readdir(DAILY_DIR))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
  } catch {
    return [];
  }
}

export const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
