// Đề xuất action cho team Marketing (theo luật). AI, nếu bật, sẽ bổ sung action chi tiết hơn.
const PL = { google: 'Google', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube', news: 'Báo chí', pasgo: 'PasGo', googlemaps: 'Google Maps', tripadvisor: 'Tripadvisor' };
const PRIORITY_ORDER = { cao: 0, 'trung bình': 1, thấp: 2 };

/** Các sự kiện sắp tới trong cửa sổ chuẩn bị (leadDays). */
export function upcomingEvents(settings, today) {
  const year = +today.slice(0, 4);
  const out = [];
  for (const e of settings.marketingCalendar?.events || []) {
    const dates = /^\d{4}-/.test(e.date) ? [e.date] : [`${year}-${e.date}`, `${year + 1}-${e.date}`];
    for (const d of dates) {
      const days = Math.round((new Date(d) - new Date(today)) / 864e5);
      if (days >= 0 && days <= (e.leadDays || 14)) out.push({ ...e, date: d, daysLeft: days });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function buildActions(s, settings, today) {
  const A = [];
  const add = (a) => A.push({ source: 'rule', platforms: [], evidence: [], ...a });

  // 1) Sự kiện/lễ sắp tới
  for (const e of upcomingEvents(settings, today).slice(0, 3)) {
    add({
      priority: e.daysLeft <= 7 ? 'cao' : 'trung bình',
      team: 'Content + Promo',
      timeline: e.daysLeft <= 3 ? 'Hôm nay' : e.daysLeft <= 7 ? 'Tuần này' : `Trước ${e.date.slice(8)}/${e.date.slice(5, 7)}`,
      title: `${e.name}: còn ${e.daysLeft} ngày`,
      detail: e.daysLeft <= 7
        ? 'Chốt concept, set menu/cocktail đặc biệt, chạy teaser & mở đặt bàn ngay. Đẩy lên PasGo/Google Business Profile.'
        : 'Lên concept, menu/cocktail chủ đề, lịch đăng teaser (T-14, T-7, T-3, T-1), chuẩn bị ads & landing đặt bàn.',
      kpi: 'Lượt đặt bàn dịp lễ, CTR quảng cáo, lượt lưu/chia sẻ bài teaser',
      why: `Lịch marketing: ${e.name} vào ${e.date.slice(8)}/${e.date.slice(5, 7)}, còn ${e.daysLeft} ngày (cửa sổ chuẩn bị ${e.leadDays || 14} ngày).`,
      platforms: ['Facebook', 'Instagram', 'TikTok', 'PasGo'],
    });
  }

  // 2) Keyword tìm kiếm đang lên → SEO / Google Business / Search Ads
  const rising = (s.topKeywords || []).filter((k) => k.platforms?.google && (k.change === 'new' || k.change >= 30)).slice(0, 5);
  const q1q2 = (s.keywordsByRegion?.q1q2 || []).filter((k) => k.platforms?.google).slice(0, 6);
  const kwSet = rising.length ? rising : q1q2;
  if (kwSet.length) {
    add({
      priority: 'cao',
      team: 'SEO / Ads',
      timeline: 'Tuần này',
      title: rising.length ? 'Bắt keyword tìm kiếm đang tăng' : 'Phủ keyword Q1/Q2 người dùng đang tìm',
      detail: `Đưa các keyword vào mô tả Google Business Profile, bài đăng GBP, tiêu đề web/blog và nhóm quảng cáo Search: ${kwSet.map((k) => `"${k.keyword}"`).join(', ')}.`,
      kpi: 'Lượt hiển thị GBP, thứ hạng Maps cho keyword, CPC/CTR Search Ads',
      why: rising.length
        ? `Các truy vấn Google này mới xuất hiện hoặc tăng ≥ 30% so với kỳ trước: ${rising.map((k) => `${k.keyword} (${k.change === 'new' ? 'mới' : '+' + k.change + '%'})`).join(', ')}.`
        : 'Đây là các truy vấn Google thật đứng đầu ở khu vực Q1/Q2 trong kỳ.',
      platforms: ['Google', 'Google Maps'],
    });
  }

  // 3) Truy vấn kiểu "là gì / ở đâu / review" → content giải đáp
  const info = (s.platforms?.google?.queries || []).filter((q) => /là gì|ở đâu|review|giá|menu|nên|có gì|đi đâu|chỗ nào/.test(q.query)).slice(0, 5);
  if (info.length) {
    add({
      priority: 'trung bình',
      team: 'Content',
      timeline: 'Tuần này',
      title: 'Làm content trả lời đúng câu hỏi khách đang tìm',
      detail: `Video ngắn/carousel/bài SEO trả lời trực tiếp: ${info.map((q) => `"${q.query}"`).join(', ')}. Mở đầu bằng chính câu hỏi làm hook.`,
      kpi: 'Lượt xem 3s, lượt lưu, traffic organic',
      why: `${info.length} truy vấn Google dạng câu hỏi (là gì/ở đâu/review/giá…) đang được người dùng gõ.`,
      platforms: ['TikTok', 'Instagram', 'Google'],
    });
  }

  // 4) Chủ đề nóng nhất/đang tăng → series content
  const hotTheme = [...(s.themes || [])].sort((a, b) => (typeof b.change === 'number' ? b.change : b.change === 'new' ? 999 : 0) - (typeof a.change === 'number' ? a.change : a.change === 'new' ? 999 : 0))[0] || s.themes?.[0];
  if (hotTheme) {
    const bestPlatform = Object.entries(hotTheme.platforms || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    add({
      priority: 'cao',
      team: 'Content / Social',
      timeline: 'Tuần này',
      title: `Series content theo chủ đề "${hotTheme.label}"`,
      detail: `Chủ đề đang ${hotTheme.change === 'new' ? 'mới nổi' : typeof hotTheme.change === 'number' ? `${hotTheme.change >= 0 ? 'tăng' : 'giảm'} ${Math.abs(hotTheme.change)}%` : 'dẫn đầu'}${bestPlatform ? `, mạnh nhất trên ${PL[bestPlatform] || bestPlatform}` : ''}. Làm 3–5 bài nối tiếp, lồng điểm khác biệt của venue mình.`,
      kpi: 'Engagement rate, lượt chia sẻ, tin nhắn hỏi đặt bàn',
      why: `Chủ đề có điểm ${Math.round(hotTheme.score)}${typeof hotTheme.change === 'number' ? `, ${hotTheme.change >= 0 ? 'tăng' : 'giảm'} ${Math.abs(hotTheme.change)}% so với kỳ trước` : hotTheme.change === 'new' ? ', mới xuất hiện' : ''} (tổng hợp tương tác social, báo chí và truy vấn tìm kiếm).`,
      platforms: bestPlatform ? [PL[bestPlatform] || bestPlatform] : [],
      evidence: (hotTheme.evidence || []).slice(0, 3).map((e) => e.url).filter(Boolean),
    });
  }

  // 5) Hashtag
  if (s.hashtags?.suggested?.length) {
    add({
      priority: 'trung bình',
      team: 'Social',
      timeline: 'Hôm nay',
      title: 'Cập nhật bộ hashtag cho bài đăng kỳ này',
      detail: `Dùng bộ: ${s.hashtags.suggested.slice(0, 10).map((t) => '#' + t).join(' ')}. Kết hợp 1–2 hashtag thương hiệu riêng.`,
      kpi: 'Reach từ hashtag/Explore, lượt xem từ người chưa follow',
      why: 'Bộ 5 hashtag chọn từ dữ liệu kỳ này: 3 hashtag có reach trung bình cao nhất, 1 hashtag đang lên, 1 hashtag địa phương.',
      platforms: ['Instagram', 'TikTok', 'Threads'],
    });
  }

  // 6) Nền tảng có reach trung bình cao nhất → dồn ngân sách/tần suất
  const pts = Object.values(s.platformTrends || {}).filter((p) => p.avgReach > 0).sort((a, b) => b.avgReach - a.avgReach);
  if (pts.length >= 2) {
    add({
      priority: 'trung bình',
      team: 'Social / Ads',
      timeline: 'Tháng này',
      title: `Ưu tiên ${PL[pts[0].platform]} cho nội dung xu hướng`,
      detail: `Reach trung bình/bài trên ${PL[pts[0].platform]} ≈ ${pts[0].avgReach.toLocaleString('vi-VN')}, cao nhất trong các nền tảng theo dõi (tiếp theo: ${PL[pts[1].platform]}). Tăng tần suất và cân nhắc boost bài tốt nhất.`,
      kpi: 'Reach/bài, CPM, chi phí/lượt đặt bàn',
      why: `So sánh reach trung bình/bài giữa các nền tảng trong dữ liệu thu thập kỳ này.`,
      platforms: [PL[pts[0].platform]],
    });
  }

  // 7) Thời tiết
  for (const w of (s.weather?.insights || []).filter((x) => x.tag !== 'Tuần qua').slice(0, 2)) {
    add({
      priority: w.tag === 'Mưa tối' ? 'cao' : 'trung bình',
      team: 'Promo / Content',
      timeline: 'Tuần này',
      title: `Thời tiết: ${w.title}`,
      detail: `${w.detail} Gợi ý: ${(w.ideas || []).slice(0, 2).join('; ')}.`,
      kpi: 'Lượt đặt bàn khung 18–21h, tỉ lệ dùng mã ưu đãi',
      why: `Dự báo Open-Meteo cho Q1: ${w.title}.`,
      platforms: ['Facebook', 'Instagram', 'Zalo OA'],
    });
  }

  // 8) Nền tảng đặt bàn / review
  const pg = s.platformTrends?.pasgo;
  if (pg?.dealTypes?.length) {
    add({
      priority: 'trung bình',
      team: 'Promo / BD',
      timeline: 'Tháng này',
      title: 'Benchmark ưu đãi đang chạy trên PasGo',
      detail: `Dạng ưu đãi phổ biến: ${pg.dealTypes.slice(0, 5).map((d) => `${d.name} (${d.n})`).join(', ')}. Loại hình đang được đẩy: ${(pg.categories || []).slice(0, 4).map((c) => c.name).join(', ')}. So sánh với ưu đãi của mình, cân nhắc mở deal độc quyền PasGo cho khung giờ thấp điểm.`,
      kpi: 'Lượt đặt qua PasGo, tỉ lệ lấp bàn giờ thấp điểm',
      why: `Đếm từ ${pg.items} địa điểm/deal PasGo đang đề xuất trong kỳ.`,
      platforms: ['PasGo'],
      evidence: (pg.deals || []).slice(0, 3).map((d) => d.url),
    });
  }
  for (const p of ['googlemaps', 'tripadvisor']) {
    const t = s.platformTrends?.[p];
    if (t?.rising?.length) {
      add({
        priority: 'trung bình',
        team: 'BD / CX',
        timeline: 'Tuần này',
        title: `Địa điểm đang tăng review nhanh trên ${PL[p]}`,
        detail: `${t.rising.slice(0, 4).map((v) => `${v.title} (+${v.reviewsGrowth} review)`).join(', ')}. Xem họ đang làm gì (menu, event, khuyến khích review) và đẩy chương trình xin review sau bữa ăn của mình.`,
        kpi: 'Số review mới/tuần, điểm rating trung bình',
        why: 'Số review tăng giữa các lần crawl (tín hiệu địa điểm đang thu hút khách).',
        platforms: [PL[p]],
        evidence: t.rising.slice(0, 3).map((v) => v.url),
      });
    }
  }

  // 9) Thương hiệu / đối thủ được nhắc
  const brand = settings.brand || {};
  const items = Object.values(s.platforms || {}).flatMap((x) => (Array.isArray(x) ? x : []));
  const mention = (name) => items.filter((it) => `${it.title} ${it.text || ''}`.toLowerCase().includes(name.toLowerCase()));
  for (const name of brand.names || []) {
    const m = mention(name);
    if (m.length) add({ priority: 'cao', team: 'Social / CX', timeline: 'Hôm nay', title: `Thương hiệu "${name}" được nhắc ${m.length} lần`, detail: 'Phản hồi, cảm ơn, xin phép repost nội dung tích cực; xử lý ngay nếu có phản hồi tiêu cực.', kpi: 'Thời gian phản hồi, sentiment', evidence: m.slice(0, 3).map((x) => x.url) });
  }
  for (const name of brand.competitors || []) {
    const m = mention(name);
    if (m.length) add({ priority: 'trung bình', team: 'Marketing lead', timeline: 'Tuần này', title: `Đối thủ "${name}" xuất hiện ${m.length} lần`, detail: 'Xem nội dung/ưu đãi đối thủ đang chạy để điều chỉnh thông điệp và ưu đãi của mình.', kpi: 'Share of voice', evidence: m.slice(0, 3).map((x) => x.url) });
  }
  if (!(brand.names || []).length) {
    add({ priority: 'thấp', team: 'Marketing lead', timeline: 'Tháng này', title: 'Khai báo tên thương hiệu & đối thủ trong config', detail: 'Điền brand.names và brand.competitors trong config/settings.json để tool tự cảnh báo khi được nhắc đến và theo dõi đối thủ trên Maps/Tripadvisor.', kpi: '—' });
  }

  return A.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).map(({ kpi, ...a }, i) => ({ id: `r${i + 1}`, metric: kpi, ...a }));
}

