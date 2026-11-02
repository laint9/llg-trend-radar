// Apify: crawl TikTok / Instagram / Facebook / Threads. Cần APIFY_TOKEN.
// Actor nào cũng được, miễn khai báo trong config/settings.json → apify.platforms.
import { fetchWithTimeout, hash, extractHashtags, log, pool } from '../lib/util.mjs';
import { normalizeVenue } from './venues.mjs';

/** Thay placeholder {{x}} trong input template bằng giá trị thật. */
function fillTemplate(tpl, vars) {
  if (typeof tpl === 'string') {
    const m = tpl.match(/^\{\{(\w+)\}\}$/);
    if (m) return vars[m[1]];
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]);
  }
  if (Array.isArray(tpl)) return tpl.map((x) => fillTemplate(x, vars));
  if (tpl && typeof tpl === 'object') return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, fillTemplate(v, vars)]));
  return tpl;
}

const pick = (o, paths) => {
  for (const p of paths) {
    const v = p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    if (v != null && v !== '') return v;
  }
  return null;
};
const num = (v) => (typeof v === 'number' ? v : parseInt(String(v || '0').replace(/[^\d]/g, ''), 10) || 0);

/** Chuẩn hoá output của nhiều actor khác nhau về một schema chung. */
function normalize(platform, raw, region) {
  const text = String(pick(raw, ['text', 'caption', 'description', 'desc', 'postText', 'content', 'message', 'title']) || '');
  const url = pick(raw, ['webVideoUrl', 'url', 'postUrl', 'link', 'permalink', 'topLevelUrl', 'post_url']);
  const tsRaw = pick(raw, ['createTimeISO', 'posted_at', 'timestamp', 'time', 'createTime', 'taken_at', 'publishedAt', 'date', 'created_at']);
  let publishedAt = null;
  if (tsRaw != null) {
    const d = typeof tsRaw === 'number' ? new Date(tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : new Date(tsRaw);
    if (!isNaN(d)) publishedAt = d.toISOString();
  }
  const tags = pick(raw, ['hashtags']);
  const hashtags = [
    ...new Set([
      ...(Array.isArray(tags) ? tags.map((h) => String(typeof h === 'object' ? h.name || h.title || '' : h).replace(/^#/, '').toLowerCase()) : []),
      ...extractHashtags(text),
    ]),
  ].filter(Boolean);
  const metrics = {
    views: num(pick(raw, ['playCount', 'videoPlayCount', 'videoViewCount', 'viewCount', 'views', 'view_count', 'viewsCount'])),
    likes: num(pick(raw, ['diggCount', 'likesCount', 'likes', 'likeCount', 'like_count', 'reactionsCount', 'reactions'])),
    comments: num(pick(raw, ['commentCount', 'commentsCount', 'comments', 'comment_count', 'replyCount', 'reply_count'])),
    shares: num(pick(raw, ['shareCount', 'shares', 'sharesCount', 'repostCount', 'reshareCount', 'repost_count'])),
  };
  return {
    id: hash(`${platform}:${url || text.slice(0, 80)}`),
    platform,
    region,
    title: text.split('\n')[0].slice(0, 140) || '(không có caption)',
    text: text.slice(0, 500),
    url,
    image: pick(raw, ['videoMeta.coverUrl', 'covers.0', 'displayUrl', 'thumbnailUrl', 'thumbnail', 'image', 'media.0.thumbnail', 'images.0', 'full_picture', 'imageUrl', 'media_urls.0']),
    video: platform === 'tiktok' && url ? url : pick(raw, ['videoUrl']),
    author: pick(raw, ['authorMeta.name', 'ownerUsername', 'author.name', 'user.username', 'username', 'pageName', 'user_full_name', 'user.name', 'authorName']),
    source: platform[0].toUpperCase() + platform.slice(1),
    publishedAt,
    hashtags: hashtags.slice(0, 20),
    metrics,
    // Video & âm thanh (để làm "Video đu trend": top TikTok/Reels, âm thanh đang hot)
    isVideo: platform === 'tiktok' || raw.type === 'Video' || raw.productType === 'clips' || !!raw.videoUrl || !!raw.videoPlayCount,
    music: pick(raw, ['musicMeta.musicName', 'musicInfo.song_name', 'musicInfo.songName', 'music.title', 'audio.title']) || null,
    musicAuthor: pick(raw, ['musicMeta.musicAuthor', 'musicInfo.artist_name', 'musicInfo.artistName', 'music.author']) || null,
    musicOriginal: !!pick(raw, ['musicMeta.musicOriginal', 'musicInfo.uses_original_audio']),
    duration: num(pick(raw, ['videoMeta.duration', 'videoDuration', 'duration'])) || null,
  };
}

/**
 * TikTok Creative Center (clockworks~tiktok-trends-scraper): video / âm thanh / hashtag đang trending tại VN.
 * Cấu trúc output có thể khác giữa các phiên bản actor → nhận diện theo field, giữ thêm vài field gốc để kiểm tra.
 */
export function normalizeTrend(raw) {
  const str = (paths) => { const v = pick(raw, paths); return v == null ? null : String(v); };
  const type = String(raw.type || raw.dataType || raw.adsType || '').toLowerCase();
  const isSound = /sound|song|music/.test(type) || !!pick(raw, ['songId', 'soundId', 'clipId', 'musicId', 'song_id']);
  const isHashtag = !isSound && (/hashtag/.test(type) || !!pick(raw, ['hashtagName', 'hashtag_name', 'hashtag']));
  const kind = isSound ? 'sound' : isHashtag ? 'hashtag' : 'video';
  const title = str(['title', 'songName', 'song_name', 'hashtagName', 'hashtag_name', 'name', 'videoTitle', 'text', 'desc']) || '';
  return {
    id: hash(`tiktoktrend:${kind}:${str(['url', 'link', 'itemUrl', 'videoUrl', 'webVideoUrl']) || title}`),
    platform: 'tiktoktrend',
    kind,
    title: title.slice(0, 160),
    author: str(['author', 'artist', 'authorName', 'creator', 'nickName', 'authorMeta.name']),
    url: str(['url', 'link', 'itemUrl', 'videoUrl', 'webVideoUrl', 'detailUrl']) || (kind === 'hashtag' && title ? `https://www.tiktok.com/tag/${encodeURIComponent(title.replace(/^#/, ''))}` : null),
    image: str(['cover', 'coverUrl', 'videoCover', 'thumbnail', 'image', 'imageUrl', 'videoMeta.coverUrl']),
    rank: num(pick(raw, ['rank', 'ranking', 'position'])) || null,
    rankChange: num(pick(raw, ['rankDiff', 'rank_diff', 'rankChange'])) || null,
    metrics: {
      views: num(pick(raw, ['videoViews', 'viewCount', 'views', 'vv', 'playCount', 'video_views', 'publishCnt'])),
      likes: num(pick(raw, ['likes', 'likeCount', 'diggCount', 'like'])),
      posts: num(pick(raw, ['videoCount', 'postCount', 'posts', 'publishCount', 'publish_cnt', 'useCount'])),
    },
    country: str(['countryCode', 'country', 'region']) || 'VN',
    _keys: Object.keys(raw).slice(0, 30),
  };
}

function guessRegion(text) {
  const t = text.toLowerCase();
  if (/quận ?1|quan1|district ?1|quận ?2|quan2|thảo ?điền|thaodien|thủ thiêm|bùi viện|nguyễn huệ/.test(t)) return 'q1q2';
  if (/bangkok|singapore|kuala|jakarta|manila|bali|thailand|malaysia/.test(t)) return 'sea';
  if (/sài ?gòn|saigon|hcm|hồ chí minh/.test(t)) return 'hcm';
  // Có dấu tiếng Việt hoặc nhắc Việt Nam → VN; còn lại là nội dung quốc tế (chỉ hiện ở "Tất cả khu vực")
  if (/vietnam|việt nam|hà nội|hanoi|đà nẵng|[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(t)) return 'vn';
  return 'intl';
}

/**
 * Chạy actor bất đồng bộ (start → poll → lấy dataset) để không bị giới hạn 300s của run-sync.
 * maxItems / maxTotalChargeUsd: Apify dừng tính phí khi chạm trần.
 */
async function runActor(actor, input, token, timeoutSecs, { maxItems, maxCharge } = {}) {
  const H = { Authorization: `Bearer ${token}` };
  const caps = `${maxItems ? `&maxItems=${maxItems}` : ''}${maxCharge ? `&maxTotalChargeUsd=${maxCharge}` : ''}`;
  const res = await fetchWithTimeout(
    `https://api.apify.com/v2/acts/${actor}/runs?timeout=${timeoutSecs}&waitForFinish=60${caps}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify(input) },
    90000,
  );
  if (!res.ok) {
    const body = await res.text();
    // Một số actor yêu cầu trần tối thiểu 0,5 USD/lượt; chi phí thật vẫn bị giới hạn bởi maxItems
    if (/max-total-charge-usd-below-minimum/.test(body) && maxCharge && maxCharge < 0.5) return runActor(actor, input, token, timeoutSecs, { maxItems, maxCharge: 0.5 });
    throw new Error(`Apify ${actor} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  let run = (await res.json()).data;
  const deadline = Date.now() + (timeoutSecs + 120) * 1000;
  while (['READY', 'RUNNING'].includes(run.status) && Date.now() < deadline) {
    const r = await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${run.id}?waitForFinish=60`, { headers: H }, 90000);
    run = (await r.json()).data;
  }
  // TIMED-OUT / ABORTED vẫn có thể có dữ liệu một phần → vẫn lấy
  if (!['SUCCEEDED', 'TIMED-OUT', 'ABORTED'].includes(run.status)) throw new Error(`Apify ${actor}: run ${run.status}`);
  const items = await fetchWithTimeout(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true${maxItems ? `&limit=${maxItems}` : ''}`, { headers: H }, 60000).then((r) => r.json());
  if (run.status !== 'SUCCEEDED') log(`  Apify ${actor}: ${run.status}, dùng ${items.length} kết quả đã lấy được`);
  return items;
}

async function monthlyUsage(token) {
  try {
    const res = await fetchWithTimeout('https://api.apify.com/v2/users/me/limits', { headers: { Authorization: `Bearer ${token}` } }, 15000);
    const d = (await res.json()).data;
    return { used: d?.current?.monthlyUsageUsd ?? 0, limit: d?.limits?.maxMonthlyUsageUsd ?? null };
  } catch {
    return null;
  }
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

/**
 * opts.today: ngày chạy; opts.lastRun: { platform: 'YYYY-MM-DD' } lần crawl thành công gần nhất.
 * Env: APIFY_FORCE=1 bỏ qua lịch; APIFY_SAMPLE=n chỉ lấy n kết quả/nền tảng (để test rẻ).
 */
export async function apify(settings, token, { today, lastRun = {} } = {}) {
  const cfg = settings.apify || {};
  const status = {};
  const ran = {};
  const skipped = [];
  if (!token) {
    for (const p of Object.keys(cfg.platforms || {})) status[p] = 'Thiếu APIFY_TOKEN';
    return { status, items: [], ran, skipped: [] };
  }
  const sample = parseInt(process.env.APIFY_SAMPLE || '0', 10);
  const force = process.env.APIFY_FORCE === '1' || sample > 0;
  const budget = cfg.monthlyBudgetUsd;
  const usage = await monthlyUsage(token);
  if (usage) log(`  Apify: đã dùng ${usage.used.toFixed(2)} USD tháng này${budget ? ` / ngân sách ${budget} USD` : ''}`);
  if (budget && usage && usage.used >= budget * 0.95) {
    for (const [p, c] of Object.entries(cfg.platforms || {})) if (c.enabled) { status[p] = `Tạm dừng: đã dùng ${usage.used.toFixed(2)}/${budget} USD tháng này`; skipped.push(p); }
    return { status, items: [], ran, skipped };
  }
  const limit = cfg.maxItemsPerPlatform || 60;
  // Gói FREE giới hạn số actor chạy đồng thời → tối đa 2 actor một lúc
  const tasks = await pool(Object.entries(cfg.platforms || {}), 2, async ([platform, p]) => {
    if (!p.enabled) return (status[platform] = 'Đang tắt'), [];
    const every = p.everyDays || 1;
    if (!force && today && lastRun[platform] && daysBetween(lastRun[platform], today) < every) {
      const next = new Date(new Date(lastRun[platform]).getTime() + every * 864e5).toISOString().slice(0, 10);
      const vn = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
      status[platform] = `OK · đã crawl ${vn(lastRun[platform])}, lần tới ${vn(next)} (${every} ngày/lần)`;
      skipped.push(platform);
      return [];
    }
    try {
      const since = new Date(Date.now() - (settings.maxPostAgeDays || 30) * 864e5).toISOString().slice(0, 10);
      const vars = {
        since,
        hashtags: p.hashtags || [],
        queries: p.queries || p.hashtags || [],
        urls: (p.urls || []).map((url) => ({ url })),
        limit,
      };
      let raw;
      if (p.runEach === 'queries') {
        // Actor chỉ nhận 1 từ khoá/lượt → chạy lần lượt, chia đều số kết quả
        const qs = vars.queries;
        const per = Math.max(1, Math.ceil((sample || limit) / qs.length));
        raw = [];
        for (const query of qs) {
          try {
            const r = await runActor(p.actor, fillTemplate(p.input || {}, { ...vars, query, limit: per }), token, cfg.timeoutSecs || 240, { maxItems: per, maxCharge: sample ? 0.03 : p.maxChargeUsd });
            raw.push(...(Array.isArray(r) ? r : []));
          } catch (e) {
            log(`  ! Apify ${platform} "${query}": ${e.message.slice(0, 120)}`);
          }
        }
      } else {
        raw = await runActor(p.actor, fillTemplate(p.input || {}, vars), token, cfg.timeoutSecs || 240, {
          maxItems: sample || limit,
          maxCharge: sample ? 0.03 : p.maxChargeUsd,
        });
      }
      const items = (Array.isArray(raw) ? raw : [])
        .filter((r) => !r.error && r.type !== 'error' && (r.url || r.webUrl || r.webVideoUrl || r.postUrl || r.link))
        .slice(0, limit)
        .map((r) => {
          if (p.kind === 'venue') return normalizeVenue(platform, r);
          if (p.kind === 'trend') return normalizeTrend(r);
          const it = normalize(platform, r, 'vn');
          it.region = guessRegion(`${it.text} ${it.hashtags.join(' ')} ${it.author || ''}`);
          return it;
        });
      status[platform] = `OK (${items.length})${sample ? ' – chạy thử' : ''}`;
      if (items.length && !sample) ran[platform] = today; // chạy thử không tính là lần crawl chính thức
      return items;
    } catch (e) {
      log(`  ! Apify ${platform}: ${e.message}`);
      status[platform] = `Lỗi: ${e.message.slice(0, 120)}`;
      return [];
    }
  });
  const items = tasks.filter(Array.isArray).flat();
  return { status, items, ran, skipped };
}
