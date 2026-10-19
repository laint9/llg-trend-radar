// LLG Trend Radar: dashboard tĩnh, đọc JSON trong /data do GitHub Actions tạo hằng ngày.
const $ = (s, el = document) => el.querySelector(s);
const PLATFORM = {
  google: { label: 'Google Search', icon: 'G' },
  tiktok: { label: 'TikTok', icon: '♪' },
  facebook: { label: 'Facebook', icon: 'f' },
  instagram: { label: 'Instagram', icon: '◎' },
  threads: { label: 'Threads', icon: '@' },
  youtube: { label: 'YouTube', icon: '▶' },
  news: { label: 'Báo chí', icon: '📰' },
  pasgo: { label: 'PasGo', icon: '🍽' },
  googlemaps: { label: 'Google Maps', icon: '📍' },
  tripadvisor: { label: 'Tripadvisor', icon: '🦉' },
};
const VENUE = ['pasgo', 'googlemaps', 'tripadvisor'];
const REGION_SHORT = { q1q2: 'Q1/Q2', hcm: 'HCM', vn: 'VN', sea: 'SEA', intl: 'Quốc tế' };
const WX_ICON = (c) => (c >= 95 ? '⛈' : c >= 80 ? '🌧' : c >= 61 ? '🌧' : c >= 51 ? '🌦' : c >= 45 ? '🌫' : c >= 3 ? '☁' : c >= 1 ? '⛅' : '☀');

const state = { period: 'day', region: 'all', platform: 'google', ptPlatform: null, htPlatform: 'all', actionSrc: 'all', genTab: 'vn', genCat: 'all', data: {}, meta: null };
const charts = {};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(Math.round(n));
};
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const tile = (p, cls = '') => `<span class="tile ${cls} tile-${esc(p)}" aria-hidden="true">${PLATFORM[p]?.icon || '•'}</span>`;
const TILE_TONES = ['violet', 'blue', 'peach', 'mint', 'pink', 'yellow'];
const pdot = (p) => `<span class="pdot" style="--c:var(--p-${p})">${esc(PLATFORM[p]?.label || p)}</span>`;
const rtag = (r) => (r ? `<span class="rtag">${esc(REGION_SHORT[r] || r)}</span>` : '');
const delta = (c) =>
  c == null ? '' : c === 'new' ? '<span class="delta new">MỚI</span>' : `<span class="delta ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c)}%</span>`;
const inRegion = (it) => state.region === 'all' || it.region === state.region;

async function load(period) {
  if (!state.data[period]) {
    const res = await fetch(`data/summary-${period}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Không tải được dữ liệu ${period}`);
    state.data[period] = await res.json();
  }
  return state.data[period];
}

// ---------- render ----------
function renderKpis(d) {
  const k = d.kpis;
  const label = { day: 'hôm nay', week: '7 ngày', month: '30 ngày' }[d.period];
  const top = currentKeywords(d)[0];
  const hero = `<div class="kpi hero">
      <span class="tagline">Keyword #1 · ${esc(label)}</span>
      <div class="v">${esc(top?.keyword || '—')}</div>
      <div class="l">${top ? `Điểm ${fmt(top.score)} · ${Object.keys(top.platforms || {}).map((p) => PLATFORM[p]?.label || p).join(', ')}` : 'Chưa có dữ liệu'}</div>
    </div>`;
  $('#kpis').innerHTML = hero + [
    ['blue', '🔎', fmt(k.searchQueries), 'Truy vấn tìm kiếm thật'],
    ['violet', '📊', fmt(k.items), `Nội dung & địa điểm thu thập (${label})`],
    ['peach', '👀', k.totalReach ? fmt(k.totalReach) : '—', k.totalReach ? 'Tổng độ tiếp cận ước tính' : 'Độ tiếp cận (cần Apify/YouTube)'],
  ]
    .map(([tone, ic, v, l]) => `<div class="kpi"><span class="ico tile-${tone}">${ic}</span><div class="v">${v}</div><div class="l">${l}</div></div>`)
    .join('');
}

function renderAiSummary(d) {
  const ai = d.ai;
  if (ai && ai.summary) {
    $('#ai-summary').innerHTML = `
      <span class="tag">Tóm tắt AI · ${esc(ai.provider)}/${esc(ai.model)}${ai.stale ? ' · AI lỗi, đang hiện bản trước' : ''}</span>
      <p>${esc(ai.summary)}</p>`;
  } else {
    const top = (d.topKeywords || []).slice(0, 5).map((k) => `<b>${esc(k.keyword)}</b>`).join(', ');
    const th = (d.themes || []).slice(0, 3).map((t) => `<b>${esc(t.label)}</b>`).join(', ');
    $('#ai-summary').innerHTML = `
      <span class="tag">Tóm tắt tự động (chưa bật AI)</span>
      <p>Keyword nổi bật: ${top || '—'}. Chủ đề nóng nhất: ${th || '—'}.</p>
      <p class="muted small">${ai?.error ? `Lỗi AI: ${esc(ai.error)}. ` : ''}Thêm ANTHROPIC_API_KEY, OPENAI_API_KEY hoặc GEMINI_API_KEY vào GitHub Secrets để có phân tích insight, xu hướng và gợi ý content chi tiết.</p>`;
  }
}

function currentKeywords(d) {
  const list = state.region === 'all' ? d.topKeywords : d.keywordsByRegion[state.region] || [];
  return list.slice(0, 10);
}

function renderKeywords(d) {
  const list = currentKeywords(d);
  const insights = new Map((d.ai?.keywordInsights || []).map((k) => [k.keyword.toLowerCase(), k.insight]));
  const max = Math.max(...list.map((k) => k.score), 1);
  $('#kw-list').innerHTML = list.length
    ? list
        .map((k, i) => {
          const plats = Object.entries(k.platforms || {}).sort((a, b) => b[1] - a[1]).map(([p]) => pdot(p)).join(' ');
          const regs = Object.keys(k.regions || {}).map(rtag).join(' ');
          const ins = insights.get(k.keyword.toLowerCase());
          const topP = Object.entries(k.platforms || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'google';
          return `<li data-i="${i}">
            <span class="kw-rank">${tile(topP)}<span class="no">${i + 1}</span></span>
            <div>
              <div class="kw-name">${esc(k.keyword)}</div>
              <div class="kw-bar"><span style="width:${(k.score / max) * 100}%"></span></div>
              <div class="kw-meta">${plats} ${regs}${k.reach ? `<span class="rtag">reach ~${fmt(k.reach)}</span>` : ''}</div>
              ${ins ? `<div class="kw-insight">💡 ${esc(ins)}</div>` : ''}
            </div>
            <div class="kw-score">${fmt(k.score)}${delta(k.change)}</div>
          </li>`;
        })
        .join('')
    : '<li class="empty">Chưa có keyword cho khu vực này.</li>';
  $('#kw-list').onclick = (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) showKeyword(list[+li.dataset.i]);
  };

  // Keyword theo nền tảng
  $('#kw-platform').innerHTML = Object.entries(d.keywordsByPlatform || {})
    .filter(([, l]) => l.length)
    .map(([p, l]) => `<p class="small" style="margin:6px 0">${pdot(p)} ${l.slice(0, 6).map((k) => esc(k.keyword)).join(' · ')}</p>`)
    .join('') || '<p class="empty">Chưa có dữ liệu.</p>';
  if (d.ai?.emergingKeywords?.length) {
    $('#kw-platform').innerHTML += `<p class="small" style="margin-top:10px"><b>Keyword mới nổi (AI):</b> ${d.ai.emergingKeywords.map(esc).join(' · ')}</p>`;
  }
}

