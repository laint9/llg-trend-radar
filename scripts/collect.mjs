#!/usr/bin/env node
// Pipeline hằng ngày: thu thập → lưu snapshot ngày → tổng hợp ngày/tuần/tháng → (tuỳ chọn) AI insight.
// Chạy: node scripts/collect.mjs [--aggregate-only] [--no-ai] [--date=YYYY-MM-DD]
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, DATA_DIR, DAILY_DIR, readJson, writeJson, listDailyDates, dateInTz, addDays, log } from './lib/util.mjs';
import { googleTrending, googleAutocomplete } from './sources/google.mjs';
import { googleNews, rssFeeds } from './sources/news.mjs';
import { youtube } from './sources/youtube.mjs';
import { apify } from './sources/apify.mjs';
import { weather, weatherInsights } from './sources/weather.mjs';
import { pasgo } from './sources/venues.mjs';
import { buildActions, upcomingEvents } from './lib/actions.mjs';
import { buildMatchers, mergeSnapshots, scoreKeywords, scoreThemes, rankPlatforms, periodWindow, PLATFORMS, reachOf, summarizeHashtags, platformTrends } from './lib/analyze.mjs';
import { resolveProvider, generateInsights } from './lib/ai.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const settings = await readJson(join(ROOT, 'config', 'settings.json'));
const today = args.date || dateInTz(new Date(), settings.timezone);
const M = buildMatchers(settings);

/** Lần crawl Apify gần nhất của từng nền tảng + dữ liệu để dùng lại khi chưa tới lịch chạy. */
async function previousApify() {
  const dates = (await listDailyDates()).filter((d) => d < today).reverse().slice(0, 30);
  const lastRun = {};
  const carry = {};
  for (const d of dates) {
    const snap = await readJson(join(DAILY_DIR, `${d}.json`));
    for (const [p, date] of Object.entries(snap?.apifyRuns || {})) if (!lastRun[p] || date > lastRun[p]) lastRun[p] = date;
    for (const it of snap?.items || []) {
      if (!settings.apify?.platforms?.[it.platform]) continue;
      if (carry[it.platform]?.date && carry[it.platform].date !== d) continue; // chỉ lấy từ snapshot mới nhất có nền tảng đó
      (carry[it.platform] ||= { date: d, items: [] }).items.push({ ...it, carried: true });
    }
  }
  return { lastRun, carry };
}

