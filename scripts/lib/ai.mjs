// Lớp AI tuỳ chọn: anthropic | openai | gemini | none.
import Anthropic from '@anthropic-ai/sdk';
import { fetchJson, log } from './util.mjs';

export function resolveProvider(settings, env = process.env) {
  const keys = { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY };
  let provider = (env.AI_PROVIDER || settings.ai?.provider || 'auto').toLowerCase();
  if (provider === 'auto') provider = ['anthropic', 'openai', 'gemini'].find((p) => keys[p]) || 'none';
  if (provider !== 'none' && !keys[provider]) {
    log(`  ! AI_PROVIDER=${provider} nhưng thiếu API key, chuyển sang chế độ không dùng AI`);
    provider = 'none';
  }
  const model = provider === 'none' ? null : env.AI_MODEL || settings.ai?.models?.[provider];
  return { provider, model, key: keys[provider] };
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'customerNeeds', 'keywordInsights', 'emergingKeywords', 'trends', 'platformTrends', 'hashtagStrategy', 'weatherInsights', 'contentIdeas', 'actions', 'generalSummary', 'trendOpportunities', 'segmentInsights'],
  properties: {
    summary: { type: 'string', description: '3-5 câu tóm tắt bức tranh xu hướng của kỳ này cho team Marketing' },
    customerNeeds: { type: 'array', items: { type: 'string' }, description: '4-6 nhu cầu/động cơ khách hàng nổi bật' },
    keywordInsights: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['keyword', 'insight'],
        properties: { keyword: { type: 'string' }, insight: { type: 'string' } },
      },
    },
    emergingKeywords: { type: 'array', items: { type: 'string' } },
    trends: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'description', 'platforms', 'regions', 'evidenceUrls', 'contentIdeas', 'relevance'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          platforms: { type: 'array', items: { type: 'string' } },
          regions: { type: 'array', items: { type: 'string' } },
          evidenceUrls: { type: 'array', items: { type: 'string' } },
          contentIdeas: { type: 'array', items: { type: 'string' } },
          relevance: { type: 'string', enum: ['cao', 'trung bình', 'tham khảo'] },
        },
      },
    },
    platformTrends: {
      type: 'array',
      description: 'Một mục cho mỗi nền tảng có dữ liệu: tiktok, facebook, instagram, threads, youtube, google, news, pasgo, googlemaps, tripadvisor',
      items: {
        type: 'object', additionalProperties: false, required: ['platform', 'headline', 'trends', 'formats', 'hashtags'],
        properties: {
          platform: { type: 'string', enum: ['google', 'tiktok', 'facebook', 'instagram', 'threads', 'youtube', 'news', 'pasgo', 'googlemaps', 'tripadvisor'] },
          headline: { type: 'string', description: '1 câu: xu hướng nổi bật nhất trên nền tảng này' },
          trends: { type: 'array', items: { type: 'string' }, description: '2-4 xu hướng cụ thể' },
          formats: { type: 'array', items: { type: 'string' }, description: 'Định dạng nội dung/ưu đãi hiệu quả trên nền tảng này' },
          hashtags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    segmentInsights: {
      type: 'array',
      description: 'Đúng 4 mục, mỗi phân khúc một mục: bar, cocktail, fine, casual',
      items: {
        type: 'object', additionalProperties: false, required: ['segment', 'headline', 'needs', 'contentIdeas'],
        properties: {
          segment: { type: 'string', enum: ['bar', 'cocktail', 'fine', 'casual'] },
          headline: { type: 'string', description: '1 câu: xu hướng nổi bật nhất của phân khúc này' },
          needs: { type: 'array', items: { type: 'string' }, description: '2-3 nhu cầu khách hàng' },
          contentIdeas: { type: 'array', items: { type: 'string' }, description: '2-3 ý tưởng content cụ thể' },
        },
      },
    },
    generalSummary: { type: 'string', description: '2-4 câu: xã hội Việt Nam đang quan tâm gì (mọi lĩnh vực) trong kỳ này' },
    trendOpportunities: {
      type: 'array',
      description: '6-10 trend chung (ngoài ngành) có thể "đu" cho F&B/nightlife, sắp theo tiềm năng',
      items: {
        type: 'object', additionalProperties: false, required: ['trend', 'category', 'why', 'angle', 'format', 'timing', 'risk'],
        properties: {
          trend: { type: 'string' },
          category: { type: 'string' },
          why: { type: 'string', description: 'Vì sao trend này đang nóng (dựa trên dữ liệu)' },
          angle: { type: 'string', description: 'Cách lồng vào nhà hàng/bar/nightlife: content, cocktail/menu đặc biệt, event, ưu đãi' },
          format: { type: 'string', description: 'Nền tảng + định dạng' },
          timing: { type: 'string', description: 'Làm ngay hôm nay / trong 48h / tuần này…' },
          risk: { type: 'string', enum: ['an toàn', 'cân nhắc', 'tránh'] },
        },
      },
    },
    hashtagStrategy: { type: 'string', description: '2-4 câu: nên dùng hashtag nào, kết hợp ra sao, tránh gì' },
    actions: {
      type: 'array',
      description: '6-10 action cụ thể cho team Marketing, sắp theo ưu tiên',
      items: {
        type: 'object', additionalProperties: false, required: ['priority', 'title', 'detail', 'team', 'platforms', 'timeline', 'kpi'],
        properties: {
          priority: { type: 'string', enum: ['cao', 'trung bình', 'thấp'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          team: { type: 'string', description: 'Content / Social / SEO-Ads / Promo / BD / CX / Marketing lead' },
          platforms: { type: 'array', items: { type: 'string' } },
          timeline: { type: 'string', description: 'Hôm nay / Tuần này / Tháng này / trước ngày cụ thể' },
          kpi: { type: 'string' },
        },
      },
    },
    weatherInsights: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'detail', 'ideas'],
        properties: { title: { type: 'string' }, detail: { type: 'string' }, ideas: { type: 'array', items: { type: 'string' } } },
      },
    },
    contentIdeas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['platform', 'format', 'hook', 'idea', 'keywords'],
        properties: {
          platform: { type: 'string' }, format: { type: 'string' }, hook: { type: 'string' },
          idea: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SYSTEM = `Bạn là chuyên gia phân tích xu hướng social & search cho một nhóm thương hiệu F&B/nightlife tại TP.HCM: nhà hàng tầm trung - cao cấp và nhà hàng casual, cocktail bar, hidden bar, cocktail club, fun dining và các dịch vụ nightlife. Theo dõi song song 4 phân khúc: bar, cocktail, nhà hàng cao cấp, nhà hàng casual. Khu vực phục vụ chính: Quận 1 và Quận 2 (Thảo Điền, Thủ Thiêm). Dữ liệu từ HCM, Việt Nam và Đông Nam Á chỉ để tham khảo xu hướng.

Nhiệm vụ: đọc dữ liệu đã thu thập (keyword đã chấm điểm, nội dung top theo độ tiếp cận, báo chí, Google Trends, thời tiết) và viết insight giúp team Marketing hiểu nhu cầu khách hàng để sản xuất nội dung.

Nguyên tắc:
- Viết tiếng Việt, ngắn gọn, cụ thể, có thể hành động ngay.
- Chỉ dựa trên dữ liệu được cung cấp. Không bịa số liệu, tên địa điểm hay đường link. evidenceUrls phải là URL có trong dữ liệu.
- Ưu tiên insight liên quan Q1/Q2 và phân khúc trung - cao cấp. Ghi rõ khi một xu hướng chỉ là tham khảo từ SEA.
- keywordInsights: giải thích ngắn vì sao từng keyword trong top 10 quan trọng và nên dùng thế nào.
- contentIdeas: 6-10 ý tưởng, mỗi ý ghi rõ nền tảng (TikTok/Instagram/Facebook/Threads/Google-SEO), định dạng (Reels, carousel, video ngắn, bài SEO…), câu hook mở đầu.
- platformTrends: phân tích riêng từng nền tảng có dữ liệu (TikTok, Facebook, Instagram, Threads, YouTube, Google, báo chí, PasGo, Google Maps, Tripadvisor). Với nền tảng đặt bàn/review, tập trung vào loại hình đang được đẩy, dạng ưu đãi và địa điểm đang lên.
- hashtagStrategy: dựa trên dữ liệu hashtag thực tế; nếu chưa có dữ liệu social thì nói rõ và đề xuất bộ hashtag khởi đầu.
- actions: việc cụ thể team Marketing nên làm ngay, có ưu tiên, team phụ trách, thời hạn, KPI. Tham khảo ruleActions và upcomingEvents nhưng viết chi tiết, sắc hơn; không lặp y nguyên.
- segmentInsights: phân tích SONG SONG và CÂN BẰNG 4 phân khúc: Bar & Nightlife, Cocktail & Mixology, Nhà hàng cao cấp/Fun dining, Nhà hàng casual & quán ăn (dựa trên dữ liệu segments). Không thiên vị bar.
- generalSummary + trendOpportunities: dựa trên generalTrends (Google Trends toàn quốc, YouTube Thịnh hành, tin nổi bật, SEA), KHÔNG giới hạn ngành F&B. Chọn trend có thể đu được (thể thao: chiếu trận/combo xem bóng; âm nhạc/showbiz: cocktail lấy cảm hứng, playlist, after-party; phim/game: theme night; lễ hội…). Đánh dấu risk "tránh" cho chủ đề NHẠY CẢM (tai nạn, thiên tai có thương vong, chính trị, tôn giáo, tang lễ) và không đề xuất khai thác thương mại các chủ đề đó.
- weatherInsights: liên hệ thời tiết 7 ngày tới (đặc biệt mưa buổi tối 17–23h, nắng nóng) với hành vi đi chơi và gợi ý content/ưu đãi.`;

export async function generateInsights(ai, payload, periodLabel) {
  if (ai.provider === 'none') return null;
  const user = `Kỳ phân tích: ${periodLabel}\n\nDỮ LIỆU (JSON):\n${JSON.stringify(payload)}`;
  const t0 = Date.now();
  const call = { anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini }[ai.provider];
  const FALLBACK = { gemini: 'gemini-flash-latest', openai: 'gpt-5-mini' };
  let out;
  // Thử lại khi quá tải/giới hạn (429, 5xx); lần cuối chuyển sang model dự phòng
  for (let attempt = 1; ; attempt++) {
    const model = attempt === 4 && FALLBACK[ai.provider] && FALLBACK[ai.provider] !== ai.model ? FALLBACK[ai.provider] : ai.model;
    try {
      out = await call({ ...ai, model }, user);
      if (model !== ai.model) log(`  AI: dùng model dự phòng ${model}`);
      break;
    } catch (e) {
      const retryable = /HTTP (429|5\d\d)|overloaded|high demand|UNAVAILABLE|timeout|aborted/i.test(e.message);
      if (!retryable || attempt >= 4 || (attempt === 3 && !FALLBACK[ai.provider])) throw e;
      const wait = attempt * 15000;
      log(`  AI: lỗi tạm thời (${e.message.slice(0, 60)}…), thử lại sau ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  log(`  AI (${ai.provider}/${ai.model}) ${periodLabel}: xong sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

async function callAnthropic(ai, user) {
  const client = new Anthropic({ apiKey: ai.key });
  const stream = client.beta.messages.stream({
    model: ai.model,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Model từ chối yêu cầu (refusal)');
  if (msg.stop_reason === 'max_tokens') throw new Error('Output bị cắt do max_tokens');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

async function callOpenAI(ai, user) {
  const data = await fetchJson(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'insights', strict: true, schema: SCHEMA } },
      }),
    },
    300000,
  );
  return JSON.parse(data.choices[0].message.content);
}

async function callGemini(ai, user) {
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ai.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
      }),
    },
    300000,
  );
  return JSON.parse(data.candidates[0].content.parts.map((p) => p.text).join(''));
}
