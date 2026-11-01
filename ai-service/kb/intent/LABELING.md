# Hướng dẫn gán nhãn ý định câu hỏi — WSEA-112

Bộ dữ liệu này dạy trợ lý nhận ra người học đang hỏi **loại** câu hỏi gì, để
(1) chặn sớm câu lạc đề mà không gọi LLM, (2) chọn nguồn truy hồi và
(3) chọn khuôn prompt phù hợp. Nhãn KHÔNG quyết định nội dung câu trả lời.

## 1. Bộ nhãn (5 nhãn)

| Nhãn | Khi nào gán | Dấu hiệu thường gặp | Ví dụ |
|---|---|---|---|
| `nghia_tu` | Hỏi nghĩa, dịch **một từ hoặc cụm từ**, từ đồng nghĩa / trái nghĩa | "nghĩa là gì", "dịch", "tiếng Anh là gì", "đồng nghĩa với" | "borrow nghĩa là gì?" · "mượn tiếng anh là gì" · "từ trái nghĩa của generous" |
| `cach_dung` | Cách dùng **một từ cụ thể**: giới từ đi kèm, dạng động từ đi sau, kết hợp từ, sắc thái, đặt câu | "đi với giới từ gì", "dùng thế nào", "đặt câu với", "có trang trọng không" | "interested đi với giới từ gì?" · "suggest + V-ing hay to V?" · "đặt câu với improve" |
| `ngu_phap` | Quy tắc, cấu trúc, thì **chung**, không xoay quanh một từ; sửa / kiểm tra / dịch **cả câu** | "cấu trúc", "công thức", "khi nào dùng thì", "câu này đúng không", "sửa giúp" | "câu điều kiện loại 2 dùng khi nào" · "bị động thì hiện tại hoàn thành" · "She go to school sai ở đâu" |
| `phan_biet` | So sánh **từ 2 lựa chọn trở lên** (từ, cụm, cấu trúc, thì) | "khác nhau", "phân biệt", "hay", "vs", "so với", "khi nào dùng A khi nào dùng B" | "say và tell khác gì" · "since hay for" · "much vs many" · "make a decision hay do a decision" |
| `ngoai_pham_vi` | Không phải từ vựng / ngữ pháp tiếng Anh: chuyện ngoài lề, chào hỏi, ngôn ngữ khác, phát âm, phương pháp học, thi cử, nhờ làm việc khác | — | "thời tiết Hà Nội" · "chào bạn" · "viết code python" · "though phát âm sao" · "mỗi ngày nên học bao nhiêu từ" · "luyện IELTS thế nào" |

## 2. Luật ưu tiên khi một câu khớp nhiều nhãn

`ngoai_pham_vi` > `phan_biet` > `nghia_tu` > `cach_dung` > `ngu_phap`

Lý do: lạc đề phải chặn trước; câu có 2 lựa chọn cần khuôn so sánh dù kèm hỏi
nghĩa; hỏi nghĩa một từ thì tra từ điển trước rồi mới tới cách dùng.

## 3. Ca khó đã chốt

| Câu | Nhãn | Lý do |
|---|---|---|
| "affect nghĩa là gì, cho ví dụ" | `nghia_tu` | Hỏi nghĩa là chính, ví dụ là phụ |
| "affect và effect nghĩa là gì" | `phan_biet` | Có 2 lựa chọn → ưu tiên so sánh |
| "suggest đi với V-ing hay to V" | `cach_dung` | Xoay quanh một từ cụ thể (2 lựa chọn là dạng động từ, không phải 2 từ) |
| "remind dùng of hay about" · "agree with / to / on" | `cach_dung` | Giới từ đi sau MỘT từ cụ thể, không phải so sánh 2 từ (chốt 01/11) |
| "danh từ của decide" · "tính từ của danger" | `cach_dung` | Hỏi dạng từ (word form) của một từ cụ thể (chốt 01/11) |
| "muốn nói lời chúc mừng sinh nhật thì dùng cụm gì" | `nghia_tu` | Tìm từ / cụm tương đương cho một ý hay tình huống, không có từ cho trước (chốt 01/11) |
| "take off có giống leave không" | `phan_biet` | Hỏi hai từ / cụm có đồng nghĩa không → có 2 lựa chọn, ưu tiên so sánh (chốt 01/11) |
| "câu bị động thì hiện tại và quá khứ viết thế nào" | `ngu_phap` | Hỏi cấu trúc của từng cái, KHÔNG hỏi khác nhau (chốt 01/11) |
| "sau những động từ nào thì dùng V-ing" | `ngu_phap` | Quy tắc chung, không có từ cụ thể |
| "V-ing và to V khác nhau thế nào" | `phan_biet` | So sánh 2 cấu trúc |
| "dịch giúp: tôi đã sống ở đây 5 năm" | `ngu_phap` | Dịch cả câu → giải thích theo cấu trúc |
| "dịch giúp từ 'kiên nhẫn'" | `nghia_tu` | Dịch một từ |
| "She don't like it đúng không" | `ngu_phap` | Kiểm tra cả câu |
| "in time với on time" | `phan_biet` | 2 cụm |
| "khi nào dùng thì hiện tại hoàn thành" | `ngu_phap` | Một thì, không so sánh |
| "hiện tại hoàn thành với quá khứ đơn" | `phan_biet` | 2 thì |
| "từ đồng nghĩa với big" | `nghia_tu` | Hỏi từ tương đương |
| "though đọc thế nào" | `ngoai_pham_vi` | Phát âm đã cắt khỏi phạm vi, kho không có |
| "cảm ơn nhé" / "bạn là ai" | `ngoai_pham_vi` | Không phải câu hỏi học tập |
| "tiếng Nhật 'arigatou' nghĩa là gì" | `ngoai_pham_vi` | Không phải tiếng Anh |
| "cho mình 10 từ về chủ đề du lịch" | `ngoai_pham_vi` | Yêu cầu sinh danh sách, không phải hỏi nghĩa / cách dùng |

