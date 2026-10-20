// Báo chí: Google News RSS theo từng khu vực + RSS trực tiếp của các báo.
import { XMLParser } from 'fast-xml-parser';
import { fetchText, pool, hash, stripHtml, log } from '../lib/util.mjs';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => (typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '');

const LOCALES = {
  vi: 'hl=vi&gl=VN&ceid=VN:vi',
  en: 'hl=en-SG&gl=SG&ceid=SG:en',
};

function imageOf(it) {
  const enc = arr(it.enclosure).find((e) => /image/.test(e?.['@type'] || '') || /\.(jpe?g|png|webp)/i.test(e?.['@url'] || ''));
  if (enc) return enc['@url'];
  const media = arr(it['media:content'])[0] || arr(it['media:thumbnail'])[0];
  if (media?.['@url']) return media['@url'];
  const m = String(txt(it.description)).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function toItem(it, extra) {
  const title = stripHtml(txt(it.title));
  const url = String(txt(it.link)).trim();
  return {
    id: hash(`news:${url || title}`),
    platform: 'news',
    title,
    text: stripHtml(txt(it.description)).slice(0, 400),
    url,
    image: imageOf(it),
    source: stripHtml(txt(it.source)) || extra.source,
    publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    metrics: {},
    ...extra,
  };
}

export async function googleNews(settings) {
  const jobs = [];
  for (const [region, cfg] of Object.entries(settings.regions)) {
    for (const q of cfg.newsQueries || []) jobs.push({ region, q, locale: cfg.newsLocale || 'vi' });
  }
  // Tin theo ngành dịch vụ (vi = TP.HCM, en = góc nhìn khách quốc tế)
  for (const sec of settings.sectors?.list || []) {
    for (const q of sec.news?.vi || []) jobs.push({ region: 'hcm', q, locale: 'vi', sector: sec.id });
    for (const q of sec.news?.en || []) jobs.push({ region: 'global', q, locale: 'en', sector: sec.id });
  }
  const res = await pool(jobs, 3, async ({ region, q, locale, sector }) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&${LOCALES[locale]}`;
    const doc = xml.parse(await fetchText(url));
    return arr(doc?.rss?.channel?.item)
      .slice(0, 12)
      .map((it) => toItem(it, { region, query: q, source: 'Google News', ...(sector && { sector }) }));
  });
  const failed = res.filter((r) => r?.error);
  if (failed.length) log(`  ! Google News: ${failed.length}/${jobs.length} lỗi (${failed[0].error})`);
  return res.filter(Array.isArray).flat();
}

export async function rssFeeds(settings, isRelevant) {
  const res = await pool(settings.rssFeeds || [], 3, async (feed) => {
    const doc = xml.parse(await fetchText(feed.url));
    return arr(doc?.rss?.channel?.item)
      .map((it) => toItem(it, { region: feed.region, source: feed.name, query: 'rss' }))
      .filter((it) => isRelevant(`${it.title} ${it.text}`));
  });
  res.forEach((r, i) => r?.error && log(`  ! RSS ${settings.rssFeeds[i].name}: ${r.error}`));
  return res.filter(Array.isArray).flat();
}
