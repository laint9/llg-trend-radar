# LLG Trend Radar

**Web:** https://laint9.github.io/llg-trend-radar/ (GitHub Pages, tự cập nhật sau mỗi lượt thu thập dữ liệu)

**5 trang:** Hôm nay · Từ khoá & Hashtag · Xu hướng (Ngành mình / Phân khúc / Xu hướng chung) · Nền tảng · Kế hoạch (Action / Ý tưởng / Thời tiết)

Web tool tổng hợp **trending theo ngày / tuần / tháng** cho nhà hàng tầm trung–cao, cocktail bar, hidden bar, cocktail club, fun dining và nightlife. Khu vực chính là **Quận 1 và Quận 2**, có thêm dữ liệu tham khảo từ HCM, Việt Nam và Đông Nam Á.

Mục đích: giúp team Marketing hiểu nhu cầu khách hàng để sản xuất nội dung phù hợp.

## Tính năng

| Mục | Nội dung |
|---|---|
| **Action đề xuất** | Việc cụ thể cho team (ưu tiên, team phụ trách, thời hạn, KPI, nguồn). Gồm 2 lớp: luật tự động (lịch lễ/sự kiện, keyword đang lên, thời tiết, hashtag, ưu đãi PasGo, đối thủ) và AI. Có ô đánh dấu "đã xử lý" |
| **Song song theo phân khúc** | 4 phân khúc theo dõi ngang nhau: Bar & Nightlife · Cocktail & Mixology · Nhà hàng cao cấp/Fun dining · Nhà hàng casual & quán ăn. Mỗi phân khúc có điểm sức nóng, khách đang tìm gì, keyword, hashtag, nội dung/địa điểm top, nhu cầu & ý tưởng content (AI). Sửa từ khoá nhận diện trong `segments` |
| **Top xu hướng chung** | Không lọc ngành: Google Trends VN & Đông Nam Á, YouTube Thịnh hành VN, tin nổi bật (VnExpress, Tuổi Trẻ, Thanh Niên). Tự phân loại lĩnh vực (thể thao, showbiz, game, kinh tế…), đánh dấu chủ đề nhạy cảm. AI gợi ý **cơ hội đu trend** cho F&B/nightlife kèm mức rủi ro |
| **Top 10 keyword** | Truy vấn Google thật + hashtag/cụm từ trên TikTok, Instagram, Facebook, Threads, YouTube, báo chí. Có điểm số, % thay đổi so với kỳ trước, nhãn MỚI, lọc theo khu vực, xuất CSV |
| **Xu hướng chính** | 10 chủ đề (Speakeasy, Rooftop, Cocktail, Fine/Fun dining, Party/DJ, Hẹn hò, Ưu đãi, Lễ hội, Bản địa, No/Low alcohol), kèm bằng chứng. Khi bật AI: phân tích xu hướng, nhu cầu khách hàng, ý tưởng content |
| **Xu hướng từng nền tảng** | Tách riêng TikTok, Facebook, Instagram, Threads, YouTube, Google, Báo chí, **PasGo, Google Maps, Tripadvisor**: chủ đề, keyword, hashtag, định dạng hiệu quả. Với nền tảng đặt bàn/review: loại hình đang được đẩy, dạng ưu đãi, deal, địa điểm mới, địa điểm tăng review nhanh |
| **Hashtag** | Tổng hợp hashtag dùng trong kỳ: số bài, reach TB, tổng reach, % thay đổi, bài top, lọc theo nền tảng, bộ hashtag gợi ý (copy 1 chạm), đám mây hashtag, xuất CSV |
| **Xếp hạng theo nền tảng** | Mỗi nền tảng xếp theo độ tiếp cận giảm dần, có ảnh/thumbnail, link gốc, video, lượt xem/thích/bình luận/chia sẻ |
| **Google Search** | Truy vấn người dùng đang gõ (Autocomplete), Google Trends VN (lượng tìm kiếm ước tính), trending liên quan tại SEA |
| **Thời tiết & insight** | 7 ngày qua và 7 ngày tới tại Q1: mưa buổi tối 17–23h, cảm giác nóng. Gợi ý content và ưu đãi theo thời tiết |
| **Kỳ** | Ngày / Tuần (7 ngày) / Tháng (30 ngày), so sánh với kỳ liền trước |

