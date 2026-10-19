// Tổng hợp "Top xu hướng chung" theo kỳ: Google Trends VN/SEA, YouTube Thịnh hành, tin nổi bật.

/**
 * snaps / prevSnaps: snapshot ngày trong kỳ và kỳ trước. classify(text) → { category, sensitive }.
 */
export function summarizeGeneral(snaps, prevSnaps, settings, classify) {
  const cats = Object.fromEntries((settings.general?.categories || []).map((c) => [c.id, { label: c.label, icon: c.icon }]));
  cats.other = { label: 'Khác', icon: '✨' };

  // --- Google Trends: gộp theo tiêu đề, điểm = lượng tìm kiếm × số ngày xuất hiện
  const mergeTrends = (list, geoFilter) => {
    const m = new Map();
    for (const s of list) {
      for (const t of s.googleTrending || []) {
        if (!geoFilter(t.geo)) continue;
        const k = `${t.geo}:${t.title.toLowerCase()}`;
        const e = m.get(k) || { title: t.title, geo: t.geo, traffic: 0, trafficLabel: '', days: new Set(), news: [], image: null, url: t.url };
        if ((t.metrics?.traffic || 0) >= e.traffic) {
          e.traffic = t.metrics?.traffic || 0;
          e.trafficLabel = t.trafficLabel || '';
        }
        e.days.add(s.date);
        e.image ||= t.image;
        for (const n of t.news || []) if (e.news.length < 3 && !e.news.some((x) => x.url === n.url)) e.news.push(n);
        m.set(k, e);
      }
    }
    return [...m.values()].map((e) => ({ ...e, days: e.days.size, score: Math.round(e.traffic * Math.sqrt(e.days.size)) }));
  };
  const prevVN = new Set(mergeTrends(prevSnaps, (g) => g === 'VN').map((t) => t.title.toLowerCase()));
  const tag = (t, text) => {
    const c = classify(text);
    return { ...t, ...c, categoryLabel: cats[c.category]?.label, categoryIcon: cats[c.category]?.icon };
  };
  const searchesVN = mergeTrends(snaps, (g) => g === 'VN')
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((t) => ({ ...tag(t, `${t.title} ${t.news.map((n) => n.title).join(' ')}`), isNew: prevSnaps.length ? !prevVN.has(t.title.toLowerCase()) : null }));
  const searchesSEA = mergeTrends(snaps, (g) => g !== 'VN')
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((t) => tag(t, `${t.title} ${t.news.map((n) => n.title).join(' ')}`));

  // --- YouTube Thịnh hành: giữ lượt xem cao nhất, số ngày lọt top, thứ hạng tốt nhất
  const yt = new Map();
  for (const s of snaps) {
    for (const v of s.general?.youtube || []) {
      const e = yt.get(v.id);
      if (!e) yt.set(v.id, { ...v, days: 1, bestRank: v.rank });
      else {
        e.days++;
        e.bestRank = Math.min(e.bestRank, v.rank);
        if (v.views > e.views) Object.assign(e, { views: v.views, likes: v.likes, comments: v.comments });
      }
    }
  }
  const youtube = [...yt.values()]
    .sort((a, b) => a.bestRank - b.bestRank || b.views - a.views)
    .slice(0, 40)
    .map((v) => tag(v, `${v.title} ${v.ytCategory || ''} ${(v.tags || []).join(' ')}`));

  // --- Tin nổi bật: tin xuất hiện ở nhiều báo / nhiều ngày lên đầu
  const nw = new Map();
  for (const s of snaps) for (const n of s.general?.news || []) if (!nw.has(n.id)) nw.set(n.id, n);
  const news = [...nw.values()]
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, 60)
    .map((n) => tag(n, `${n.title} ${n.text || ''}`));

  // --- Phân bổ lĩnh vực (để thấy cả xã hội đang quan tâm gì)
  const byCategory = {};
  const bump = (c, w) => (byCategory[c] = (byCategory[c] || 0) + w);
  searchesVN.forEach((t) => bump(t.category, Math.log10(t.traffic + 10) * 2));
  youtube.forEach((v) => bump(v.category, Math.log10(v.views + 10)));
  news.forEach((n) => bump(n.category, 1));
  const categories = Object.entries(byCategory)
    .map(([id, score]) => ({ id, label: cats[id]?.label || id, icon: cats[id]?.icon || '•', score: Math.round(score * 10) / 10 }))
    .sort((a, b) => (a.id === 'other') - (b.id === 'other') || b.score - a.score);

  return { searchesVN, searchesSEA, youtube, news, categories, categoryMeta: cats };
}
