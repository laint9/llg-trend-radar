// Top xu hướng chung mọi lĩnh vực (không lọc ngành): YouTube Thịnh hành VN + tin nổi bật.
// Google Trends (VN + SEA) đã có trong googleTrending, phần này bổ sung và phân loại lĩnh vực.
import { XMLParser } from 'fast-xml-parser';
import { fetchJson, fetchText, hash, pool, stripHtml, log } from '../lib/util.mjs';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x) => (typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '');

/** Trả về hàm phân loại lĩnh vực + cờ nhạy cảm theo config. */
export function buildClassifier(settings) {
  const cats = (settings.general?.categories || []).map((c) => ({ ...c, re: new RegExp(c.pattern, 'iu') }));
  const sensitive = settings.general?.sensitivePattern ? new RegExp(settings.general.sensitivePattern, 'iu') : null;
  return (text) => {
    const t = String(text || '').toLowerCase();
    const hit = cats.find((c) => c.re.test(t));
    return { category: hit?.id || 'other', sensitive: !!sensitive?.test(t) };
  };
}

export async function youtubeTrending(settings, apiKey) {
  if (!apiKey) return { skipped: 'Thiếu YOUTUBE_API_KEY', items: [] };
  const max = settings.general?.youtubeTrendingMax || 50;
  const [vids, cats] = await Promise.all([
    fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=VN&maxResults=${max}&key=${apiKey}`),
    fetchJson(`https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=VN&hl=vi&key=${apiKey}`).catch(() => ({ items: [] })),
  ]);
  const catName = Object.fromEntries((cats.items || []).map((c) => [c.id, c.snippet.title]));
  return {
    items: (vids.items || []).map((v, i) => ({
      id: hash(`ytt:${v.id}`),
      source: 'YouTube Thịnh hành',
      rank: i + 1,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      image: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url,
      publishedAt: v.snippet.publishedAt,
      ytCategory: catName[v.snippet.categoryId] || null,
      tags: (v.snippet.tags || []).slice(0, 8),
      views: +v.statistics?.viewCount || 0,
      likes: +v.statistics?.likeCount || 0,
      comments: +v.statistics?.commentCount || 0,
    })),
  };
}

export async function generalNews(settings) {
  const res = await pool(settings.general?.feeds || [], 3, async (feed) => {
    const doc = xml.parse(await fetchText(feed.url));
    return arr(doc?.rss?.channel?.item).slice(0, 30).map((it, i) => {
      const url = String(txt(it.link)).trim();
      const enc = arr(it.enclosure)[0]?.['@url'];
      const img = enc || (String(txt(it.description)).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || null;
      return {
        id: hash(`gn:${url}`),
        source: feed.name,
        rank: i + 1,
        title: stripHtml(txt(it.title)),
        text: stripHtml(txt(it.description)).slice(0, 220),
        url,
        image: img,
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      };
    });
  });
  res.forEach((r, i) => r?.error && log(`  ! Tin chung ${settings.general.feeds[i].name}: ${r.error}`));
  return res.filter(Array.isArray).flat();
}