function showKeyword(k) {
  const samples = (k.samples || [])
    .map((s) => `<li>${pdot(s.platform)} <a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
  openModal(`<h2>${esc(k.keyword)}</h2>
    <p class="muted small">Điểm ${fmt(k.score)} · ${k.mentions} lần xuất hiện${k.reach ? ` · reach ~${fmt(k.reach)}` : ''}</p>
    <p><a href="https://www.google.com/search?q=${encodeURIComponent(k.keyword)}" target="_blank" rel="noopener">Tìm trên Google</a> ·
       <a href="https://trends.google.com/trends/explore?geo=VN&q=${encodeURIComponent(k.keyword.replace(/^#/, ''))}" target="_blank" rel="noopener">Google Trends</a> ·
       <a href="https://www.tiktok.com/search?q=${encodeURIComponent(k.keyword)}" target="_blank" rel="noopener">TikTok</a> ·
       <a href="https://www.instagram.com/explore/tags/${encodeURIComponent(k.keyword.replace(/[#\s]/g, ''))}/" target="_blank" rel="noopener">Instagram</a></p>
    ${samples ? `<h3>Nội dung tiêu biểu</h3><ul class="bullets">${samples}</ul>` : ''}`);
}

function renderKwChart(d) {
  const h = d.keywordHistory;
  const note = $('#kw-chart-note');
  charts.kw?.destroy();
  if (!h || h.dates.length < 2) {
    note.textContent = 'Biểu đồ diễn biến hiển thị khi có từ 2 ngày dữ liệu trở lên. Chọn "Tuần" hoặc "Tháng" để xem.';
    $('#kw-chart').parentElement.style.display = 'none';
    return;
  }
  $('#kw-chart').parentElement.style.display = '';
  note.textContent = d.daysWithData < h.dates.length ? `Hiện có ${d.daysWithData}/${h.dates.length} ngày dữ liệu. Biểu đồ sẽ đầy đủ dần theo thời gian.` : '';
  const palette = [cssVar('--text'), '#a8d62a', '#7c3aed', '#2563eb', '#e5484d', '#d9480f', '#0e7490', '#c27c00', '#15803d', '#6d6e64'];
  charts.kw = new Chart($('#kw-chart'), {
    type: 'line',
    data: {
      labels: h.dates.map(fmtDate),
      datasets: h.series.slice(0, 6).map((s, i) => ({ label: s.keyword, data: s.values, borderColor: palette[i], backgroundColor: palette[i], tension: 0.4, pointRadius: i === 0 ? 4 : 2, pointBackgroundColor: i === 0 ? '#c6f04e' : palette[i], pointBorderColor: palette[i], borderWidth: i === 0 ? 3 : 2 })),
    },
    options: chartOpts({ legend: true }),
  });
}

if (window.Chart) Chart.defaults.font.family = "'Be Vietnam Pro', system-ui, sans-serif";
function chartOpts({ legend = false } = {}) {
  const grid = cssVar('--border');
  const tick = cssVar('--muted');
  return {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: legend, position: 'bottom', labels: { color: tick, boxWidth: 10, font: { size: 11 } } } },
    scales: { x: { grid: { display: false }, ticks: { color: tick } }, y: { grid: { color: grid }, ticks: { color: tick }, beginAtZero: true } },
  };
}

function renderTrends(d) {
  const ai = d.ai;
  $('#ai-trends').innerHTML = ai?.trends?.length
    ? ai.trends
        .map(
          (t, i) => `<article class="card trend">
        <div class="trend-top"><span class="tile">${['✦', '◆', '●', '▲'][i % 4]}</span><span class="small rel-${esc((t.relevance || '').split(' ')[0])}">● Liên quan: ${esc(t.relevance || '')}</span></div>
        <div class="kw-meta">${(t.platforms || []).map((p) => `<span class="rtag">${esc(p)}</span>`).join('')} ${(t.regions || []).map((r) => `<span class="rtag">${esc(r)}</span>`).join('')}</div>
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.description)}</p>
        ${t.contentIdeas?.length ? `<ul class="ideas">${t.contentIdeas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${t.evidenceUrls?.length ? `<div class="links">${t.evidenceUrls.map((u, i) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">Nguồn ${i + 1} ↗</a>`).join('')}</div>` : ''}
      </article>`,
        )
        .join('')
    : '';

  const themes = d.themes || [];
  const max = Math.max(...themes.map((t) => t.score), 1);
  renderThemeRadar(themes);
  $('#themes').innerHTML = themes.length
    ? themes
        .map(
          (t, i) => `<div class="theme-row" data-i="${i}">
        <div><b>${esc(t.label)}</b></div>
        <div class="num">${fmt(t.score)} ${delta(t.change)}</div>
        <div class="kw-bar"><span style="width:${Math.max((t.score / max) * 100, 2)}%"></span></div>
      </div>`,
        )
        .join('')
    : '<p class="empty">Chưa có dữ liệu.</p>';
  $('#themes').onclick = (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const t = themes[+row.dataset.i];
    openModal(`<h2>${esc(t.label)}</h2>
      ${t.searchQueries.length ? `<h3 class="mt">Người dùng đang tìm</h3><p>${t.searchQueries.map((q) => `<span class="rtag">${esc(q)}</span>`).join(' ')}</p>` : ''}
      <h3 class="mt">Nội dung tiêu biểu</h3>
      <div class="posts">${t.evidence.map((it, i) => postCard(it, i)).join('') || '<p class="empty">Chưa có.</p>'}</div>`);
  };

  const needs = ai?.customerNeeds || [];
  $('#needs-card').hidden = !needs.length;
  $('#needs').innerHTML = needs.map((n) => `<li>${esc(n)}</li>`).join('');
}

function venueCard(it, i) {
  const m = it.metrics || {};
  const img = it.image
    ? `<img src="${safeUrl(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  const stars = it.rating ? `★ ${Number(it.rating).toFixed(1)}` : '';
  const price = typeof it.priceLevel === 'number' ? '$'.repeat(it.priceLevel) : it.priceLevel || '';
  return `<article class="post">
    <a class="thumb" href="${safeUrl(it.url)}" target="_blank" rel="noopener">${img || `<div class="noimg tile-${esc(it.platform)}">${PLATFORM[it.platform]?.icon || '•'}</div>`}<span class="rank">#${i + 1}</span></a>
    <div class="body">
      <a class="t" href="${safeUrl(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
      ${it.kind === 'deal' && it.venue ? `<div class="small muted">bởi ${esc(it.venue)}</div>` : ''}
      <div class="venue-meta">${stars ? `<span>${stars}</span>` : ''}${price ? `<span>${esc(price)}</span>` : ''}${m.reviews ? `<span>${fmt(m.reviews)} review</span>` : ''}${it.reviewsGrowth > 0 ? `<span class="up">+${it.reviewsGrowth} review</span>` : ''}</div>
      ${it.deal ? `<div class="venue-meta"><span class="deal">${esc(it.deal)}</span>${it.priceOrigin ? `<s>${esc(it.priceOrigin)}</s>` : ''}</div>` : ''}
      ${it.category && it.kind !== 'deal' ? `<div class="small muted">${esc(it.category)}</div>` : ''}
      ${it.rankingString ? `<div class="small muted">${esc(it.rankingString)}</div>` : ''}
      ${it.sections?.length ? `<div class="h">${it.sections.slice(0, 3).map(esc).join(' · ')}</div>` : ''}
      <div class="src"><span>${esc(it.address || it.source || '')}</span><span>${rtag(it.region)}</span></div>
    </div>
  </article>`;
}

function renderThemeRadar(themes) {
  charts.radar?.destroy();
  const list = themes.slice(0, 8);
  if (list.length < 3) return;
  const shortLabel = (l) => l.split(/[&,/]/)[0].trim();
  // Chuẩn hoá về thang 0–100 để chủ đề nhỏ vẫn thấy được hình dạng
  const max = Math.max(...list.map((t) => t.score), 1);
  const norm = (v) => Math.round(Math.sqrt(v / max) * 100);
  const prev = list.map((t) => (typeof t.change === 'number' ? t.score / (1 + t.change / 100) : t.change === 'new' ? 0 : null));
  const hasPrev = prev.some((v) => v != null);
  const text = cssVar('--text');
  document.querySelector('#theme-legend-prev').hidden = !hasPrev;
  charts.radar = new Chart($('#theme-radar'), {
    type: 'radar',
    data: {
      labels: list.map((t) => shortLabel(t.label)),
      datasets: [
        { label: 'Kỳ này', data: list.map((t) => norm(t.score)), backgroundColor: 'rgba(198,240,78,0.85)', borderColor: '#a8d62a', borderWidth: 1, pointRadius: 0 },
        ...(hasPrev ? [{ label: 'Kỳ trước', data: prev.map((v) => (v == null ? null : norm(v))), backgroundColor: 'transparent', borderColor: text, borderWidth: 1.5, pointRadius: 0 }] : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.datasetIndex === 0 ? list[c.dataIndex].score : prev[c.dataIndex] || 0)}` } } },
      scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: cssVar('--border') }, angleLines: { color: cssVar('--border') }, pointLabels: { color: cssVar('--muted'), font: { size: 12, family: 'Be Vietnam Pro' } } } },
    },
  });
}

function postCard(it, i) {
  if (it.kind === 'venue' || it.kind === 'deal') return venueCard(it, i);
  const m = it.metrics || {};
  const metrics = [
    m.views && `<span><b>${fmt(m.views)}</b> xem</span>`,
    m.likes && `<span><b>${fmt(m.likes)}</b> thích</span>`,
    m.comments && `<span><b>${fmt(m.comments)}</b> bình luận</span>`,
    m.shares && `<span><b>${fmt(m.shares)}</b> chia sẻ</span>`,
    !m.views && it.reach ? `<span>reach ~<b>${fmt(it.reach)}</b></span>` : '',
  ].filter(Boolean).join('');
  const img = it.image
    ? `<img src="${safeUrl(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg tile-${esc(it.platform)}',textContent:'${PLATFORM[it.platform]?.icon || '•'}'}))">`
    : `<div class="noimg tile-${esc(it.platform)}">${PLATFORM[it.platform]?.icon || '•'}</div>`;
  return `<article class="post">
    <a class="thumb" href="${safeUrl(it.url)}" target="_blank" rel="noopener">${img}<span class="rank">#${i + 1}</span></a>
    <div class="body">
      <a class="t" href="${safeUrl(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
      ${metrics ? `<div class="m">${metrics}</div>` : ''}
      ${it.hashtags?.length ? `<div class="h">${it.hashtags.slice(0, 5).map((h) => '#' + esc(h)).join(' ')}</div>` : ''}
      <div class="src"><span>${esc(it.author || it.source || '')}</span><span>${rtag(it.region)} ${fmtDate(it.publishedAt)}</span></div>
    </div>
  </article>`;
}

function renderPlatformTabs(d) {
  const P = d.platforms;
  const count = (p) => (p === 'google' ? P.google.queries.filter(inRegion).length : (P[p] || []).filter(inRegion).length);
  // Sắp tab theo tổng độ tiếp cận (google luôn đầu vì là nhu cầu chủ động)
  const order = Object.keys(PLATFORM).sort((a, b) => (a === 'google' ? -1 : b === 'google' ? 1 : (d.kpis.reachByPlatform[b] || 0) - (d.kpis.reachByPlatform[a] || 0)));
  $('#ptabs').innerHTML = order
    .map((p) => `<button class="tab ${p === state.platform ? 'on' : ''}" data-p="${p}">${tile(p, 'sm')}${PLATFORM[p].label}<span class="n">${count(p)}${d.kpis.reachByPlatform[p] ? ` · ${fmt(d.kpis.reachByPlatform[p])}` : ''}</span></button>`)
    .join('');
  $('#ptabs').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    state.platform = b.dataset.p;
    renderPlatformTabs(d);
  };
  renderPlatformContent(d);
}

function renderPlatformContent(d) {
  const p = state.platform;
  const P = d.platforms;
  const status = d.sourceStatus?.[p];
  if (p === 'google') {
    const qs = P.google.queries.filter(inRegion).slice(0, 30);
    $('#pcontent').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>Truy vấn người dùng đang tìm (Google Autocomplete)</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Truy vấn</th><th>KV</th><th>Ngày xuất hiện</th><th class="n">Chỉ số</th></tr></thead>
            <tbody>${qs.map((q, i) => `<tr><td>${i + 1}</td><td><a href="https://www.google.com/search?q=${encodeURIComponent(q.query)}" target="_blank" rel="noopener">${esc(q.query)}</a></td><td>${rtag(q.region)}</td><td>${q.days}</td><td class="n">${q.interest}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div>
          <div class="card">
            <h3>Google Trends Việt Nam (lượng tìm kiếm ước tính)</h3>
            <div class="table-wrap"><table><tbody>
              ${P.google.trending.slice(0, 15).map((t, i) => `<tr><td>${i + 1}</td><td><a href="${safeUrl(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>${t.relevant ? ' <span class="rtag" style="color:var(--accent)">liên quan</span>' : ''}
                ${t.news?.[0] ? `<div class="small muted"><a href="${safeUrl(t.news[0].url)}" target="_blank" rel="noopener">${esc(t.news[0].title)}</a> · ${esc(t.news[0].source)}</div>` : ''}</td><td class="n">${esc(t.trafficLabel)}</td></tr>`).join('')}
            </tbody></table></div>
            <p class="small muted">Trending chung của cả nước. Dùng để bắt các sự kiện văn hoá, thể thao, giải trí có thể làm content "đu trend".</p>
          </div>
          ${P.google.trendingSea.length ? `<div class="card"><h3>Trending liên quan tại Đông Nam Á</h3><ul class="bullets">${P.google.trendingSea.map((t) => `<li><a href="${safeUrl(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a> <span class="rtag">${esc(t.geo)}</span> ${esc(t.trafficLabel)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>`;
    return;
  }
  const list = (P[p] || []).filter(inRegion);
  const note = status && !/^OK/.test(status) ? `<p class="card small">⚠️ ${esc(PLATFORM[p].label)}: ${esc(status)}. Xem hướng dẫn cấu hình trong README.</p>` : '';
  $('#pcontent').innerHTML = note + (list.length ? `<div class="posts">${list.map((it, i) => postCard(it, i)).join('')}</div>` : '<p class="empty card">Chưa có nội dung cho bộ lọc này.</p>');
}

function renderWeather(d) {
  const w = d.weather;
  const today = state.meta?.latestDate || d.to;
  $('#wx-strip').innerHTML = (w.days || [])
    .map(
      (x) => `<div class="wx-day ${x.date === today ? 'today' : x.date < today ? 'past' : ''}" title="${esc(x.label)}">
      <div>${x.date === today ? 'Hôm nay' : fmtDate(x.date)}</div>
      <div class="ic">${WX_ICON(x.code)}</div>
      <div class="tt">${Math.round(x.tMax)}° / ${Math.round(x.tMin)}°</div>
      <div class="muted">${x.rain} mm${x.rainProb != null ? ` · ${x.rainProb}%` : ''}</div>
      <div class="muted">tối: ${x.eveningRain} mm</div>
    </div>`,
    )
    .join('');
  charts.wx?.destroy();
  charts.wx = new Chart($('#wx-chart'), {
    data: {
      labels: w.days.map((x) => fmtDate(x.date)),
      datasets: [
        { type: 'bar', label: 'Mưa buổi tối 17–23h (mm)', data: w.days.map((x) => x.eveningRain), backgroundColor: '#c6f04e', borderRadius: 8, yAxisID: 'y' },
        { type: 'line', label: 'Cảm giác nóng max (°C)', data: w.days.map((x) => x.feelsMax), borderColor: cssVar('--text'), backgroundColor: cssVar('--text'), yAxisID: 'y1', tension: 0.4, pointRadius: 3, borderWidth: 2.5 },
      ],
    },
    options: (() => {
      const o = chartOpts({ legend: true });
      o.scales.y1 = { position: 'right', grid: { display: false }, ticks: { color: cssVar('--muted') } };
      return o;
    })(),
  });
  const aiW = d.ai?.weatherInsights || [];
  const cards = [
    ...aiW.map((x) => ({ tag: 'AI', ...x })),
    ...(aiW.length ? [] : w.insights || []),
  ];
  $('#wx-insights').innerHTML = cards
    .map(
      (x) => `<article class="card trend"><div class="trend-top"><span class="tile">${/mưa/i.test(x.title + x.tag) ? '🌧' : /nóng|nắng/i.test(x.title + x.tag) ? '☀' : '⛅'}</span><span class="rtag">${esc(x.tag || 'Thời tiết')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.detail)}</p>
      ${x.ideas?.length ? `<ul class="ideas">${x.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</article>`,
    )
    .join('');
}

function renderIdeas(d) {
  const ideas = d.ai?.contentIdeas || [];
  $('#ideas').innerHTML = ideas.length
    ? ideas
        .map(
          (x, i) => `<article class="card trend">
        <div class="trend-top"><span class="tile">💡</span><div class="kw-meta"><span class="rtag">${esc(x.platform)}</span><span class="rtag">${esc(x.format)}</span></div></div>
        <h3>“${esc(x.hook)}”</h3><p>${esc(x.idea)}</p>
        ${x.keywords?.length ? `<div class="h small" style="color:var(--accent)">${x.keywords.map(esc).join(' · ')}</div>` : ''}
      </article>`,
        )
        .join('')
    : '<p class="empty card">Ý tưởng content được AI tạo khi bật một provider AI (xem README). Trong lúc chờ, hãy dùng Top 10 keyword, chủ đề nóng và insight thời tiết ở trên để lên ý tưởng.</p>';
}

// ---------- Phân khúc ----------
function renderSegments(d) {
  const segs = d.segments || [];
  $('#s-segments').hidden = !segs.length;
  const ai = new Map((d.ai?.segmentInsights || []).map((x) => [x.segment, x]));
  $('#segments').innerHTML = segs
    .map((g) => {
      const a = ai.get(g.id);
      return `<article class="card segcard t-${esc(g.tone || 'violet')}">
      <div class="head">
        <div class="row"><h3>${esc(g.icon)} ${esc(g.label)}</h3>${delta(g.change)}</div>
        <div class="score">${fmt(g.score)}<small>điểm sức nóng</small></div>
        <div class="stats"><div><b>${fmt(g.socialPosts)}</b>bài social</div><div><b>${g.reach ? fmt(g.reach) : '—'}</b>reach</div><div><b>${fmt(g.venues)}</b>địa điểm</div></div>
      </div>
      <div class="bodyx">
        ${a ? `<div class="headline">💡 ${esc(a.headline)}</div>` : ''}
        ${g.searches?.length ? `<div><div class="lbl">Khách đang tìm</div><div class="tags">${g.searches.slice(0, 6).map((q) => `<span class="tagpill">${esc(q)}</span>`).join('')}</div></div>` : ''}
        ${g.keywords?.length ? `<div><div class="lbl">Keyword nổi bật</div><div class="tags">${g.keywords.slice(0, 6).map((k) => `<span class="tagpill accent">${esc(k.keyword)}</span>`).join('')}</div></div>` : ''}
        ${g.hashtags?.length ? `<div><div class="lbl">Hashtag</div><div class="tags">${g.hashtags.slice(0, 6).map((h) => `<span class="tagpill">#${esc(h.tag)}</span>`).join('')}</div></div>` : ''}
        ${a?.needs?.length ? `<div><div class="lbl">Nhu cầu</div><ul>${a.needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        ${a?.contentIdeas?.length ? `<div><div class="lbl">Ý tưởng content</div><ul>${a.contentIdeas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        ${g.top?.length ? `<div class="tops"><div class="lbl">Nội dung top</div>${g.top.map((t) => `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener" title="${esc(t.title)}">${esc(t.title)}<span>${esc(PLATFORM[t.platform]?.label || t.platform)}${t.reach ? ` · ${fmt(t.reach)}` : ''}</span></a>`).join('')}</div>` : ''}
        ${g.topVenues?.length ? `<div class="tops"><div class="lbl">Địa điểm nổi bật</div>${g.topVenues.map((t) => `<a href="${safeUrl(t.url)}" target="_blank" rel="noopener" title="${esc(t.title)}">${esc(t.title)}<span>${esc(PLATFORM[t.platform]?.label || '')}${t.rating ? ` · ★${Number(t.rating).toFixed(1)}` : ''}</span></a>`).join('')}</div>` : ''}
      </div>
    </article>`;
    })
    .join('');
}

// ---------- Xu hướng chung ----------
const CAT_TONE = { sport: 'mint', music: 'violet', film: 'pink', tech: 'blue', finance: 'yellow', weather: 'blue', event: 'peach', food: 'peach', health: 'pink', society: 'yellow', other: 'violet' };
const catTile = (it, no) => `<span class="tile tile-${CAT_TONE[it.category] || 'violet'}">${esc(it.categoryIcon || '✨')}${no ? `<span class="no">${no}</span>` : ''}</span>`;
function renderGeneral(d) {
  const G = d.general;
  if (!G) {
    $('#s-general').hidden = true;
    return;
  }
  $('#s-general').hidden = false;
  const ai = d.ai || {};
  const cats = G.categories || [];
  $('#gen-summary').innerHTML = `
    <span class="tag">${ai.generalSummary ? 'Tóm tắt AI' : 'Tóm tắt tự động'}</span>
    <p>${esc(ai.generalSummary || `Lĩnh vực được quan tâm nhiều nhất: ${cats.slice(0, 3).map((c) => c.label).join(', ') || '—'}. Top tìm kiếm: ${(G.searchesVN || []).slice(0, 3).map((t) => t.title).join(', ') || '—'}.`)}</p>
    <div>${cats.slice(0, 6).map((c) => `<span class="cat-chip">${esc(c.icon)} ${esc(c.label)}</span>`).join('')}</div>`;
  const max = Math.max(...cats.filter((c) => c.id !== 'other').map((c) => c.score), 1);
  $('#gen-cats').innerHTML = cats
    .map((c) => `<div class="cat-row" data-c="${esc(c.id)}"><span class="tile tile-${CAT_TONE[c.id] || 'violet'}">${esc(c.icon)}</span><div>${esc(c.label)}<div class="kw-bar"><span style="width:${Math.min((c.score / max) * 100, 100)}%"></span></div></div><div class="num">${fmt(c.score)}</div></div>`)
    .join('') || '<p class="empty">Chưa có dữ liệu.</p>';
  $('#gen-cats').onclick = (e) => {
    const r = e.target.closest('[data-c]');
    if (!r) return;
    state.genCat = r.dataset.c;
    renderGeneral(d);
    $('#gen-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const opps = ai.trendOpportunities || [];
  const riskCls = { 'an toàn': 'safe', 'cân nhắc': 'warn', tránh: 'avoid' };
  $('#gen-opps').innerHTML = opps.length
    ? opps
        .map((o) => `<article class="card trend opp ${riskCls[o.risk] === 'avoid' ? 'avoid' : ''}">
        <div class="trend-top"><span class="tile">🔥</span><span class="risk ${riskCls[o.risk] || 'warn'}">${esc(o.risk)}</span></div>
        <div class="kw-meta"><span class="rtag">${esc(o.category)}</span><span class="rtag">⏱ ${esc(o.timing)}</span></div>
        <h3>${esc(o.trend)}</h3>
        <p class="muted small">${esc(o.why)}</p>
        <div class="angle"><b>Cách đu trend:</b> ${esc(o.angle)}</div>
        <div class="tags"><span class="tagpill">${esc(o.format)}</span></div>
      </article>`)
        .join('')
    : '<p class="empty card">Bật AI để có gợi ý cách lồng các trend chung vào content F&B/nightlife.</p>';

  const used = new Set([...(G.searchesVN || []), ...(G.youtube || []), ...(G.news || []), ...(G.searchesSEA || [])].map((x) => x.category));
  $('#gen-filter').innerHTML = [['all', '✨', 'Tất cả lĩnh vực'], ...Object.entries(G.categoryMeta || {}).filter(([id]) => used.has(id)).map(([id, c]) => [id, c.icon, c.label])]
    .map(([id, ic, l]) => `<button class="chip ${id === state.genCat ? 'on' : ''}" data-c="${esc(id)}">${esc(ic)} ${esc(l)}</button>`)
    .join('');
  $('#gen-filter').onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    state.genCat = b.dataset.c;
    renderGeneral(d);
  };
  const tabs = [
    ['vn', 'G', 'Google Trends VN', G.searchesVN],
    ['yt', '▶', 'YouTube Thịnh hành', G.youtube],
    ['news', '📰', 'Tin nổi bật', G.news],
    ['sea', '🌏', 'Đông Nam Á', G.searchesSEA],
  ];
  const inCat = (x) => state.genCat === 'all' || x.category === state.genCat;
  $('#gen-tabs').innerHTML = tabs
    .map(([id, ic, l, list]) => `<button class="tab ${id === state.genTab ? 'on' : ''}" data-t="${id}"><span class="tile sm tile-${{ vn: 'blue', yt: 'pink', news: 'yellow', sea: 'mint' }[id]}">${ic}</span>${l}<span class="n">${(list || []).filter(inCat).length}</span></button>`)
    .join('');
  $('#gen-tabs').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    state.genTab = b.dataset.t;
    renderGeneral(d);
  };
  const list = (tabs.find((t) => t[0] === state.genTab)?.[3] || []).filter(inCat);
  const sens = (x) => (x.sensitive ? '<span class="badge-sens">Nhạy cảm · không đu trend</span>' : '');
  let html;
  if (!list.length) html = '<p class="empty card">Không có mục nào cho bộ lọc này.</p>';
  else if (state.genTab === 'yt')
    html = `<div class="posts">${list
      .slice(0, 24)
      .map((v) => `<article class="post">
        <a class="thumb" href="${safeUrl(v.url)}" target="_blank" rel="noopener">${v.image ? `<img src="${safeUrl(v.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="rank">#${v.bestRank}</span></a>
        <div class="body">
          <a class="t" href="${safeUrl(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
          <div class="m"><span><b>${fmt(v.views)}</b> xem</span><span><b>${fmt(v.likes)}</b> thích</span>${v.days > 1 ? `<span>${v.days} ngày trong top</span>` : ''}</div>
          <div class="kw-meta"><span class="rtag">${esc(v.categoryIcon)} ${esc(v.categoryLabel)}</span>${sens(v)}</div>
          <div class="src"><span>${esc(v.channel)}</span><span>${fmtDate(v.publishedAt)}</span></div>
        </div></article>`)
      .join('')}</div>`;
  else if (state.genTab === 'news')
    html = `<div class="card"><ol class="gen-list">${list
      .slice(0, 40)
      .map((n, i) => `<li>${catTile(n, i + 1)}<div><a class="t" href="${safeUrl(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="sub">${esc(n.text || '')}</div><div class="kw-meta" style="margin-top:6px"><span class="rtag">${esc(n.categoryLabel)}</span><span class="rtag">${esc(n.source)}</span>${sens(n)}</div></div><div class="val">${fmtDate(n.publishedAt)}</div></li>`)
      .join('')}</ol></div>`;
  else
    html = `<div class="card"><ol class="gen-list">${list
      .slice(0, 40)
      .map((t, i) => `<li>${catTile(t, i + 1)}<div><a class="t" href="${safeUrl(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a> ${t.isNew ? '<span class="badge-new">MỚI</span>' : ''} ${sens(t)}
          <div class="sub">${(t.news || []).slice(0, 2).map((n) => `<a href="${safeUrl(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> · ${esc(n.source || '')}`).join('<br>')}</div>
          <div class="kw-meta" style="margin-top:6px"><span class="rtag">${esc(t.categoryLabel)}</span>${t.geo && t.geo !== 'VN' ? `<span class="rtag">${esc(t.geo)}</span>` : ''}${t.days > 1 ? `<span class="rtag">${t.days} ngày</span>` : ''}</div></div>
          <div class="val">${esc(t.trafficLabel || fmt(t.traffic))}<small>lượt tìm</small></div></li>`)
      .join('')}</ol></div>`;
  $('#gen-content').innerHTML = html;
}

// ---------- Actions ----------
const doneKey = (d, a) => `done:${d.to}:${a.title}`;
function isDone(d, a) { try { return localStorage.getItem(doneKey(d, a)) === '1'; } catch { return false; } }
function renderActions(d) {
  $('#events').innerHTML = (d.upcomingEvents || [])
    .map((e, i) => `<span class="event"><span class="tile tile-${TILE_TONES[i % TILE_TONES.length]}">📅</span>${esc(e.name)} <b>${e.daysLeft === 0 ? 'hôm nay' : `còn ${e.daysLeft} ngày`}</b></span>`)
    .join('');
  const ai = (d.ai?.actions || []).map((a, i) => ({ ...a, source: 'ai', id: `ai${i}` }));
  const rule = d.actions || [];
  const list = state.actionSrc === 'ai' ? ai : state.actionSrc === 'rule' ? rule : [...ai, ...rule];
  const order = { cao: 0, 'trung bình': 1, thấp: 2 };
  list.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  $('#actions').innerHTML = list.length
    ? list
        .map((a) => {
          const pcls = (a.priority || '').split(' ')[0];
          return `<article class="card action p-${esc(pcls)} ${isDone(d, a) ? 'done' : ''}" data-id="${esc(a.id)}">
        <div class="kw-meta"><span class="prio ${esc(pcls)}">${esc(a.priority)}</span><span class="rtag">${esc(a.team || '')}</span><span class="rtag">⏱ ${esc(a.timeline || '')}</span>${a.source === 'ai' ? '<span class="src-ai">AI</span>' : ''}</div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.detail)}</p>
        ${a.platforms?.length ? `<div class="tags">${a.platforms.map((p) => `<span class="tagpill">${esc(p)}</span>`).join('')}</div>` : ''}
        ${a.kpi ? `<div class="kpi">🎯 KPI: ${esc(a.kpi)}</div>` : ''}
        ${a.evidence?.length ? `<div class="links small">${a.evidence.map((u, i) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">Nguồn ${i + 1} ↗</a>`).join(' ')}</div>` : ''}
        <label><input type="checkbox" ${isDone(d, a) ? 'checked' : ''}> Đã xử lý (lưu trên máy này)</label>
      </article>`;
        })
        .join('')
    : `<p class="empty card">${state.actionSrc === 'ai' ? 'Chưa có action từ AI cho kỳ này.' : 'Chưa có đề xuất.'}</p>`;
  $('#actions').onchange = (e) => {
    const card = e.target.closest('.action');
    const a = list.find((x) => x.id === card?.dataset.id);
    if (!a) return;
    try { e.target.checked ? localStorage.setItem(doneKey(d, a), '1') : localStorage.removeItem(doneKey(d, a)); } catch {}
    card.classList.toggle('done', e.target.checked);
  };
}

// ---------- Xu hướng từng nền tảng ----------
function miniBars(rows, valueKey = 'score', labelKey = 'label') {
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
  return rows
    .map((r) => `<div class="mini-row"><div>${esc(r[labelKey])}<div class="kw-bar"><span style="width:${((r[valueKey] || 0) / max) * 100}%"></span></div></div><div class="num">${fmt(r[valueKey])} ${delta(r.change)}</div></div>`)
    .join('');
}
function renderPlatformTrends(d) {
  const pt = d.platformTrends || {};
  const order = Object.keys(PLATFORM).filter((p) => pt[p]);
  const missing = Object.keys(PLATFORM).filter((p) => !pt[p]);
  if (!state.ptPlatform || !pt[state.ptPlatform]) state.ptPlatform = order.find((p) => p !== 'google') || order[0];
  $('#pt-tabs').innerHTML =
    order.map((p) => `<button class="tab ${p === state.ptPlatform ? 'on' : ''}" data-p="${p}">${tile(p, 'sm')}${PLATFORM[p].label}<span class="n">${pt[p].items || ''}</span></button>`).join('') +
    missing.map((p) => `<button class="tab off" data-p="${p}">${tile(p, 'sm')}${PLATFORM[p].label}</button>`).join('');
  $('#pt-tabs').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    state.ptPlatform = b.dataset.p;
    renderPlatformTrends(d);
  };
  const p = state.ptPlatform;
  const t = pt[p];
  if (!t) {
    const st = d.sourceStatus?.[p];
    $('#pt-content').innerHTML = `<p class="card empty">Chưa có dữ liệu ${esc(PLATFORM[p].label)}${st ? ` (${esc(st)})` : ''}. ${VENUE.includes(p) || ['tiktok', 'facebook', 'instagram', 'threads'].includes(p) ? 'Thêm APIFY_TOKEN vào GitHub Secrets để bật nguồn này.' : ''}</p>`;
    return;
  }
  const ai = (d.ai?.platformTrends || []).find((x) => x.platform === p);
  const tags = (d.hashtags?.byPlatform?.[p] || []).slice(0, 15);
  const isVenue = VENUE.includes(p);
  const cards = [];
  cards.push(`<div class="card">
    ${ai ? `<p class="pt-headline">${esc(ai.headline)}</p>` : ''}
    <div class="stat-row">
      <div><b>${fmt(t.items)}</b>${isVenue ? 'địa điểm/deal' : 'nội dung'}</div>
      ${t.avgReach ? `<div><b>${fmt(t.avgReach)}</b>reach TB/bài</div>` : ''}
      ${t.avgEngagement ? `<div><b>${fmt(t.avgEngagement)}</b>tương tác TB/bài</div>` : ''}
      ${t.avgRating ? `<div><b>★ ${t.avgRating}</b>rating TB</div>` : ''}
    </div>
    ${ai?.trends?.length ? `<h3>Xu hướng (AI)</h3><ul class="bullets small">${ai.trends.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${ai?.formats?.length ? `<h3 class="mt">Định dạng hiệu quả</h3><div class="tags">${ai.formats.map((x) => `<span class="tagpill">${esc(x)}</span>`).join('')}</div>` : ''}
    ${!ai ? '<p class="muted small">Bật AI để có tóm tắt xu hướng riêng của nền tảng này.</p>' : ''}
  </div>`);
  if (t.themes?.length) cards.push(`<div class="card"><h3>Chủ đề trên ${esc(PLATFORM[p].label)}</h3>${miniBars(t.themes)}</div>`);
  if (t.keywords?.length || tags.length || ai?.hashtags?.length)
    cards.push(`<div class="card">
      ${t.keywords?.length ? `<h3>Keyword nổi bật</h3><div class="tags">${t.keywords.map((k) => `<span class="tagpill">${esc(k)}</span>`).join('')}</div>` : ''}
      ${tags.length ? `<h3 class="mt">Hashtag dùng nhiều</h3><div class="tags">${tags.map((h) => `<span class="tagpill">#${esc(h.tag)} · ${h.posts}</span>`).join('')}</div>` : ''}
      ${ai?.hashtags?.length ? `<h3 class="mt">Hashtag AI gợi ý</h3><div class="tags">${ai.hashtags.map((h) => `<span class="tagpill accent">${esc(h.startsWith('#') ? h : '#' + h)}</span>`).join('')}</div>` : ''}
    </div>`);
  if (isVenue) {
    if (t.categories?.length) cards.push(`<div class="card"><h3>Loại hình đang được đẩy</h3>${miniBars(t.categories, 'n', 'name')}</div>`);
    if (t.dealTypes?.length) cards.push(`<div class="card"><h3>Dạng ưu đãi phổ biến</h3>${miniBars(t.dealTypes, 'n', 'name')}</div>`);
  }
  let html = `<div class="pt-grid">${cards.join('')}</div>`;
  if (isVenue) {
    if (t.rising?.length) html += `<h3 class="mt">Địa điểm đang tăng review nhanh</h3><div class="posts">${t.rising.map(venueCard).join('')}</div>`;
    if (t.newVenues?.length) html += `<h3 class="mt">Địa điểm mới xuất hiện trong kỳ</h3><div class="posts">${t.newVenues.map(venueCard).join('')}</div>`;
    else if (t.newSinceNote) html += `<p class="muted small mt">${esc(t.newSinceNote)}.</p>`;
    if (t.deals?.length) html += `<h3 class="mt">Deal đang được đẩy</h3><div class="posts">${t.deals.map(venueCard).join('')}</div>`;
  } else if (t.themes?.[0]?.evidence?.length) {
    html += `<h3 class="mt">Nội dung tiêu biểu cho chủ đề "${esc(t.themes[0].label)}"</h3><div class="posts">${t.themes[0].evidence.map(postCard).join('')}</div>`;
  }
  $('#pt-content').innerHTML = html;
}

// ---------- Hashtag ----------
function currentHashtags(d) {
  const H = d.hashtags || { top: [] };
  return state.htPlatform === 'all' ? H.top : H.top.filter((h) => h.platforms[state.htPlatform]);
}
function renderHashtags(d) {
  const H = d.hashtags || { top: [], byPlatform: {}, suggested: [] };
  const plats = ['all', ...Object.keys(H.byPlatform || {}).filter((p) => H.byPlatform[p].length)];
  $('#ht-filter').innerHTML = plats.map((p) => `<button class="chip ${p === state.htPlatform ? 'on' : ''}" data-p="${p}">${p === 'all' ? 'Tất cả nền tảng' : PLATFORM[p].label}</button>`).join('');
  $('#ht-filter').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    state.htPlatform = b.dataset.p;
    renderHashtags(d);
  };
  const list = currentHashtags(d).filter((h) => state.region === 'all' || h.regions[state.region]);
  $('#ht-table').innerHTML = list.length
    ? `<table><thead><tr><th>#</th><th>Hashtag</th><th class="n">Bài</th><th class="n">Reach TB</th><th class="n">Tổng reach</th><th>Nền tảng</th></tr></thead><tbody>${list
        .slice(0, 40)
        .map((h, i) => `<tr><td>${i + 1}</td><td><b>#${esc(h.tag)}</b> ${delta(h.change)}${h.topPost ? `<div class="small"><a href="${safeUrl(h.topPost.url)}" target="_blank" rel="noopener">Bài top ↗</a></div>` : ''}</td><td class="n">${h.posts}</td><td class="n">${fmt(h.avgReach)}</td><td class="n">${fmt(h.reach)}</td><td>${Object.keys(h.platforms).map(pdot).join(' ')}</td></tr>`)
        .join('')}</tbody></table>`
    : `<p class="empty">Chưa có dữ liệu hashtag. Hashtag được lấy từ TikTok, Instagram, Facebook, Threads (Apify) và YouTube (YouTube API key)${d.sourceStatus?.tiktok ? `. Trạng thái TikTok: ${esc(d.sourceStatus.tiktok)}` : ''}.</p>`;
  const sug = state.htPlatform === 'all' ? H.suggested || [] : (H.byPlatform[state.htPlatform] || []).slice(0, 10).map((h) => h.tag);
  const aiSug = state.htPlatform === 'all' ? [] : ((d.ai?.platformTrends || []).find((x) => x.platform === state.htPlatform)?.hashtags || []).map((h) => h.replace(/^#/, ''));
  const set = [...new Set([...sug, ...aiSug])];
  $('#ht-suggest').innerHTML = `
    ${set.length ? `<div class="copy-box" id="ht-set">${set.map((t) => '#' + esc(t)).join(' ')}</div><button class="btn" id="ht-copy">Sao chép bộ hashtag</button>` : '<p class="empty">Chưa đủ dữ liệu để gợi ý.</p>'}
    ${d.ai?.hashtagStrategy ? `<p class="small" style="margin-top:12px">💡 ${esc(d.ai.hashtagStrategy)}</p>` : ''}`;
  const copy = $('#ht-copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText($('#ht-set').textContent); copy.textContent = 'Đã sao chép ✓'; } catch { copy.textContent = 'Không sao chép được, hãy bôi đen để copy'; }
  };
  const max = Math.max(...list.map((h) => h.score), 1);
  $('#ht-cloud').innerHTML = list.length
    ? list.slice(0, 50).map((h) => `<a href="https://www.tiktok.com/tag/${encodeURIComponent(h.tag)}" target="_blank" rel="noopener" style="font-size:${12 + (h.score / max) * 16}px">#${esc(h.tag)}</a>`).join('')
    : '<p class="empty">—</p>';
}
function downloadHashtagCsv(d) {
  const rows = [['Hạng', 'Hashtag', 'Số bài', 'Reach TB', 'Tổng reach', 'Tương tác', 'Thay đổi', 'Nền tảng', 'Bài top']];
  currentHashtags(d).forEach((h, i) => rows.push([i + 1, '#' + h.tag, h.posts, h.avgReach, h.reach, h.engagement, h.change ?? '', Object.keys(h.platforms).join('|'), h.topPost?.url || '']));
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `hashtags-${d.period}-${d.to}.csv` }).click();
}

function renderStatus(d) {
  const s = d.sourceStatus || {};
  const names = { googleTrends: 'Google Trends', googleAutocomplete: 'Google Autocomplete', googleNews: 'Google News', rss: 'RSS báo', youtube: 'YouTube', weather: 'Thời tiết', pasgo: 'PasGo', youtubeTrending: 'YouTube Thịnh hành', generalNews: 'Tin nổi bật (chung)', tiktok: 'TikTok (Apify)', instagram: 'Instagram (Apify)', facebook: 'Facebook (Apify)', threads: 'Threads (Apify)', googlemaps: 'Google Maps (Apify)', tripadvisor: 'Tripadvisor (Apify)' };
  $('#status').innerHTML = Object.entries(names)
    .map(([k, n]) => {
      const v = s[k] || '—';
      const cls = /^OK|đã crawl/.test(v) ? 'ok' : /Lỗi/.test(v) ? 'err' : 'off';
      return `<div class="st ${cls}"><span class="d"></span><div><b>${n}</b><br><span class="muted">${esc(v)}</span></div></div>`;
    })
    .join('') + `<div class="st ${state.meta?.ai?.provider !== 'none' ? 'ok' : 'off'}"><span class="d"></span><div><b>AI insight</b><br><span class="muted">${esc(state.meta?.ai?.provider === 'none' ? 'Đang tắt' : `${state.meta?.ai?.provider} / ${state.meta?.ai?.model}`)}</span></div></div>`;
}

function renderRegions(d) {
  const regs = { all: 'Tất cả khu vực', ...d.regions };
  $('#regions').innerHTML = Object.entries(regs)
    .map(([k, v]) => `<button class="chip ${k === state.region ? 'on' : ''}" data-r="${k}">${esc(v)}${k === 'q1q2' ? ' ★' : ''}</button>`)
    .join('');
}

function downloadCsv(d) {
  const rows = [['Hạng', 'Keyword', 'Điểm', 'Thay đổi', 'Số lần xuất hiện', 'Reach ước tính', 'Nền tảng', 'Khu vực', 'Insight AI']];
  const insights = new Map((d.ai?.keywordInsights || []).map((k) => [k.keyword.toLowerCase(), k.insight]));
  (state.region === 'all' ? d.topKeywords : d.keywordsByRegion[state.region] || []).forEach((k, i) =>
    rows.push([i + 1, k.keyword, k.score, k.change ?? '', k.mentions, k.reach, Object.keys(k.platforms).join('|'), Object.keys(k.regions).join('|'), insights.get(k.keyword.toLowerCase()) || '']),
  );
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `keywords-${d.period}-${state.region}-${d.to}.csv` });
  a.click();
}

function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').showModal();
}

async function render() {
  let d;
  try {
    d = await load(state.period);
  } catch (e) {
    $('#ai-summary').innerHTML = `<p class="empty">Chưa có dữ liệu. Chạy <code>npm run collect</code> hoặc chờ GitHub Actions chạy lần đầu. (${esc(e.message)})</p>`;
    return;
  }
  renderRegions(d);
  renderKpis(d);
  renderAiSummary(d);
  renderKeywords(d);
  renderKwChart(d);
  renderTrends(d);
  renderActions(d);
  renderSegments(d);
  renderGeneral(d);
  renderPlatformTrends(d);
  renderHashtags(d);
  renderPlatformTabs(d);
  renderWeather(d);
  renderIdeas(d);
  renderStatus(d);
}

// ---------- init ----------
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch {}
  if (t) document.documentElement.dataset.theme = t;
  $('#theme').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    render();
  };
}

$('#period').onclick = (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.period = b.dataset.v;
  [...$('#period').children].forEach((x) => x.classList.toggle('on', x === b));
  render();
};
$('#regions').onclick = (e) => {
  const b = e.target.closest('[data-r]');
  if (!b) return;
  state.region = b.dataset.r;
  render();
};
$('#ht-csv').onclick = () => state.data[state.period] && downloadHashtagCsv(state.data[state.period]);
$('#action-src').onclick = (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.actionSrc = b.dataset.v;
  [...$('#action-src').children].forEach((x) => x.classList.toggle('on', x === b));
  renderActions(state.data[state.period]);
};
$('#csv').onclick = () => state.data[state.period] && downloadCsv(state.data[state.period]);
$('#modal-close').onclick = () => $('#modal').close();
$('#modal').addEventListener('click', (e) => e.target.id === 'modal' && $('#modal').close());

initTheme();
// ---------- Trang riêng cho từng section (hash router #/trang) ----------
const PAGES = [...document.querySelectorAll('main > section')].map((el) => ({
  slug: el.id.replace(/^s-/, ''),
  el,
  no: el.querySelector('.sec-no')?.textContent || '',
  title: el.querySelector('.sec-title h2')?.textContent || '',
  sub: el.querySelector('.sec-title p')?.textContent || '',
  icon: el.querySelector('.sec-ic use')?.getAttribute('href') || '#i-home',
}));
function renderShortcuts() {
  $('#shortcuts').innerHTML = PAGES.filter((p) => p.slug !== 'summary')
    .map((p) => `<a class="shortcut" href="#/${p.slug}"><span class="sec-ic"><svg><use href="${p.icon}"/></svg></span><div><span class="sc-no">${esc(p.no)}</span><b>${esc(p.title)}</b><small>${esc(p.sub)}</small></div><span class="sc-go">→</span></a>`)
    .join('');
}
function route() {
  const raw = location.hash.replace(/^#\/?/, '').replace(/^s-/, '');
  const page = PAGES.find((p) => p.slug === raw) || PAGES[0];
  PAGES.forEach((p) => p.el.classList.toggle('page-off', p !== page));
  document.querySelectorAll('.side-nav a, .side-bottom a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${page.slug}`));
  document.title = page.slug === 'summary' ? 'LLG Trend Radar' : `${page.title} · Trend Radar`;
  const i = PAGES.indexOf(page);
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  $('#pager').innerHTML = `${prev ? `<a class="btn" href="#/${prev.slug}">← ${esc(prev.title)}</a>` : '<span></span>'}<span class="muted small">Trang ${i + 1}/${PAGES.length}</span>${next ? `<a class="btn pill" href="#/${next.slug}">${esc(next.title)} →</a>` : '<span></span>'}`;
  window.scrollTo({ top: 0 });
  // Biểu đồ vẽ lúc đang ẩn → cập nhật kích thước khi trang hiện ra
  requestAnimationFrame(() => Object.values(charts).forEach((c) => c?.resize?.()));
}
window.addEventListener('hashchange', route);
renderShortcuts();
route();

// ---------- Tooltip nhãn cho icon sidebar ----------
const tip = Object.assign(document.createElement('div'), { id: 'navtip', role: 'tooltip' });
document.body.append(tip);
document.querySelectorAll('.sidebar [data-tip]').forEach((el) => {
  const show = () => {
    if (matchMedia('(max-width: 760px)').matches) return;
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${r.right + 14}px`;
    tip.classList.add('show');
  };
  const hide = () => tip.classList.remove('show');
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('mouseleave', hide);
  el.addEventListener('blur', hide);
  el.addEventListener('click', hide);
});

fetch('data/meta.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => {
    state.meta = m;
    if (m) $('#updated').textContent = `Cập nhật: ${new Date(m.lastUpdated).toLocaleString('vi-VN')} · Dữ liệu tới ngày ${m.latestDate}`;
  })
  .finally(render);