## Kiến trúc

```
GitHub Actions (7:00 sáng mỗi ngày)
  └─ scripts/collect.mjs
       ├─ Google Trends RSS, Google Autocomplete, Google News, RSS báo   (miễn phí)
       ├─ Open-Meteo thời tiết                                          (miễn phí)
       ├─ YouTube Data API                                              (miễn phí, cần key)
       ├─ PasGo (nền tảng đặt bàn phổ biến nhất VN)                     (miễn phí)
       ├─ Apify: TikTok / Instagram / Facebook / Threads                (trả phí)
       ├─ Apify: Google Maps / Tripadvisor (địa điểm, review)           (trả phí)
       ├─ Phân tích: keyword, chủ đề, xếp hạng theo độ tiếp cận
       └─ AI (tuỳ chọn): Claude / OpenAI / Gemini / không dùng
  └─ commit public/data/*.json  →  Netlify tự deploy  →  web tĩnh (public/)
```

## Hướng dẫn deploy (khoảng 15 phút)

### 1. Đưa code lên GitHub
1. Tạo repo mới trên GitHub (vd. `llg-trend-radar`). Có thể để Private, Netlify vẫn đọc được.
2. Trong thư mục này, chạy:
   ```bash
   git init && git add . && git commit -m "Khởi tạo LLG Trend Radar"
   git branch -M main
   git remote add origin https://github.com/<tài-khoản>/llg-trend-radar.git
   git push -u origin main
   ```

