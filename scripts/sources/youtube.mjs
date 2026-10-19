// YouTube Data API v3 (miễn phí 10.000 unit/ngày). Cần YOUTUBE_API_KEY.
import { fetchJson, hash, extractHashtags, log } from '../lib/util.mjs';

export async function youtube(settings, apiKey) {
  if (!apiKey) return { skipped: 'Thiếu YOUTUBE_API_KEY', items: [] };
  const after = new Date(Date.now() - 7 * 864e5).toISOString();
  const ids = new Map();
  for (const q of settings.youtubeQueries || []) {
    try {
      const sea = /bangkok|singapore|kuala|jakarta|manila/i.test(q);
      const u = new URL('https://www.googleapis.com/youtube/v3/search');
      Object.entries({
        part: 'snippet', type: 'video', maxResults: '10', order: 'viewCount', q,
        publishedAfter: after, key: apiKey,
        ...(sea ? {} : { regionCode: 'VN', relevanceLanguage: 'vi' }),
      }).forEach(([k, v]) => u.searchParams.set(k, v));
      const data = await fetchJson(u);
      for (const it of data.items || []) {
        const region = sea ? 'sea' : /quận 1|quận 2|thảo điền/i.test(q) ? 'q1q2' : 'hcm';
        if (!ids.has(it.id.videoId)) ids.set(it.id.videoId, { q, region });
      }
    } catch (e) {
      log(`  ! YouTube "${q}": ${e.message.slice(0, 160)}`);
    }
  }
  const items = [];
  const all = [...ids.keys()];
  for (let i = 0; i < all.length; i += 50) {
    const u = new URL('https://www.googleapis.com/youtube/v3/videos');
    u.searchParams.set('part', 'snippet,statistics');
    u.searchParams.set('id', all.slice(i, i + 50).join(','));
    u.searchParams.set('key', apiKey);
    const data = await fetchJson(u);
    for (const v of data.items || []) {
      const s = v.statistics || {};
      const meta = ids.get(v.id);
      const text = `${v.snippet.title} ${v.snippet.description || ''}`;
      items.push({
        id: hash(`yt:${v.id}`),
        platform: 'youtube',
        region: meta.region,
        query: meta.q,
        title: v.snippet.title,
        text: (v.snippet.description || '').slice(0, 300),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        video: `https://www.youtube.com/embed/${v.id}`,
        image: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url,
        author: v.snippet.channelTitle,
        source: 'YouTube',
        publishedAt: v.snippet.publishedAt,
        hashtags: [...new Set([...(v.snippet.tags || []).map((t) => t.toLowerCase()), ...extractHashtags(text)])].slice(0, 15),
        metrics: { views: +s.viewCount || 0, likes: +s.likeCount || 0, comments: +s.commentCount || 0 },
      });
    }
  }
  return { items };
}