Gặp câu không thuộc bảng trên: áp luật mục 2. Vẫn phân vân → ghi vào cột
`note`, KHÔNG tự đặt thêm nhãn. Cuối buổi gom các câu có `note` để chốt luật mới
và bổ sung bảng này (ghi ngày chốt).

## 4. Quy ước khi viết câu

- **Ngôn ngữ (mỗi nhãn, xấp xỉ):** 55% tiếng Việt có dấu · 15% tiếng Việt
  không dấu · 15% tiếng Việt chen từ tiếng Anh · 15% tiếng Anh.
- **Độ dài:** trộn câu cụt (2–4 từ: "since vs for", "nghia cua borrow") và câu
  dài có bối cảnh ("mình đang làm bài tập, câu này điền since hay for vậy?").
- **Giữ lỗi tự nhiên:** viết thường, thiếu dấu hỏi, sai chính tả nhẹ, teen code
  vừa phải ("ko", "j", "dc").
- **Chống lặp khung:** một khung câu (vd "X nghĩa là gì") tối đa 3 lần mỗi nhãn,
  phải đổi từ VÀ đổi cách hỏi. Từ được hỏi nên trải đủ A1–B2.
- **Không chép** câu trong `kb/eval_questions.csv`, `kb/eval_negatives.csv` hay
  bộ 60 câu kiểm thử trợ lý của Phúc (script sẽ assert).

## 5. Định dạng file

`kb/intent/intent_train.csv` và `kb/intent/intent_test.csv`, UTF-8, LF, các cột:

| Cột | Giá trị |
|---|---|
| `id` | `it_0001`… (train) · `ie_0001`… (test) |
| `text` | Câu hỏi nguyên văn |
| `label` | Một trong 5 nhãn ở mục 1 |
| `lang` | `vi` · `vi_nodau` · `mixed` · `en` |
| `author` | `hieu` · `llm` · `phuc` · `tam` · `duyanh` · `binh` |
| `note` | Trống, hoặc lý do phân vân |

Không mở / lưu CSV bằng Excel (Excel đổi mã hoá và tự sửa dữ liệu).

## 6. Chia tập — theo NGƯỜI VIẾT

- **Train (400):** Hiếu viết tay 100 + LLM nháp 300 (Hiếu duyệt từng câu).
- **Test (100):** Phúc, Tâm, Duy Anh, Bình mỗi người 25 câu (5 câu/nhãn), chỉ
  được xem bảng mục 1, không xem ví dụ của người khác.

Lý do: nếu train và test cùng người viết, mô hình học văn phong thay vì ý định
và độ chính xác bị thổi phồng (cùng tinh thần chia theo người dùng ở bài dự
báo quên). Câu test gần trùng câu train (cosine e5 ≥ 0,92) bị loại khỏi train.

## 7. Kiểm nhất quán

- Phúc gán nhãn mù 100 câu ngẫu nhiên của train (seed cố định) chỉ dựa vào
  file này → tính Cohen's κ. Mục tiêu κ ≥ 0,8.
- Câu lệch: đọc lại luật, sửa luật nếu mơ hồ, rồi mới sửa nhãn train.
- **Tập test chốt nhãn TRƯỚC khi huấn luyện; không sửa nhãn test sau khi xem
  kết quả mô hình.**