async function collect() {
  log(`Thu thập dữ liệu cho ngày ${today}`);
  const prevApify = await previousApify();
  const status = {};
  const track = async (name, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      status[name] = status[name] || `OK`;
      log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return r;
    } catch (e) {
      status[name] = `Lỗi: ${e.message.slice(0, 160)}`;
      log(`  ✗ ${name}: ${e.message}`);
      return null;
    }
  };

  const [trending, queries, news, feeds, yt, social, wx, pg] = await Promise.all([
    track('googleTrends', () => googleTrending()),
    track('googleAutocomplete', () => googleAutocomplete(settings)),
    track('googleNews', () => googleNews(settings)),
    track('rss', () => rssFeeds(settings, M.isRelevant)),
    track('youtube', () => youtube(settings, process.env.YOUTUBE_API_KEY)),
    track('apify', () => apify(settings, process.env.APIFY_TOKEN, { today, lastRun: prevApify.lastRun })),
    track('weather', () => weather(settings)),
    track('pasgo', () => pasgo(settings)),
  ]);
  if (yt?.skipped) status.youtube = yt.skipped;
  if (pg?.skipped) status.pasgo = pg.skipped;
  else if (pg) status.pasgo = `OK (${pg.items.length})`;
  Object.entries(social?.status || {}).forEach(([p, s]) => (status[p] = s));
  // Facebook/Threads lấy theo Page/từ khoá nên dễ lẫn bài ngoài ngành → chỉ giữ bài liên quan
  if (social?.items) {
    const before = social.items.length;
    social.items = social.items.filter((it) => !['facebook', 'threads'].includes(it.platform) || M.isRelevant(`${it.title} ${it.text || ''} ${(it.hashtags || []).join(' ')}`));
    if (before !== social.items.length) log(`  Lọc bỏ ${before - social.items.length} bài Facebook/Threads không liên quan`);
  }
  // Nền tảng chưa tới lịch crawl: dùng lại dữ liệu lần gần nhất
  const carried = (social?.skipped || []).flatMap((p) => prevApify.carry[p]?.items || []);
  const apifyRuns = { ...prevApify.lastRun, ...(social?.ran || {}) };
  delete status.apify;

  for (const t of trending || []) t.relevant = M.isRelevant(`${t.title} ${(t.news || []).map((n) => n.title).join(' ')}`);

  // Báo: chỉ giữ bài thật sự liên quan ngành, hoặc sự kiện lớn tại Q1/Q2 (kéo lượng khách đi chơi)
  const EVENT = /concert|nhạc hội|lễ hội|festival|sự kiện|countdown|pháo hoa|đại nhạc hội|show diễn|biểu diễn/i;
  for (const it of [...(news || []), ...(feeds || [])]) it.relevance = M.relevance(`${it.title} ${it.text || ''}`);
  const keepNews = (it) => it.relevance > 0 || (it.region === 'q1q2' && EVENT.test(it.title));

  const items = new Map();
  for (const it of [...(news || []).filter(keepNews), ...(feeds || []), ...(yt?.items || []), ...(social?.items || []), ...carried, ...(pg?.items || [])]) {
    if (!it.url && !it.title) continue;
    const prev = items.get(it.id);
    if (!prev || (prev.region !== 'q1q2' && it.region === 'q1q2')) items.set(it.id, it);
  }
  status.counts = { searchQueries: queries?.length || 0, trending: trending?.length || 0, items: items.size };

  const snap = { date: today, generatedAt: new Date().toISOString(), apifyRuns, status, items: [...items.values()], searchQueries: queries || [], googleTrending: trending || [], weather: wx };
  await writeJson(join(DAILY_DIR, `${today}.json`), snap);
  log(`Đã lưu snapshot: ${items.size} nội dung, ${queries?.length || 0} truy vấn, ${trending?.length || 0} trending`);

  // Dọn snapshot quá cũ
  const keep = settings.historyDays || 120;
  for (const d of await listDailyDates()) if (d < addDays(today, -keep)) await rm(join(DAILY_DIR, `${d}.json`));
}

function aiPayload(s) {
  const slim = (x) => ({ title: x.title, url: x.url, region: x.region, reach: x.reach, author: x.author, hashtags: x.hashtags?.slice(0, 5) });
  return {
    period: { from: s.from, to: s.to },
    topKeywords: s.topKeywords.slice(0, 20).map((k) => ({ keyword: k.keyword, score: k.score, change: k.change, platforms: Object.keys(k.platforms), regions: Object.keys(k.regions) })),
    keywordsByRegion: Object.fromEntries(Object.entries(s.keywordsByRegion).map(([r, l]) => [r, l.slice(0, 8).map((k) => k.keyword)])),
    themes: s.themes.slice(0, 8).map((t) => ({ label: t.label, score: t.score, change: t.change, searchQueries: t.searchQueries, evidence: t.evidence.slice(0, 3).map(slim) })),
    googleSearchQueries: s.platforms.google.queries.slice(0, 30).map((q) => `${q.query} (${q.region})`),
    googleTrendingVN: s.platforms.google.trending.slice(0, 15).map((t) => `${t.title} [${t.trafficLabel}]${t.relevant ? ' *liên quan*' : ''}`),
    googleTrendingSEA: s.platforms.google.trendingSea.slice(0, 8).map((t) => `${t.title} (${t.geo})`),
    topContent: Object.fromEntries(PLATFORMS.filter((p) => p !== 'google').map((p) => [p, (s.platforms[p] || []).slice(0, p === 'news' ? 15 : 6).map(slim)])),
    weather: { next7: s.weather.days.filter((d) => d.date >= today).slice(0, 7), ruleInsights: s.weather.insights.map((i) => i.title) },
    platformTrends: Object.fromEntries(
      Object.entries(s.platformTrends).map(([p, t]) => [
        p,
        {
          items: t.items, avgReach: t.avgReach, avgEngagement: t.avgEngagement, keywords: t.keywords,
          themes: t.themes.map((x) => `${x.label} (${x.score}${x.change != null ? `, ${x.change === 'new' ? 'mới' : x.change + '%'}` : ''})`),
          hashtags: (s.hashtags.byPlatform[p] || []).slice(0, 10).map((h) => '#' + h.tag),
          ...(t.categories && { categories: t.categories.slice(0, 8).map((c) => `${c.name} (${c.n})`), dealTypes: t.dealTypes.map((d) => `${d.name} (${d.n})`), sampleDeals: t.deals.slice(0, 6).map((d) => `${d.title} – ${d.venue || ''} ${d.deal || ''}`), risingVenues: t.rising.slice(0, 5).map((v) => `${v.title} +${v.reviewsGrowth} review`), newVenues: t.newVenues.slice(0, 6).map((v) => v.title) }),
        },
      ]),
    ),
    hashtags: { top: s.hashtags.top.slice(0, 25).map((h) => `#${h.tag} (${h.posts} bài, reach TB ${h.avgReach}${h.change != null ? `, ${h.change === 'new' ? 'mới' : h.change + '%'}` : ''})`), suggested: s.hashtags.suggested },
    upcomingEvents: s.upcomingEvents.map((e) => `${e.name} – ${e.date} (còn ${e.daysLeft} ngày)`),
    ruleActions: s.actions.map((a) => `[${a.priority}] ${a.title}`),
    brand: settings.brand,
  };
}