### 2. Thêm API key vào GitHub Secrets
Vào repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Bắt buộc? | Lấy ở đâu | Chi phí |
|---|---|---|---|
| `APIFY_TOKEN` | Cần cho TikTok/IG/FB/Threads/Maps/Tripadvisor | [console.apify.com](https://console.apify.com/account/integrations) → API token | Gói FREE 5 USD/tháng là đủ với lịch mặc định (xem phần Ngân sách Apify) |
| `YOUTUBE_API_KEY` | Nên có | [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com) → bật YouTube Data API v3 → tạo API key | Miễn phí |
| `ANTHROPIC_API_KEY` | Tuỳ chọn (AI) | [console.anthropic.com](https://console.anthropic.com) | ~5–15 USD/tháng |
| `OPENAI_API_KEY` | Tuỳ chọn (AI) | platform.openai.com | tuỳ model |
| `GEMINI_API_KEY` | Tuỳ chọn (AI) | aistudio.google.com | có gói miễn phí |

**Đang dùng Gemini:** tạo secret `GEMINI_API_KEY` và biến (tab Variables) `AI_PROVIDER` = `gemini`. Model mặc định `gemini-3.5-flash`; khi Gemini quá tải, tool tự thử lại và chuyển sang `gemini-flash-latest`.

**Chọn AI:** ở tab **Variables**, tạo biến `AI_PROVIDER` = `anthropic` | `openai` | `gemini` | `none`. Mặc định là `auto`: dùng key nào có sẵn, theo thứ tự ưu tiên Anthropic → OpenAI → Gemini. Muốn đổi model thì tạo biến `AI_MODEL`.

Không có key nào thì tool vẫn chạy với các nguồn miễn phí và tóm tắt tự động theo luật.

### 3. Chạy lần đầu
Vào tab **Actions → "Thu thập trending hằng ngày" → Run workflow**. Sau 2–5 phút, workflow sẽ commit dữ liệu mới vào `public/data/`.

### 4. Kết nối Netlify
1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → chọn repo.
2. Build command: *để trống*. Publish directory: `public` (đã khai báo sẵn trong `netlify.toml`).
3. Deploy. Từ đó, mỗi sáng GitHub Actions commit dữ liệu mới và Netlify tự deploy lại.

## Ngân sách Apify

Gói Apify FREE có **5 USD/tháng**. Tool được cấu hình để nằm trong mức này:

| Nền tảng | Lịch chạy | Chi phí ước tính/lượt |
|---|---|---|
| TikTok, Instagram | 3 ngày/lần | ~0,18 + 0,09 USD |
| Facebook, Threads, Google Maps | 7 ngày/lần | ~0,05 + 0,12 + 0,24 USD |
| Tripadvisor | 14 ngày/lần | ~0,25 USD |

- Những ngày không tới lịch, tool dùng lại dữ liệu lần crawl gần nhất.
- Khi đã dùng ≥ 95% `apify.monthlyBudgetUsd`, tool tự dừng crawl tới tháng sau.
- Mỗi lượt chạy có trần `maxChargeUsd`.
- Muốn dữ liệu mỗi ngày: nâng lên gói Starter (39 USD), đặt `monthlyBudgetUsd: 39` và `everyDays: 1`.
- Chạy thử rẻ: `APIFY_SAMPLE=4 npm run collect` (mỗi nền tảng lấy vài kết quả). Bỏ qua lịch: `APIFY_FORCE=1`.

## Tuỳ chỉnh (không cần biết code)

Mọi thứ nằm trong [`config/settings.json`](config/settings.json). Có thể sửa trực tiếp trên GitHub:

- `regions.*.newsQueries`: từ khoá tìm báo theo khu vực.
- `autocompleteSeeds` / `autocompleteSuffixes`: từ khoá gốc để lấy truy vấn Google. Hệ thống tự ghép seed với hậu tố, vd. "hidden bar" + "quận 1".
- `apify.platforms.*.hashtags` / `queries` / `urls`: hashtag TikTok/IG, từ khoá Threads, Page Facebook cần theo dõi. **Nên thêm Page của đối thủ và các trang review food lớn.**
- `themes`: các chủ đề và từ khoá nhận diện.
- `excludePatterns`: loại keyword nhiễu (regex).
- `venues.pasgo.pages`: các trang PasGo cần theo dõi.
- `apify.platforms.googlemaps.queries`: từ khoá tìm địa điểm trên Google Maps. **Nên thêm tên đối thủ** để theo dõi số review tăng.
- `apify.platforms.tripadvisor.urls`: trang danh sách Tripadvisor (nhà hàng, nightlife HCM).
- `brand.names` / `brand.competitors`: tên thương hiệu của mình và đối thủ, để tool cảnh báo khi được nhắc đến.
- `marketingCalendar.events`: lịch lễ/sự kiện. `leadDays` = số ngày bắt đầu nhắc chuẩn bị trước.
- `ai.models`: model mặc định cho từng provider.

## Chạy trên máy (tuỳ chọn)

```bash
npm install
cp .env.example .env   # điền key nếu có
npm run collect        # thu thập + tổng hợp
npm run dev            # mở http://localhost:5173
```

Tham số: `--no-ai` (bỏ qua AI), `--force-ai` (bắt chạy lại AI), `--aggregate-only` (chỉ tổng hợp lại, không crawl), `--date=YYYY-MM-DD`.

## Lưu ý về số liệu

- **Google không công khai số lượt tìm kiếm.** "Chỉ số" của truy vấn tính từ vị trí trong Autocomplete và số ngày xuất hiện. Google Trends cho lượng tìm kiếm ước tính (vd. "2K+").
- **Facebook, Instagram, Threads, TikTok không có API trending công khai.** Tool crawl nội dung công khai theo hashtag, từ khoá và Page qua Apify. Đây là mẫu đại diện, không phải toàn bộ nền tảng.
- **Độ tiếp cận** = lượt xem nếu có. Nếu không có lượt xem thì quy đổi từ tương tác: (like + 3×comment + 5×share) × 20.
- Actor Apify cho Threads và Facebook do bên thứ ba phát triển và có thể đổi input. Nếu trạng thái nguồn (cuối trang web) báo lỗi, hãy kiểm tra input schema của actor trên Apify Console và sửa `apify.platforms.*.input`.
- **Nền tảng đặt bàn:** PasGo không công khai lượt đặt. "Độ nổi bật" = số mục PasGo đang đề xuất địa điểm/deal đó. Với Google Maps/Tripadvisor, "đang lên" = số review tăng giữa các lần chạy (cần ≥ 2 ngày dữ liệu).
- **Foody, TableCheck:** chưa hỗ trợ (Foody render bằng JavaScript, TableCheck không có trang cho VN).
- Biểu đồ tuần/tháng đầy đủ dần sau 7–30 ngày chạy. Snapshot được giữ 120 ngày (`historyDays`).
