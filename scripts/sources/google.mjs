// Google: Trending searches (RSS, có lượng tìm kiếm ước tính) + Autocomplete (từ khoá người dùng thực sự gõ).
import { XMLParser } from 'fast-xml-parser';
import { fetchText, pool, hash, parseTraffic, log, sleep } from '../lib/util.mjs';

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

const TREND_GEOS = { VN: 'vn', SG: 'sea', TH: 'sea', MY: 'sea', PH: 'sea', ID: 'sea' };

export async function googleTrending() {
  const out = [];
  for (const [geo, region] of Object.entries(TREND_GEOS)) {
    try {
      const doc = xml.parse(await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`));
      for (const it of arr(doc?.rss?.channel?.item)) {
        const news = arr(it['ht:news_item']).map((n) => ({
          title: n['ht:news_item_title'],
          url: n['ht:news_item_url'],
          image: n['ht:news_item_picture'],
          source: n['ht:news_item_source'],
        }));
        out.push({
          id: hash(`gt:${geo}:${it.title}`),
          platform: 'google',
          kind: 'trending',
          geo,
          region,
          title: String(it.title),
          url: `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(it.title)}&date=now%207-d`,
          image: it['ht:picture'] || news[0]?.image || null,
          source: `Google Trends ${geo}`,
          publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
          metrics: { traffic: parseTraffic(it['ht:approx_traffic']) },
          trafficLabel: it['ht:approx_traffic'] || '',
          news,
        });
      }
    } catch (e) {
      log(`  ! Google Trends ${geo}: ${e.message}`);
    }
    await sleep(400);
  }
  return out;
}

/** Xác định khu vực theo nội dung truy vấn thật (vd. "quận 10" không phải Q1). */
function regionOfQuery(q, fallback) {
  const t = q.toLowerCase();
  if (/(quận|q\.?)\s?[12](?!\d)|thảo điền|thao dien|thủ thiêm|district [12](?!\d)|bùi viện|nguyễn huệ|đồng khởi/.test(t)) return 'q1q2';
  if (/(quận|q\.?)\s?\d+|bình thạnh|phú nhuận|gò vấp|tân bình|thủ đức|sài gòn|saigon|tphcm|hcm|hồ chí minh/.test(t)) return 'hcm';
  if (/hà nội|đà nẵng|nha trang|đà lạt|vũng tàu|phú quốc|hội an/.test(t)) return 'vn';
  return fallback === 'q1q2' ? 'hcm' : fallback;
}

/**
 * Google Autocomplete: mỗi gợi ý là một truy vấn thật mà nhiều người đang gõ.
 * Vị trí càng cao → mức độ phổ biến càng cao (proxy cho lượng tìm kiếm).
 */
export async function googleAutocomplete(settings) {
  const seeds = settings.autocompleteSeeds || [];
  const suffixRegion = { 'quận 1': 'q1q2', 'quận 2': 'q1q2', 'thảo điền': 'q1q2', 'sài gòn': 'hcm' };
  const jobs = [];
  for (const seed of seeds) {
    jobs.push({ q: seed, region: 'vn', seed });
    for (const suf of settings.autocompleteSuffixes || []) {
      jobs.push({ q: `${seed} ${suf}`, region: suffixRegion[suf] || 'hcm', seed });
    }
  }
  const results = await pool(jobs, 4, async (job) => {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=vn&q=${encodeURIComponent(job.q)}`;
    const text = await fetchText(url, {}, 10000);
    const [, list] = JSON.parse(text);
    await sleep(120);
    return (list || []).map((s, i) => ({ query: String(s), seed: job.seed, input: job.q, region: job.region, position: i + 1 }));
  });
  const exclude = (settings.excludePatterns || []).map((p) => new RegExp(p, 'i'));
  const flat = results
    .filter(Array.isArray)
    .flat()
    .filter((r) => !exclude.some((re) => re.test(r.query)))
    .map((r) => ({ ...r, region: regionOfQuery(r.query, r.region) }));
  const failed = results.filter((r) => r && r.error).length;
  if (failed) log(`  ! Autocomplete: ${failed}/${jobs.length} request lỗi`);
  // Dedupe theo query, giữ vị trí tốt nhất
  const best = new Map();
  for (const r of flat) {
    const k = r.query.toLowerCase();
    const prev = best.get(k);
    if (!prev || r.position < prev.position) best.set(k, { ...r, hits: (prev?.hits || 0) + 1 });
    else prev.hits++;
  }
  return [...best.values()];
}
