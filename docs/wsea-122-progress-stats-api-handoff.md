# TÀI LIỆU BÀN GIAO KỸ THUẬT & API CONTRACT: WSEA-122
## API THỐNG KÊ TIẾN ĐỘ HỌC TẬP (PROGRESS STATS API)

* **Mã task Jira:** `WSEA-122`
* **Người thực hiện:** Phạm Thái Bình (DevOps / Backend Engineer)
* **Bên tiếp nhận:** Frontend Team (TV - WSEA-116), QA/Tester Team, Project Manager
* **Trạng thái:** Hoàn thành (100% Unit Tests & Build Passed)
* **Ngày bàn giao:** 17/10/2026

---

### 1. THÔNG TIN ENDPOINT & XÁC THỰC

* **Phương thức:** `GET`
* **Đường dẫn:** `/api/progress/stats`
* **Base URL (Staging):** `https://web-study-english-ai.onrender.com/api/progress/stats`
* **Base URL (Local):** `http://localhost:3001/api/progress/stats`
* **Xác thực (Auth):** Bắt buộc (`JwtAuthGuard`). 
  * Header: `Authorization: Bearer <access_token>`
  * Hoặc Cookie chứa JWT token khi đăng nhập.

---

### 2. ÁNH XẠ TRƯỜNG DỮ LIỆU VỚI GIAO DIỆN (UI MAPPING)

| Khối giao diện | Trường trong JSON Response | Kiểu dữ liệu | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| **Card 1: Tổng từ đã học** | `summary.totalWords.count`<br>`summary.totalWords.changeVsLastWeek` | `number`<br>`number` | Tổng số từ trong bộ thẻ cá nhân.<br>Số từ mới học trong 7 ngày qua. |
| **Card 2: Tỷ lệ nhớ 7 ngày** | `summary.retentionRate7Days.rate`<br>`summary.retentionRate7Days.status`<br>`summary.retentionRate7Days.statusText` | `number` (0-100)<br>`enum`<br>`string` | Tỷ lệ ôn tập thành công (rating >= 3).<br>`EXCELLENT`, `GOOD`, `FAIR`, `POOR`<br>"Xuất sắc", "Tốt", "Trung bình", "Cần cố gắng" |
| **Card 3: Chuỗi ngày liên tục** | `summary.streak.current`<br>`summary.streak.longest`<br>`summary.streak.studiedToday`<br>`summary.streak.message` | `number`<br>`number`<br>`boolean`<br>`string` | Chuỗi ngày học liên tục hiện tại.<br>Kỷ lục chuỗi ngày dài nhất.<br>Trạng thái hôm nay đã học chưa.<br>Thông điệp khích lệ chuỗi học. |
| **Card 4: Độ bền trí nhớ (AI)** | `summary.memoryStability.score`<br>`summary.memoryStability.changeVsLastWeek` | `number` (0-100)<br>`number` | Điểm độ bền trí nhớ trung bình quy đổi từ FSRS AI.<br>Mức tăng trưởng % so với tuần trước. |
| **Biểu đồ đường: Độ bền trí nhớ 30 ngày** | `stabilityTimeline` | `Array<{ label, date, value }>` | 4 mốc tuần (Tuần 1 -> Tuần 4) phục vụ vẽ đường biểu đồ tăng trưởng trí nhớ dài hạn. |
| **Biểu đồ tròn: Phân bố trạng thái thẻ** | `cardDistribution.mastered`<br>`cardDistribution.learning`<br>`cardDistribution.unlearned`<br>`cardDistribution.total` | `object: { count, percentage }`<br>`object: { count, percentage }`<br>`object: { count, percentage }`<br>`number` | Nhóm *Đã thuộc* (State REVIEW).<br>Nhóm *Đang học* (State LEARNING/RELEARNING).<br>Nhóm *Chưa học* (State NEW).<br>Tổng số thẻ. |
| **Biểu đồ cột: Hoạt động hàng ngày** | `dailyActivity` | `Array<{ day, date, newWords, reviews }>` | 7 ngày gần nhất (T2 -> CN). Cột xanh: số từ mới; Cột cam: số lượt ôn. |
| **Dải khích lệ chân trang** | `motivationalMessage` | `string` | Thông điệp thông minh sinh động theo trạng thái học tập của user. |

---

### 3. MOCK RESPONSE MẪU

```json
{
  "summary": {
    "totalWords": {
      "count": 842,
      "changeVsLastWeek": 12
    },
    "retentionRate7Days": {
      "rate": 87,
      "status": "EXCELLENT",
      "statusText": "Xuất sắc"
    },
    "streak": {
      "current": 15,
      "longest": 18,
      "studiedToday": true,
      "message": "🔥 Sắp lập kỷ lục mới rồi"
    },
    "memoryStability": {
      "score": 78,
      "changeVsLastWeek": 12
    }
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
    { "day": "T2", "date": "2026-10-10", "newWords": 5, "reviews": 11 },
    { "day": "T3", "date": "2026-10-11", "newWords": 9, "reviews": 8 },
    { "day": "T4", "date": "2026-10-12", "newWords": 14, "reviews": 16 },
    { "day": "T5", "date": "2026-10-13", "newWords": 4, "reviews": 10 },
    { "day": "T6", "date": "2026-10-14", "newWords": 12, "reviews": 8 },
    { "day": "T7", "date": "2026-10-15", "newWords": 8, "reviews": 15 },
    { "day": "CN", "date": "2026-10-16", "newWords": 16, "reviews": 6 }
  ],
  "motivationalMessage": "Bạn đang tiến bộ rất tốt! Hãy duy trì chuỗi ngày học để giữ vững đà bứt phá nhé. 🚀"
}
```

---

### 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (UNIT TESTS)

* File test: `backend/src/modules/progress/progress.service.spec.ts`
* Các ca kiểm thử đặc biệt đã pass:
  1. **Tài khoản mới toanh (Edge Case)**: Xử lý an toàn khi người dùng chưa có từ vựng hay lượt ôn nào (các giá trị trả về 0%, không bị crash server do lỗi chia cho 0 `NaN`).
  2. **Duy trì Streak thông minh**: Nếu người dùng hôm qua đã học nhưng hôm nay chưa học, chuỗi streak vẫn được bảo toàn (chỉ reset về 0 khi bỏ lỡ quá 1 ngày).
  3. **Phân loại tỷ lệ nhớ**: Tự động gán nhãn `EXCELLENT` (>=85%), `GOOD` (>=70%), `FAIR` (>=50%), `POOR` (<50%).
* **Tổng kết test toàn dự án:** `86/86 unit tests passed`.
