// Thời tiết TP.HCM từ Open-Meteo (miễn phí, không cần key).
import { fetchJson } from '../lib/util.mjs';

const WMO = {
  0: 'Trời quang', 1: 'Ít mây', 2: 'Có mây', 3: 'Nhiều mây', 45: 'Sương mù', 48: 'Sương mù',
  51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn dày', 61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa to',
  80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào rất to', 95: 'Dông', 96: 'Dông kèm mưa đá', 99: 'Dông mạnh',
};

export async function weather(settings) {
  const { location, pastDays = 7, forecastDays = 7 } = settings.weather;
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  Object.entries({
    latitude: location.latitude, longitude: location.longitude, timezone: settings.timezone,
    past_days: pastDays, forecast_days: forecastDays,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,uv_index_max',
    hourly: 'precipitation',
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await fetchJson(u);
  // Mưa buổi tối (17h–23h) quan trọng nhất với nightlife
  const eveningRain = {};
  d.hourly.time.forEach((t, i) => {
    const [day, hh] = t.split('T');
    const h = +hh.slice(0, 2);
    if (h >= 17 && h <= 23) eveningRain[day] = (eveningRain[day] || 0) + (d.hourly.precipitation[i] || 0);
  });
  const days = d.daily.time.map((date, i) => ({
    date,
    code: d.daily.weather_code[i],
    label: WMO[d.daily.weather_code[i]] || 'Không rõ',
    tMax: d.daily.temperature_2m_max[i],
    tMin: d.daily.temperature_2m_min[i],
    feelsMax: d.daily.apparent_temperature_max[i],
    rain: d.daily.precipitation_sum[i],
    rainProb: d.daily.precipitation_probability_max[i],
    eveningRain: Math.round((eveningRain[date] || 0) * 10) / 10,
    uv: d.daily.uv_index_max[i],
  }));
  return { location: location.name, days };
}

/** Insight theo luật, dùng khi không bật AI (và làm input cho AI). */
export function weatherInsights(w, today) {
  const next = w.days.filter((d) => d.date >= today).slice(0, 7);
  const past = w.days.filter((d) => d.date < today);
  const rainyEvenings = next.filter((d) => d.eveningRain >= 2 || (d.rainProb ?? 0) >= 70);
  const hot = next.filter((d) => d.feelsMax >= 36);
  const dry = next.filter((d) => d.eveningRain < 0.5 && (d.rainProb ?? 0) < 40);
  const out = [];
  if (rainyEvenings.length >= 3) {
    out.push({
      tag: 'Mưa tối',
      title: `${rainyEvenings.length}/7 tối tới khả năng mưa cao`,
      detail: 'Người dùng ưu tiên địa điểm trong nhà, ấm cúng, gần chỗ ở. Hidden bar, speakeasy, fine dining trong nhà có lợi thế.',
      ideas: ['Content "trú mưa" kiểu "Mưa Sài Gòn, trốn vào đâu?"', 'Cocktail ấm (hot toddy, spiced rum) hoặc món nóng', 'Ưu đãi "Rainy day" khung 18–21h, hợp tác Grab/Be', 'Story real-time báo quán đang mở, có chỗ đỗ xe hoặc mái che'],
    });
  }
  if (hot.length >= 3) {
    out.push({
      tag: 'Nắng nóng',
      title: `${hot.length} ngày cảm giác nóng ≥ 36°C`,
      detail: 'Nhu cầu đồ uống mát lạnh, highball, frozen cocktail, mocktail tăng; khách dịch chuyển hoạt động sang buổi tối muộn.',
      ideas: ['Reels "cocktail giải nhiệt" (đá viên trong, giọt nước ngưng)', 'Happy hour 17–19h để đón khách tan làm', 'Món lạnh, ceviche, sashimi trong menu fine dining'],
    });
  }
  if (dry.length >= 3) {
    out.push({
      tag: 'Tối khô ráo',
      title: `${dry.length} tối tới ít mưa`,
      detail: 'Thời điểm tốt để đẩy rooftop, outdoor, phố đi bộ, sự kiện ngoài trời.',
      ideas: ['Content hoàng hôn trên rooftop, golden hour 17h30–18h15', 'Đẩy booking cuối tuần cho bàn view', 'Video timelapse skyline Q1 / bờ sông Thủ Thiêm'],
    });
  }
  const pastRain = past.reduce((s, d) => s + (d.rain || 0), 0);
  if (past.length) {
    out.push({
      tag: 'Tuần qua',
      title: `Tổng mưa ${past.length} ngày qua: ${Math.round(pastRain)} mm`,
      detail: pastRain > 60 ? 'Tuần mưa nhiều, khách có thể dồn nhu cầu "đi chơi bù" khi trời tạnh.' : 'Thời tiết tuần qua ổn định, ít ảnh hưởng hành vi đi chơi.',
      ideas: [],
    });
  }
  return out;
}
