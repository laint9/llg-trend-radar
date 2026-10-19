// Phân tích: chấm điểm keyword, xu hướng (themes), xếp hạng theo độ tiếp cận.
import { normalizeText, addDays } from './util.mjs';

export const SOCIAL = ['tiktok', 'facebook', 'instagram', 'threads', 'youtube'];
export const VENUE_PLATFORMS = ['pasgo', 'googlemaps', 'tripadvisor'];
export const PLATFORMS = ['google', ...SOCIAL, 'news', ...VENUE_PLATFORMS];
const isVenue = (it) => it.kind === 'venue' || it.kind === 'deal';

// Từ cốt lõi để xác định 1 nội dung có liên quan ngành F&B/nightlife (cố ý chặt để tránh nhiễu).
const DOMAIN_WORDS = [
  'bar', 'pub', 'lounge', 'cocktail', 'mocktail', 'nhà hàng', 'quán bar', 'quán nhậu', 'quán ăn', 'restaurant', 'dining',
  'ẩm thực', 'rượu vang', 'wine', 'whisky', 'whiskey', 'sake', 'craft beer', 'bia thủ công', 'chef', 'đầu bếp', 'nightlife',
  'rooftop', 'speakeasy', 'michelin', 'buffet', 'brunch', 'bartender', 'omakase', 'fine dining', 'fun dining', 'beach club',
  'nightclub', 'hẹn hò', 'ăn tối', 'dinner', 'món ăn', 'food tour', 'phố ẩm thực', 'phố đi bộ', 'lẩu', 'nướng', 'bistro', 'ăn ngon',
  'món ngon', 'quán ngon', 'ăn gì', 'review quán', 'foodie', 'ăn uống',
];

export function buildMatchers(settings) {
  const themeTerms = settings.themes.flatMap((t) => t.terms.map((term) => ({ term: normalizeText(term), theme: t.id })));
  const regionTerms = Object.values(settings.regions).flatMap((r) => r.searchTerms.map(normalizeText));
  const relevantTerms = DOMAIN_WORDS.map(normalizeText);
  const stop = new Set(settings.stopwords.map(normalizeText));
  const exclude = (settings.excludePatterns || []).map((p) => new RegExp(p, 'i'));
  const has = (text, term) => {
    // Khớp theo ranh giới từ (hỗ trợ Unicode tiếng Việt)
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'u').test(text);
  };
  return {
    themeTerms,
    regionTerms,
    stop,
    has,
    excluded: (text) => exclude.some((re) => re.test(text)),
    isRelevant: (text) => {
      const t = normalizeText(text);
      if (exclude.some((re) => re.test(t))) return false;
      return relevantTerms.some((term) => has(t, term));
    },
    /** Điểm liên quan: số cụm từ ngành + chủ đề xuất hiện. */
    relevance: (text) => {
      const t = normalizeText(text);
      return relevantTerms.filter((term) => has(t, term)).length + themeTerms.filter(({ term }) => has(t, term)).length;
    },
    termsIn: (text) => {
      const t = normalizeText(text);
      const compact = t.replace(/\s/g, '');
      return themeTerms.filter(({ term }) => has(t, term) || (term.includes(' ') && compact.includes(term.replace(/\s/g, ''))));
    },
  };
}

/** Độ tiếp cận ước tính của 1 item. */
export function reachOf(it) {
  const m = it.metrics || {};
  if (isVenue(it)) return 0; // địa điểm: dùng venueScore, không cộng vào độ tiếp cận
  if (m.views) return m.views;
  if (m.traffic) return m.traffic;
  const eng = (m.likes || 0) + (m.comments || 0) * 3 + (m.shares || 0) * 5;
  return eng ? eng * 20 : 0; // quy đổi tương tác → reach (hệ số ước lượng)
}

/** Điểm nổi bật của địa điểm: số review tăng trong kỳ (Maps/Tripadvisor) hoặc số mục được PasGo đề xuất. */
export function venueScore(it) {
  const m = it.metrics || {};
  const growth = it.reviewsGrowth || 0;
  return growth * 10 + Math.log10((m.reviews || 0) + 1) * 5 + (m.rating || it.rating || 0) + (m.featured || 0) * 4;
}

