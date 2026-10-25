# TÀI LIỆU BÀN GIAO KỸ THUẬT & API CONTRACT: WSEA-122 (V2.0)
## API THỐNG KÊ TIẾN ĐỘ HỌC TẬP & CHI TIẾT THEO NGÀY (PROGRESS API)

* **Mã task Jira:** `WSEA-122` (Backend) & `WSEA-116`, `WSEA-132` (Frontend)
* **Kỹ sư phụ trách:** Phạm Thái Bình (DevOps / Backend)
* **Bên tiếp nhận:** Frontend Team (TV), QA/Tester Team, Project Manager
* **Trạng thái:** Hoàn thành & Đã đồng bộ 100% với giao diện hoàn thiện mới nhất
* **Ngày cập nhật:** 22/10/2026 (Tích hợp cùng PR #78 / WSEA-132)

---

### 1. THÔNG TIN ENDPOINT & XÁC THỰC

Tất cả các endpoints trong module Progress đều yêu cầu xác thực người dùng qua JWT Guard:
* **Base URL (Staging):** `https://web-study-english-ai.onrender.com/api`
* **Base URL (Local):** `http://localhost:3001/api`
* **Header bắt buộc:** `Authorization: Bearer <access_token>`

---

### 2. CHI TIẾT CÁC ENDPOINT

#### 2.1. `GET /api/progress/stats` — Thống kê tổng hợp & Biểu đồ tiến độ
Lấy tổng hợp chỉ số học tập, chuỗi streak, độ bền trí nhớ và dữ liệu vẽ biểu đồ theo khoảng thời gian.

* **Query Parameters:**
  * `range` *(optional, string, enum: `day` | `week` | `month`)*: Khoảng thời gian hiển thị. Mặc định là `week`.
* **Quy tắc xử lý theo `range`:**
  * **`range = "day"` (14 ngày gần nhất):**
    * `stabilityTimeline`: 14 điểm dữ liệu theo từng ngày (`label: "DD/MM"`, `date: "YYYY-MM-DD"`, `value: 0-100%`).
    * `dailyActivity`: Hoạt động chi tiết 14 ngày gần nhất (`day: "DD/MM"`, `newWords`, `reviews`).
    * `totalWordsTimeline`: 14 điểm lũy kế số từ.
  * **`range = "week"` (Mặc định - 4 tuần / 30 ngày gần nhất):**
    * `stabilityTimeline`: 4 mốc tuần (`Tuần 1`, `Tuần 2`, `Tuần 3`, `Tuần 4`).
    * `dailyActivity`: 7 ngày gần nhất trong tuần (`T2`, `T3`, `T4`, `T5`, `T6`, `T7`, `CN`).
    * `totalWordsTimeline`: 4 mốc tuần.
  * **`range = "month"` (6 tháng gần nhất):**
    * `stabilityTimeline`: 6 mốc tháng gần nhất (`Thg 5`, `Thg 6`, ..., `Thg 10`).
    * `dailyActivity`: Hoạt động tổng hợp theo từng tháng (`day: "Thg 5"`, `newWords`: tổng từ mới trong tháng, `reviews`: tổng lượt ôn trong tháng).
    * `totalWordsTimeline`: 6 mốc tháng.

* **Response Mẫu (`range=week`):**
```json
{
  "totalWords": 842,
  "weeklyGain": 12,
  "statusCounts": {
    "mastered": 547,
    "learning": 210,
    "notLearned": 85
  },
  "retentionRate7d": 87,
  "streakDays": 15,
  "bestStreakDays": 18,
  "totalWordsTimeline": [
    { "label": "Tuần 1", "total": 210 },
    { "label": "Tuần 2", "total": 450 },
    { "label": "Tuần 3", "total": 710 },
    { "label": "Tuần 4", "total": 842 }
  ],
  "summary": {
    "totalWords": { "count": 842, "changeVsLastWeek": 12 },
    "retentionRate7Days": { "rate": 87, "status": "EXCELLENT", "statusText": "Xuất sắc" },
    "streak": { "current": 15, "longest": 18, "studiedToday": true, "message": "🔥 Sắp lập kỷ lục mới rồi" },
    "memoryStability": { "score": 78, "changeVsLastWeek": 12 }
  },
  "stabilityTimeline": [
    { "label": "Tuần 1", "date": "2026-09-20", "value": 10 },
    { "label": "Tuần 2", "date": "2026-09-27", "value": 42 },
    { "label": "Tuần 3", "date": "2026-10-04", "value": 75 },
    { "label": "Tuần 4", "date": "2026-10-11", "value": 98 }
  ],
  "cardDistribution": {
    "mastered": { "count": 547, "percentage": 65 },
    "learning": { "count": 210, "percentage": 25 },
    "unlearned": { "count": 85, "percentage": 10 },
    "total": 842
  },
  "dailyActivity": [
    { "day": "T2", "date": "2026-10-16", "newWords": 5, "reviews": 11 },
    { "day": "T3", "date": "2026-10-17", "newWords": 9, "reviews": 8 },
    { "day": "T4", "date": "2026-10-18", "newWords": 14, "reviews": 16 },
    { "day": "T5", "date": "2026-10-19", "newWords": 4, "reviews": 10 },
    { "day": "T6", "date": "2026-10-20", "newWords": 12, "reviews": 8 },
    { "day": "T7", "date": "2026-10-21", "newWords": 8, "reviews": 15 },
    { "day": "CN", "date": "2026-10-22", "newWords": 16, "reviews": 6 }
  ],
  "motivationalMessage": "Bạn đang tiến bộ rất tốt! Hãy duy trì chuỗi ngày học để giữ vững đà bứt phá nhé. 🚀"
}
```

---

#### 2.2. `GET /api/progress/daily` — Chi tiết hoạt động học theo ngày (WSEA-132)
Phục vụ thành phần `DayDetailCard` và hook `useDayDetail(date)` trên Frontend.

* **Query Parameters:**
  * `date` *(optional, string, định dạng `YYYY-MM-DD`)*: Ngày cần tra cứu. Mặc định là ngày hôm nay theo giờ Việt Nam (UTC+7).
* **Quy chuẩn ánh xạ đánh giá từ vựng (`rating`):**
  * `1` $\to$ `"forgot"` (Chưa nhớ - màu đỏ)
  * `2` $\to$ `"hard"` (Khó - màu vàng)
  * `3` $\to$ `"medium"` (Bình thường - màu xanh chủ đạo)
  * `4` $\to$ `"easy"` (Dễ - màu xanh lá)

* **Response Mẫu:**
```json
{
  "date": "2026-10-22",
  "newWords": 1,
  "reviews": 2,
  "words": [
    {
      "id": "e0a12c40-f198-4e89-a517-9c9e0d1b3f9a",
      "word": "serendipity",
      "kind": "new"
    },
    {
      "id": "b18f3d99-d477-4b72-88ef-51a8bc47e90c",
      "word": "ubiquitous",
      "kind": "review",
      "rating": "easy"
    },
    {
      "id": "7ac2354e-48a1-4fc3-a9d3-99933efb2165",
      "word": "ephemeral",
      "kind": "review",
      "rating": "forgot"
    }
  ]
}
```

---

### 3. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG & ĐỒNG BỘ
* **Unit Tests Backend:** **11/11 test files passed, 107/107 unit tests passed (100% Green)**.
* **Các test case kiểm thử trọng tâm cho Progress:**
  * Khởi tạo an toàn cho tài khoản mới (0 từ, 0 lượt ôn, không lỗi NaN).
  * Kiểm thử tính toán độ bền trí nhớ, phân bố thẻ, tỷ lệ retention rate 7 ngày và chuỗi streak liên tục.
  * Kiểm thử chế độ `range = "day"` (14 ngày).
  * Kiểm thử chế độ `range = "month"` (6 tháng).
  * Kiểm thử endpoint `getDayDetail` với ngày có hoạt động và ngày trống.
