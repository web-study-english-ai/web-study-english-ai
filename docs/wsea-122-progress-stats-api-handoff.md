# TÀI LIỆU BÀN GIAO KỸ THUẬT & API CONTRACT: WSEA-122
## API THỐNG KÊ TIẾN ĐỘ HỌC TẬP (PROGRESS STATS API)

* **Mã task Jira:** `WSEA-122` (Backend) & `WSEA-116` (Frontend)
* **Kỹ sư phụ trách:** Phạm Thái Bình (DevOps / Backend)
* **Bên tiếp nhận:** Frontend Team (TV), QA/Tester Team, Project Manager
* **Trạng thái:** Hoàn thành & Đã đồng bộ 100% với Frontend (Tests & Next.js Build Passed)
* **Ngày cập nhật:** 19/10/2026 (Tích hợp cùng PR #73 / WSEA-118)

---

### 1. THÔNG TIN ENDPOINT & XÁC THỰC

* **Phương thức:** `GET`
* **Đường dẫn:** `/api/progress/stats`
* **Base URL (Staging):** `https://web-study-english-ai.onrender.com/api/progress/stats`
* **Base URL (Local):** `http://localhost:3001/api/progress/stats`
* **Xác thực (Auth):** Bắt buộc (`JwtAuthGuard`). 
  * Header: `Authorization: Bearer <access_token>`
  * *Lưu ý Frontend:* Sử dụng hàm `apiFetch<ProgressStats>('/progress/stats')` từ `@/lib/api/client` để tự động truyền token và tự refresh khi hết hạn.

---

### 2. CẤU TRÚC DỮ LIỆU ĐỒNG BỘ FRONTEND (WSEA-116 MAPPING)

API hỗ trợ đồng thời cả **Trường phẳng (Flat fields)** mà giao diện màn hình `WSEA-116` đang dùng và **Trường mở rộng (Detailed fields)**:

#### 2.1. Các trường phẳng giao diện đang sử dụng (Core UI):
| Trường JSON | Kiểu dữ liệu | Vị trí hiển thị trên giao diện (`/progress`) |
| :--- | :--- | :--- |
| `totalWords` | `number` | Thẻ **Tổng từ đã học** (số lượng từ lớn, ví dụ: `842 từ`). |
| `weeklyGain` | `number` | Thẻ **Tổng từ đã học** (`+12 từ so với tuần trước`). |
| `statusCounts` | `object` | Dòng trạng thái nhỏ dưới thẻ tổng từ: `Đã thuộc {mastered} · Đang học {learning} · Chưa học {notLearned}`. |
| `retentionRate7d` | `number` (0-100) | Thẻ **Tỷ lệ ghi nhớ 7 ngày** (hiển thị `%` và nhãn Xuất sắc/Tốt/Trung bình/Cần cố gắng). |
| `streakDays` | `number` | Thẻ **Chuỗi ngày liên tục** (số ngày học liên tiếp hiện tại). |
| `bestStreakDays` | `number` | Thẻ **Chuỗi ngày liên tục** (kỷ lục chuỗi ngày dài nhất của học viên). |
| `totalWordsTimeline` | `Array<{ label, total }>` | Biểu đồ đường **Tổng số từ theo thời gian** (4 mốc tuần Tuần 1 $\to$ Tuần 4). |

#### 2.2. Các trường chi tiết mở rộng:
* `summary`: Chi tiết đối tượng thống kê.
* `cardDistribution`: Tỷ lệ phần trăm và số lượng thẻ theo nhóm.
* `dailyActivity`: Hoạt động 7 ngày gần nhất (T2 đến CN).
* `motivationalMessage`: Thông điệp động khích lệ học viên.

---

### 3. MOCK RESPONSE MẪU HOÀN CHỈNH

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

### 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG & ĐỒNG BỘ
* **Unit Tests Backend:** `86/86 unit tests passed` (trong đó có 3 tests kiểm thử toàn diện `ProgressService`).
* **Frontend Tests:** `vitest run` pass 100%, `eslint` 0 error.
* **Xử lý an toàn:** Khi tài khoản mới toanh chưa có từ vựng hay lượt ôn nào, toàn bộ trả về 0 an toàn không lỗi chia cho 0 `NaN`.