const engagementOf = (it) => {
  const m = it.metrics || {};
  return (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
};

const keyOf = (s) => normalizeText(s).replace(/^#/, '').replace(/\s+/g, '');

/** Gộp các snapshot ngày trong 1 khoảng thời gian. */
export function mergeSnapshots(snaps) {
  const items = new Map();
  const queries = new Map();
  const trending = new Map();
  for (const s of snaps) {
    for (const it of s.items || []) {
      const prev = items.get(it.id);
      if (isVenue(it)) {
        // Địa điểm: giữ số liệu mới nhất + số liệu lần đầu để tính đà tăng review
        const metricsFirst = prev?.metricsFirst || it.metrics;
        const sections = [...new Set([...(prev?.sections || []), ...(it.sections || [])])];
        items.set(it.id, { ...it, sections, metricsFirst, reviewsGrowth: (it.metrics?.reviews || 0) - (metricsFirst?.reviews || 0), firstSeen: prev?.firstSeen || s.date, lastSeen: s.date, daysSeen: (prev?.daysSeen || 0) + 1 });
      } else if (!prev || reachOf(it) >= reachOf(prev)) items.set(it.id, { ...it, firstSeen: prev?.firstSeen || s.date, lastSeen: s.date });
      else prev.lastSeen = s.date;
    }
    for (const q of s.searchQueries || []) {
      const k = q.query.toLowerCase();
      const prev = queries.get(k) || { ...q, days: 0, positions: [], dates: [] };
      prev.days++;
      prev.positions.push(q.position);
      prev.dates.push(s.date);
      queries.set(k, prev);
    }
    for (const t of s.googleTrending || []) {
      const k = `${t.geo}:${t.title.toLowerCase()}`;
      const prev = trending.get(k);
      if (!prev || (t.metrics?.traffic || 0) > (prev.metrics?.traffic || 0)) trending.set(k, { ...t, days: (prev?.days || 0) + 1 });
      else prev.days++;
    }
  }
  return { items: [...items.values()], queries: [...queries.values()], trending: [...trending.values()] };
}

/** Chấm điểm keyword từ: truy vấn Google, hashtag social, cụm từ chủ đề trong bài viết/báo, Google Trending. */
export function scoreKeywords(merged, M, regionFilter = null) {
  const kw = new Map();
  const add = (label, score, { platform, region, reach = 0, sample, date }) => {
    const k = keyOf(label);
    if (!k || k.length < 3 || M.stop.has(normalizeText(label)) || M.excluded(label)) return;
    const e = kw.get(k) || { keyword: label, score: 0, mentions: 0, reach: 0, platforms: {}, regions: {}, samples: [], dates: {} };
    if (label.includes(' ') && !e.keyword.includes(' ')) e.keyword = label; // ưu tiên dạng có dấu cách, dễ đọc
    e.score += score;
    e.mentions++;
    e.reach += reach;
    e.platforms[platform] = (e.platforms[platform] || 0) + score;
    if (region) e.regions[region] = (e.regions[region] || 0) + score;
    if (date) e.dates[date] = (e.dates[date] || 0) + score;
    if (sample && e.samples.length < 4 && !e.samples.some((s) => s.url === sample.url)) e.samples.push(sample);
    kw.set(k, e);
  };
  const inRegion = (r) => !regionFilter || r === regionFilter;

  // 1) Truy vấn tìm kiếm thật (Autocomplete)
  for (const q of merged.queries) {
    if (!inRegion(q.region)) continue;
    const avgPos = q.positions.reduce((a, b) => a + b, 0) / q.positions.length;
    const echo = normalizeText(q.query) === normalizeText(q.input) ? 0.5 : 1; // gợi ý trùng với từ gõ vào: giảm trọng số
    const base = (11 - avgPos) * 8 * echo * Math.min(1 + 0.25 * ((q.hits || 1) - 1), 2);
    q.dates.forEach((date) => add(q.query, base, { platform: 'google', region: q.region, date }));
  }
  // 2) Google Trending liên quan
  for (const t of merged.trending) {
    if (!t.relevant || !inRegion(t.region)) continue;
    add(t.title, Math.log10((t.metrics?.traffic || 100) + 10) * 25 * t.days, {
      platform: 'google', region: t.region, reach: t.metrics?.traffic || 0,
      sample: { title: t.title, url: t.url, platform: 'google' }, date: t.publishedAt?.slice(0, 10),
    });
  }
  // 3) Social + YouTube + báo
  for (const it of merged.items) {
    if (!inRegion(it.region)) continue;
    const r = reachOf(it);
    // Địa điểm/deal trên nền tảng đặt bàn: trọng số thấp để không lấn át nhu cầu tìm kiếm & social
    const w = isVenue(it) ? 1.5 : it.platform === 'news' ? 12 : 6 + Math.log10(r + engagementOf(it) + 10) * 6;
    const sample = { title: it.title, url: it.url, platform: it.platform, image: it.image };
    const date = (it.publishedAt || it.lastSeen || '').slice(0, 10);
    for (const h of it.hashtags || []) {
      if (M.stop.has(h)) continue;
      add(`#${h}`, w * 0.8, { platform: it.platform, region: it.region, reach: r, sample, date });
    }
    const seen = new Set();
    for (const { term } of M.termsIn(`${it.title} ${it.text || ''}`)) {
      if (seen.has(term)) continue;
      seen.add(term);
      add(term, w, { platform: it.platform, region: it.region, reach: r, sample, date });
    }
  }
  // Gộp hashtag trùng nghĩa với cụm từ (vd. #hiddenbar ↔ hidden bar) đã xử lý qua keyOf.
  return [...kw.values()]
    .map((e) => ({ ...e, keyword: e.keyword.replace(/^#(?=.*\s)/, ''), score: Math.round(e.score) }))
    .sort((a, b) => b.score - a.score);
}

export function scoreThemes(merged, settings, M) {
  return settings.themes
    .map((t) => {
      const terms = new Set(t.terms.map(normalizeText));
      let score = 0;
      const evidence = [];
      const platforms = {};
      for (const it of merged.items) {
        const hits = M.termsIn(`${it.title} ${it.text || ''} ${(it.hashtags || []).join(' ')}`).filter((x) => x.theme === t.id);
        if (!hits.length) continue;
        const s = 1 + Math.log10(reachOf(it) + engagementOf(it) + 1);
        score += s;
        platforms[it.platform] = (platforms[it.platform] || 0) + s;
        evidence.push({ ...pickCard(it), _s: s });
      }
      const queries = merged.queries.filter((q) => [...terms].some((term) => normalizeText(q.query).includes(term)));
      for (const q of queries) {
        const s = (11 - q.positions[0]) / 3;
        score += s;
        platforms.google = (platforms.google || 0) + s;
      }
      evidence.sort((a, b) => b._s - a._s);
      return {
        id: t.id,
        label: t.label,
        score: Math.round(score * 10) / 10,
        platforms,
        searchQueries: queries.sort((a, b) => a.positions[0] - b.positions[0]).slice(0, 6).map((q) => q.query),
        evidence: evidence.slice(0, 6).map(({ _s, ...e }) => e),
      };
    })
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function pickCard(it) {
  return {
    id: it.id, platform: it.platform, region: it.region, title: it.title, text: it.text?.slice(0, 220),
    url: it.url, image: it.image, video: it.video, author: it.author, source: it.source,
    publishedAt: it.publishedAt, metrics: it.metrics, reach: reachOf(it), hashtags: (it.hashtags || []).slice(0, 8),
    ...(isVenue(it) && {
      kind: it.kind, category: it.category, deal: it.deal, address: it.address, rating: it.rating ?? it.metrics?.rating,
      priceLevel: it.priceLevel, sections: it.sections, reviewsGrowth: it.reviewsGrowth || 0, firstSeen: it.firstSeen,
      rankingString: it.rankingString, venue: it.venue, priceOrigin: it.priceOrigin, rule: it.rule,
    }),
  };
}

/** Xếp hạng nội dung từng nền tảng theo độ tiếp cận. */
export function rankPlatforms(merged, M, n = 25) {
  const out = {};
  for (const p of PLATFORMS) {
    if (p === 'google') continue;
    const list = merged.items.filter((it) => it.platform === p);
    list.sort((a, b) =>
      VENUE_PLATFORMS.includes(p)
        ? venueScore(b) - venueScore(a)
        : p === 'news'
        ? (b.relevance || 0) - (a.relevance || 0) || String(b.publishedAt).localeCompare(String(a.publishedAt))
        : reachOf(b) - reachOf(a) || engagementOf(b) - engagementOf(a),
    );
    out[p] = list.slice(0, p === 'news' || VENUE_PLATFORMS.includes(p) ? 40 : n).map(pickCard);
  }
  // Google: truy vấn tìm kiếm + trending liên quan
  out.google = {
    queries: merged.queries
      .map((q) => {
        const avg = q.positions.reduce((a, b) => a + b, 0) / q.positions.length;
        return { query: q.query, region: q.region, seed: q.seed, days: q.days, avgPosition: Math.round(avg * 10) / 10, interest: Math.round((11 - avg) * 10 * Math.min(q.days, 30) ** 0.5 * Math.min(1 + 0.25 * ((q.hits || 1) - 1), 2)) };
      })
      .filter((q) => normalizeText(q.query) !== normalizeText(q.seed))
      .sort((a, b) => b.interest - a.interest)
      .slice(0, 60),
    trending: merged.trending
      .filter((t) => t.geo === 'VN')
      .sort((a, b) => (b.relevant - a.relevant) || (b.metrics?.traffic || 0) - (a.metrics?.traffic || 0))
      .slice(0, 30)
      .map((t) => ({ title: t.title, traffic: t.metrics?.traffic || 0, trafficLabel: t.trafficLabel, url: t.url, image: t.image, relevant: !!t.relevant, news: (t.news || []).slice(0, 2), days: t.days })),
    trendingSea: merged.trending
      .filter((t) => t.geo !== 'VN' && t.relevant)
      .sort((a, b) => (b.metrics?.traffic || 0) - (a.metrics?.traffic || 0))
      .slice(0, 15)
      .map((t) => ({ title: t.title, geo: t.geo, traffic: t.metrics?.traffic || 0, trafficLabel: t.trafficLabel, url: t.url, image: t.image, news: (t.news || []).slice(0, 2) })),
  };
  return out;
}

export function periodWindow(period, today) {
  const len = { day: 1, week: 7, month: 30 }[period];
  return { len, from: addDays(today, -(len - 1)), to: today, prevFrom: addDays(today, -(2 * len - 1)), prevTo: addDays(today, -len) };
}

/** Tổng hợp hashtag trong kỳ: số bài dùng, reach, tương tác, nền tảng, so sánh kỳ trước. */
export function summarizeHashtags(merged, prev, M) {
  const collect = (m) => {
    const tags = new Map();
    for (const it of m.items) {
      if (!SOCIAL.includes(it.platform)) continue;
      for (const raw of new Set(it.hashtags || [])) {
        const tag = normalizeText(raw).replace(/^#/, '');
        if (!tag || tag.length < 2 || M.stop.has(tag) || M.excluded(tag)) continue;
        const e = tags.get(tag) || { tag, posts: 0, reach: 0, engagement: 0, platforms: {}, regions: {}, topPost: null };
        const r = reachOf(it);
        e.posts++;
        e.reach += r;
        e.engagement += engagementOf(it);
        e.platforms[it.platform] = (e.platforms[it.platform] || 0) + 1;
        e.regions[it.region] = (e.regions[it.region] || 0) + 1;
        if (!e.topPost || r > e.topPost.reach) e.topPost = { title: it.title, url: it.url, reach: r, platform: it.platform };
        tags.set(tag, e);
      }
    }
    return tags;
  };
  const cur = collect(merged);
  const before = prev ? collect(prev) : null;
  const list = [...cur.values()]
    .map((e) => {
      const p = before?.get(e.tag);
      const avgReach = Math.round(e.reach / e.posts);
      return {
        ...e,
        avgReach,
        score: Math.round(e.posts * 10 + Math.log10(avgReach + 10) * 15 + Math.log10(e.engagement + 1) * 5),
        change: !before ? null : p ? Math.round(((e.posts - p.posts) / p.posts) * 100) : 'new',
      };
    })
    .sort((a, b) => b.score - a.score);
  const byPlatform = Object.fromEntries(
    SOCIAL.map((p) => [p, list.filter((h) => h.platforms[p]).slice(0, 20).map((h) => ({ tag: h.tag, posts: h.platforms[p], avgReach: h.avgReach, change: h.change }))]),
  );
  // Bộ hashtag gợi ý: hiệu quả cao (reach TB) + đang lên + gắn địa phương
  const local = list.filter((h) => /saigon|sài ?gòn|hcm|q1|quan1|quận ?[12]|thaodien|thảo ?điền|district/.test(h.tag)).slice(0, 3);
  const performers = [...list].filter((h) => h.posts >= 2).sort((a, b) => b.avgReach - a.avgReach).slice(0, 5);
  const rising = list.filter((h) => h.change === 'new' || h.change > 50).slice(0, 4);
  const suggested = [...new Map([...performers, ...rising, ...local].map((h) => [h.tag, h])).values()].slice(0, 12).map((h) => h.tag);
  return { total: list.length, top: list.slice(0, 60), byPlatform, suggested };
}

/** Xu hướng riêng từng nền tảng. */
export function platformTrends(merged, prev, settings, M, kws) {
  const out = {};
  const sub = (m, p) => ({ items: m.items.filter((i) => i.platform === p), queries: p === 'google' ? m.queries : [], trending: [] });
  for (const p of PLATFORMS) {
    const cur = sub(merged, p);
    if (!cur.items.length && !cur.queries.length) continue;
    const before = prev ? sub(prev, p) : null;
    const prevThemes = before ? new Map(scoreThemes(before, settings, M).map((t) => [t.id, t.score])) : null;
    const themes = scoreThemes(cur, settings, M).slice(0, 6).map((t) => {
      const ps = prevThemes?.get(t.id);
      return { id: t.id, label: t.label, score: t.score, change: !prevThemes ? null : ps ? Math.round(((t.score - ps) / ps) * 100) : 'new', evidence: t.evidence.slice(0, 3) };
    });
    const reach = cur.items.reduce((s, i) => s + reachOf(i), 0);
    const eng = cur.items.reduce((s, i) => s + engagementOf(i), 0);
    const entry = {
      platform: p,
      items: cur.items.length,
      reach,
      avgReach: cur.items.length ? Math.round(reach / cur.items.length) : 0,
      avgEngagement: cur.items.length ? Math.round(eng / cur.items.length) : 0,
      themes,
      keywords: kws.filter((k) => k.platforms[p]).sort((a, b) => b.platforms[p] - a.platforms[p]).slice(0, 8).map((k) => k.keyword),
    };
    if (VENUE_PLATFORMS.includes(p)) {
      const count = (arr) => Object.entries(arr.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
      const venues = cur.items.filter((i) => i.kind === 'venue');
      const cats = venues.flatMap((v) => String(v.categories?.join(',') || v.category || '').split(/,|\(|\)/).map((c) => c.trim()).filter((c) => c && c.length < 40));
      entry.categories = count(cats).slice(0, 10).map(([name, n]) => ({ name, n }));
      const deals = cur.items.map((i) => i.deal || '').filter((d) => d && !/đặt bàn giữ chỗ/i.test(d));
      entry.dealTypes = count(deals.map((d) => (/-?\d+%/.test(d) ? `Giảm ${d.match(/\d+%/)[0]}` : d.split(' · ')[0]))).slice(0, 8).map(([name, n]) => ({ name, n }));
      entry.deals = cur.items.filter((i) => i.kind === 'deal').slice(0, 12).map(pickCard);
      const prevIds = before ? new Set(before.items.map((i) => i.id)) : null;
      entry.newVenues = prevIds ? venues.filter((v) => !prevIds.has(v.id)).slice(0, 12).map(pickCard) : [];
      entry.newSinceNote = prevIds ? null : 'Cần dữ liệu kỳ trước để xác định địa điểm mới';
      entry.rising = venues.filter((v) => (v.reviewsGrowth || 0) > 0).sort((a, b) => b.reviewsGrowth - a.reviewsGrowth).slice(0, 10).map(pickCard);
      const rated = venues.map((v) => v.rating || v.metrics?.rating).filter((r) => r > 0);
      entry.avgRating = rated.length ? Math.round((rated.reduce((a, r) => a + r, 0) / rated.length) * 10) / 10 : null;
    }
    out[p] = entry;
  }
  return out;
}

/** So sánh song song theo phân khúc (bar, cocktail, nhà hàng cao cấp, casual). */
export function segmentSummary(merged, prev, settings, M) {
  const segs = settings.segments || [];
  const textOf = (it) => normalizeText(`${it.title} ${it.text || ''} ${it.category || ''} ${(it.hashtags || []).join(' ')}`);
  const matchSeg = (seg) => {
    const terms = seg.terms.map(normalizeText);
    return (t) => terms.some((term) => M.has(t, term) || (!term.includes(' ') && t.includes(term) && term.length >= 6));
  };
  return segs.map((seg) => {
    const m = matchSeg(seg);
    const pick = (src) => ({
      items: src.items.filter((it) => m(textOf(it))),
      queries: src.queries.filter((q) => m(normalizeText(q.query))),
      trending: src.trending.filter((t) => t.relevant && m(normalizeText(t.title))),
    });
    const cur = pick(merged);
    const before = prev ? pick(prev) : null;
    const social = cur.items.filter((i) => SOCIAL.includes(i.platform));
    const reach = cur.items.reduce((s, i) => s + reachOf(i), 0);
    const eng = social.reduce((s, i) => s + engagementOf(i), 0);
    const kws = scoreKeywords(cur, M).slice(0, 8).map(({ keyword, score }) => ({ keyword, score }));
    const tagCount = {};
    for (const it of social) for (const h of new Set(it.hashtags || [])) if (!M.stop.has(h)) tagCount[h] = (tagCount[h] || 0) + 1;
    const score = Math.round(cur.items.length * 2 + cur.queries.length * 3 + Math.log10(reach + 10) * 10);
    const prevScore = before ? Math.round(before.items.length * 2 + before.queries.length * 3 + Math.log10(before.items.reduce((s, i) => s + reachOf(i), 0) + 10) * 10) : null;
    return {
      id: seg.id, label: seg.label, icon: seg.icon, tone: seg.tone,
      score,
      change: prevScore == null ? null : prevScore ? Math.round(((score - prevScore) / prevScore) * 100) : 'new',
      items: cur.items.length,
      socialPosts: social.length,
      venues: cur.items.filter((i) => i.kind === 'venue').length,
      reach,
      avgEngagement: social.length ? Math.round(eng / social.length) : 0,
      keywords: kws,
      hashtags: Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, n]) => ({ tag, n })),
      searches: cur.queries
        .map((q) => ({ query: q.query, pos: q.positions.reduce((a, b) => a + b, 0) / q.positions.length, region: q.region }))
        .filter((q) => !settings.autocompleteSeeds.some((s) => normalizeText(s) === normalizeText(q.query)))
        .sort((a, b) => a.pos - b.pos)
        .slice(0, 8)
        .map((q) => q.query),
      top: [...cur.items]
        .filter((i) => !isVenue(i))
        .sort((a, b) => reachOf(b) - reachOf(a) || String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .slice(0, 4)
        .map(pickCard),
      topVenues: cur.items.filter(isVenue).sort((a, b) => venueScore(b) - venueScore(a)).slice(0, 3).map(pickCard),
    };
  });
}