async function aggregate({ useAi }) {
  const dates = await listDailyDates();
  if (!dates.length) throw new Error('Chưa có snapshot nào trong public/data/daily');
  const latest = dates.filter((d) => d <= today).pop();
  const cache = new Map();
  const load = async (d) => (cache.has(d) ? cache.get(d) : cache.set(d, await readJson(join(DAILY_DIR, `${d}.json`))).get(d));
  const snapsIn = async (from, to) => Promise.all(dates.filter((d) => d >= from && d <= to).map(load));
  const latestSnap = await load(latest);
  const ai = useAi ? resolveProvider(settings) : { provider: 'none' };
  const regen = settings.ai?.regenerateEveryDays || { day: 1, week: 1, month: 3 };
  log(`Tổng hợp (mốc ${latest}), AI: ${ai.provider}${ai.model ? ` / ${ai.model}` : ''}`);

  for (const period of ['day', 'week', 'month']) {
    const w = periodWindow(period, latest);
    const snaps = await snapsIn(w.from, w.to);
    const prevSnaps = await snapsIn(w.prevFrom, w.prevTo);
    const merged = mergeSnapshots(snaps);
    const prev = prevSnaps.length ? mergeSnapshots(prevSnaps) : null;

    const kws = scoreKeywords(merged, M);
    const prevKw = prev ? new Map(scoreKeywords(prev, M).map((k) => [k.keyword.toLowerCase(), k.score])) : null;
    const withChange = (k) => {
      const p = prevKw?.get(k.keyword.toLowerCase());
      return { ...k, change: !prevKw ? null : p ? Math.round(((k.score - p) / p) * 100) : 'new' };
    };
    const topKeywords = kws.slice(0, 30).map(withChange);
    const keywordsByRegion = Object.fromEntries(Object.keys(settings.regions).map((r) => [r, scoreKeywords(merged, M, r).slice(0, 10).map(withChange)]));
    const keywordsByPlatform = Object.fromEntries(
      PLATFORMS.map((p) => [p, kws.filter((k) => k.platforms[p]).sort((a, b) => b.platforms[p] - a.platforms[p]).slice(0, 10).map((k) => ({ keyword: k.keyword, score: Math.round(k.platforms[p]) }))]),
    );
    const themesPrev = prev ? new Map(scoreThemes(prev, settings, M).map((t) => [t.id, t.score])) : null;
    const themes = scoreThemes(merged, settings, M).map((t) => {
      const p = themesPrev?.get(t.id);
      return { ...t, change: !themesPrev ? null : p ? Math.round(((t.score - p) / p) * 100) : 'new' };
    });
    const platforms = rankPlatforms(merged, M);
    const hashtags = summarizeHashtags(merged, prev, M);
    const pTrends = platformTrends(merged, prev, settings, M, kws);
    const days = [];
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) days.push(d);
    const keywordHistory = {
      dates: days,
      series: topKeywords.slice(0, 10).map((k) => ({ keyword: k.keyword, values: days.map((d) => Math.round(k.dates[d] || 0)) })),
    };
    const wx = latestSnap.weather || { days: [] };

    const reachByPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, merged.items.filter((i) => i.platform === p).reduce((s, i) => s + reachOf(i), 0)]));
    const summary = {
      period, from: w.from, to: w.to, generatedAt: new Date().toISOString(), daysWithData: snaps.length,
      kpis: {
        items: merged.items.length,
        searchQueries: merged.queries.length,
        totalReach: Object.values(reachByPlatform).reduce((a, b) => a + b, 0),
        reachByPlatform,
        itemsByPlatform: Object.fromEntries(PLATFORMS.map((p) => [p, merged.items.filter((i) => i.platform === p).length])),
        itemsByRegion: Object.fromEntries(Object.keys(settings.regions).map((r) => [r, merged.items.filter((i) => i.region === r).length])),
      },
      topKeywords: topKeywords.map(({ dates, ...k }) => k),
      keywordsByRegion: Object.fromEntries(Object.entries(keywordsByRegion).map(([r, l]) => [r, l.map(({ dates, samples, ...k }) => k)])),
      keywordsByPlatform,
      keywordHistory,
      themes,
      platforms,
      weather: { location: wx.location, days: wx.days, insights: weatherInsights(wx, latest) },
      hashtags,
      platformTrends: pTrends,
      upcomingEvents: upcomingEvents(settings, latest),
      regions: Object.fromEntries(Object.entries(settings.regions).map(([k, v]) => [k, v.label])),
      sourceStatus: latestSnap.status,
      ai: null,
    };
    summary.actions = buildActions(summary, settings, latest);

    const file = join(DATA_DIR, `summary-${period}.json`);
    const old = await readJson(file);
    const fresh = old?.ai?.generatedAt && old.ai.to === summary.to && (Date.now() - new Date(old.ai.generatedAt)) / 864e5 < 0.5;
    const recent = old?.ai?.generatedAt && (Date.now() - new Date(old.ai.generatedAt)) / 864e5 < (regen[period] ?? 1) - 0.1;
    if (ai.provider !== 'none' && (args['force-ai'] || !(fresh || recent))) {
      try {
        const label = { day: `Ngày ${w.to}`, week: `7 ngày ${w.from} → ${w.to}`, month: `30 ngày ${w.from} → ${w.to}` }[period];
        const insights = await generateInsights(ai, aiPayload(summary), label);
        summary.ai = { provider: ai.provider, model: ai.model, generatedAt: new Date().toISOString(), to: summary.to, ...insights };
      } catch (e) {
        log(`  ! AI ${period}: ${e.message}`);
        summary.ai = old?.ai ? { ...old.ai, stale: true } : { error: e.message.slice(0, 200) };
      }
    } else if (old?.ai && !old.ai.error && ai.provider !== 'none') {
      summary.ai = { ...old.ai, reused: true };
    }
    await writeJson(file, summary);
    log(`  ✓ summary-${period}.json (${snaps.length} ngày dữ liệu, ${merged.items.length} nội dung)`);
  }

  await writeJson(join(DATA_DIR, 'meta.json'), {
    lastUpdated: new Date().toISOString(), latestDate: latest, dates, ai: { provider: ai.provider, model: ai.model || null },
    sourceStatus: latestSnap.status,
  });
}

if (!args['aggregate-only']) await collect();
await aggregate({ useAi: !args['no-ai'] });
log('Hoàn tất.');
