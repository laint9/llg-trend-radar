// Nền tảng đặt bàn / review địa điểm: PasGo (lấy trực tiếp) + chuẩn hoá dữ liệu địa điểm từ Apify (Google Maps, Tripadvisor).
import { fetchText, hash, pool, log } from '../lib/util.mjs';

const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
'agrave:à aacute:á acirc:â atilde:ã egrave:è eacute:é ecirc:ê igrave:ì iacute:í ograve:ò oacute:ó ocirc:ô otilde:õ ugrave:ù uacute:ú yacute:ý'
  .split(' ')
  .forEach((p) => {
    const [k, v] = p.split(':');
    NAMED[k] = v;
    NAMED[k[0].toUpperCase() + k.slice(1)] = v.toUpperCase();
  });
const decodeOnce = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, k) => NAMED[k] ?? m);
const decode = (s) => decodeOnce(decodeOnce(String(s || '')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Tách HTML thành các khối bắt đầu bằng marker (giới hạn 6KB/khối). */
const blocks = (html, marker) => html.split(marker).slice(1).map((b) => b.slice(0, 6000));
const abs = (u) => (u && u.startsWith('/') ? `https://pasgo.vn${u}` : u);

/** Khu vực theo địa chỉ (hỗ trợ cả tên phường mới sau sáp nhập 2025). */
export function regionOfAddress(addr) {
  const t = String(addr || '').toLowerCase();
  if (/(quận|q\.?)\s?[12](?!\d)|district [12](?!\d)|thảo điền|thao dien|an phú|an khánh|thủ thiêm|bến nghé|bến thành|đa kao|cầu ông lãnh|nguyễn thái bình|phường sài gòn|bùi viện|đồng khởi|nguyễn huệ|lê thánh tôn|hai bà trưng, (p|phường)|ben nghe|ben thanh|da kao|cau ong lanh|nguyen thai binh|thao dien|an phu|an khanh|thu thiem|bui vien|dong khoi|nguyen hue|sai gon ward/.test(t)) return 'q1q2';
  if (/hà nội|hanoi|đà nẵng|da nang|nha trang|phú quốc|đà lạt|hội an/.test(t)) return 'vn';
  return 'hcm';
}

/** PasGo: đọc từng mục (h2) trên trang và các thẻ nhà hàng bên dưới. */
export async function pasgo(settings) {
  const cfg = settings.venues?.pasgo;
  if (!cfg?.enabled) return { skipped: 'Đang tắt', items: [] };
  const pages = await pool(cfg.pages || [], 2, async (url) => ({ url, html: await fetchText(url, {}, 25000) }));
  const items = new Map();
  for (const p of pages) {
    if (p?.error || !p?.html) {
      log(`  ! PasGo: ${p?.error}`);
      continue;
    }
    const pageTitle = decode((p.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || p.url.split('/').pop());
    // Cắt trang theo h2 để biết nhà hàng nằm trong mục nào ("Mới nhất", "Top sang trọng"…)
    const parts = p.html.split(/<h2[^>]*>/);
    parts.forEach((chunk, idx) => {
      const section = idx === 0 ? pageTitle : decode(chunk.slice(0, chunk.indexOf('</h2>')));
      const add = (v) => {
        const id = hash(`pasgo:${v.url}`);
        const prev = items.get(id);
        const sections = [...new Set([...(prev?.sections || []), section].filter(Boolean))];
        items.set(id, {
          ...prev,
          ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null && x !== '')),
          id,
          platform: 'pasgo',
          source: 'PasGo',
          region: regionOfAddress(v.address || prev?.address || v.title),
          text: [v.category || prev?.category, v.deal || prev?.deal, v.address || prev?.address].filter(Boolean).join(' · '),
          sections,
          hashtags: [],
          // PasGo không công khai lượt đặt → độ nổi bật = số mục PasGo đang đề xuất địa điểm/deal này
          metrics: { featured: sections.length },
        });
      };
      // a) Thẻ nhà hàng ở trang danh sách
      for (const c of blocks(chunk, '<div class="wapitem">')) {
        const url = (c.match(/class="waptop" href="([^"]+)"/) || [])[1];
        if (!url) continue;
        add({
          kind: 'venue', url,
          title: decode((c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]) || decode((c.match(/title="([^"]+)"/) || [])[1]),
          address: decode((c.match(/class="text-address[^"]*">([\s\S]*?)<\/p>/) || [])[1]),
          deal: decode((c.match(/class="wapsale[^"]*">([\s\S]*?)<\/div>/) || [])[1]),
          category: decode((c.match(/class="waptag[^"]*">([\s\S]*?)<\/div>/) || [])[1]),
          image: (c.match(/<img[^>]+src="([^"]+)"/) || [])[1],
          rating: parseFloat((c.match(/name="ratingDanhGia"[^>]*value="([\d.]+)"/) || [])[1]) || null,
          priceLevel: parseInt((c.match(/name="ratingChatLuong"[^>]*value="(\d)"/) || [])[1], 10) || null,
        });
      }
      // b) Thẻ nhà hàng ở trang chủ (carousel theo mục)
      for (const c of blocks(chunk, '<div class="item-child">')) {
        const url = (c.match(/href="(https:\/\/pasgo\.vn\/nha-hang\/[^"]+)"/) || [])[1];
        if (!url) continue;
        add({
          kind: 'venue', url,
          title: decode((c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]) || decode((c.match(/title="([^"]+)"/) || [])[1]),
          category: decode((c.match(/data-mota-mh="([^"]*)"/) || [])[1]),
          deal: decode((c.match(/class="name-sale[^"]*">([\s\S]*?)<\/div>/) || [])[1]),
          sticker: decode((c.match(/class="text-sticker">([\s\S]*?)<\/span>/) || [])[1]),
          image: (c.match(/data-src="([^"]+)"/) || c.match(/<img[^>]+src="([^"]+)"/) || [])[1],
        });
      }
      // c) Deal/sản phẩm ưu đãi (set menu, voucher…)
      for (const c of blocks(chunk, '<div class="items_child">')) {
        const url = abs((c.match(/class="items_link" href="([^"]+)"/) || [])[1]);
        if (!url) continue;
        const venue = decode((c.match(/class="btn_booking[^"]*" title="([^"]+)"/) || [])[1]);
        add({
          kind: 'deal', url,
          title: decode((c.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]),
          venue,
          category: venue ? `Deal · ${venue}` : 'Deal',
          deal: [decode((c.match(/class="price_sale_offer">([\s\S]*?)<\/span>/) || [])[1]), decode((c.match(/class="price-sale">([\s\S]*?)<\/span>/) || [])[1])].filter(Boolean).join(' · '),
          priceOrigin: decode((c.match(/class="price_origin">([\s\S]*?)<\/span>/) || [])[1]),
          rule: decode((c.match(/class="items_child_rule[^"]*">([\s\S]*?)<\/div>/) || [])[1]),
          image: (c.match(/<img[^>]+src="([^"]+)"/) || [])[1],
        });
      }
    });
  }
  return { items: [...items.values()] };
}

const pick = (o, paths) => {
  for (const p of paths) {
    const v = p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return v;
  }
  return null;
};
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.]/g, '')) || 0);
const list = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.name || x.title || '' : x)).filter(Boolean) : v ? [String(v)] : []);

/** Chuẩn hoá địa điểm từ Google Maps / Tripadvisor (Apify) về chung một schema. */
export function normalizeVenue(platform, raw) {
  const name = String(pick(raw, ['title', 'name', 'placeName']) || '');
  const url = pick(raw, ['url', 'webUrl', 'placeUrl', 'link']);
  const address = String(pick(raw, ['address', 'addressObj.street1', 'street', 'locationString']) || '');
  const cats = [...new Set([...list(pick(raw, ['categories', 'cuisines', 'subcategories'])), ...list(pick(raw, ['categoryName', 'category', 'subtype']))])];
  const reviews = num(pick(raw, ['reviewsCount', 'numberOfReviews', 'reviews_count', 'reviewCount']));
  const rating = num(pick(raw, ['totalScore', 'rating', 'averageRating']));
  return {
    id: hash(`${platform}:${url || name}`),
    platform,
    kind: 'venue',
    region: regionOfAddress(`${address} ${pick(raw, ['neighborhood', 'city']) || ''}`),
    title: name,
    text: [cats.slice(0, 3).join(', '), pick(raw, ['price', 'priceLevel', 'priceRange']), address].filter(Boolean).join(' · '),
    url,
    image: pick(raw, ['imageUrl', 'image', 'photo.images.large.url', 'photos.0', 'imageUrls.0', 'thumbnail']),
    source: platform === 'googlemaps' ? 'Google Maps' : 'Tripadvisor',
    address,
    category: cats.slice(0, 3).join(', '),
    categories: cats.slice(0, 6),
    rating: rating || null,
    priceLevel: pick(raw, ['price', 'priceLevel', 'priceRange']),
    rankingString: pick(raw, ['rankingString', 'ranking']),
    rankingPosition: num(pick(raw, ['rankingPosition'])) || null,
    hashtags: [],
    metrics: { reviews, rating },
  };
}
