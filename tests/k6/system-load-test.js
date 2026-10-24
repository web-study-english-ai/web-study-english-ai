import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ==============================================================================
// KỊCH BẢN KIỂM THỬ HIỆU NĂNG HỆ THỐNG - WSEA-137
// Hệ thống: Web Study English AI (WSEA)
// Mục tiêu: Đo lường Throughput, Latency (p90, p95), Error Rate dưới tải đồng thời
// ==============================================================================

// Cấu hình môi trường mục tiêu (mặc định localhost:3001 hoặc truyền qua -e TARGET_URL=...)
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3001';

// Custom Metrics theo dõi riêng từng API trọng yếu
const healthDuration = new Trend('wsea_health_duration_ms');
const authLoginDuration = new Trend('wsea_auth_login_duration_ms');
const vocabListDuration = new Trend('wsea_vocab_list_duration_ms');
const vocabSearchDuration = new Trend('wsea_vocab_search_duration_ms');
const progressStatsDuration = new Trend('wsea_progress_stats_duration_ms');
const successfulRequests = new Counter('wsea_successful_requests');
const failedRequests = new Counter('wsea_failed_requests');

// Load Profile (Mô phỏng người dùng đồng thời)
export const options = {
  stages: [
    { duration: '15s', target: 10 }, // Ramp-up lên 10 VUs
    { duration: '30s', target: 30 }, // Tăng dần lên 30 VUs (Tải trung bình)
    { duration: '30s', target: 50 }, // Tải cao điểm 50 VUs (Peak load)
    { duration: '15s', target: 0 },  // Ramp-down hạ tải về 0
  ],
  thresholds: {
    // Tỷ lệ lỗi toàn hệ thống phải dưới 1%
    http_req_failed: ['rate<0.01'],
    // 95% số request phải phản hồi dưới 800ms
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    // SLA cho các endpoint cốt lõi
    wsea_health_duration_ms: ['p(95)<150'],
    wsea_vocab_list_duration_ms: ['p(95)<500'],
  },
};

export default function () {
  const commonHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // --------------------------------------------------------------------------
  // BƯỚC 1: HEALTH CHECK & DATABASE CONNECTIVITY (PUBLIC)
  // --------------------------------------------------------------------------
  const healthRes = http.get(`${BASE_URL}/health`);
  healthDuration.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    'Health Check status is 200': (r) => r.status === 200,
    'Database is UP': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.database && body.database.status === 'up';
      } catch (e) {
        return false;
      }
    },
  });
  if (healthOk) successfulRequests.add(1);
  else failedRequests.add(1);

  sleep(0.5);

  // --------------------------------------------------------------------------
  // BƯỚC 2: XÁC THỰC NGƯỜI DÙNG (AUTH LOGIN)
  // --------------------------------------------------------------------------
  const loginPayload = JSON.stringify({
    email: 'admin@gmail.com',
    password: '123',
  });

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
    headers: commonHeaders,
  });
  authLoginDuration.add(loginRes.timings.duration);

  let token = '';
  const loginOk = check(loginRes, {
    'Login status is 200': (r) => r.status === 200,
    'Token returned': (r) => {
      try {
        const body = JSON.parse(r.body);
        token = body.accessToken || '';
        return !!token;
      } catch (e) {
        return false;
      }
    },
  });
  if (loginOk) successfulRequests.add(1);
  else failedRequests.add(1);

  sleep(0.5);

  // Nếu đăng nhập thành công, tiếp tục kiểm thử các API nghiệp vụ có xác thực
  if (token) {
    const authHeaders = {
      ...commonHeaders,
      Authorization: `Bearer ${token}`,
    };

    // ------------------------------------------------------------------------
    // BƯỚC 3: TRUY VẤN DANH SÁCH 7.000 TỪ VỰNG (PAGINATION)
    // ------------------------------------------------------------------------
    const vocabListRes = http.get(`${BASE_URL}/api/words?page=1&limit=20`, {
      headers: authHeaders,
    });
    vocabListDuration.add(vocabListRes.timings.duration);
    const vocabListOk = check(vocabListRes, {
      'Vocab List status is 200': (r) => r.status === 200,
      'Vocab List has items': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items) && body.items.length > 0;
        } catch (e) {
          return false;
        }
      },
    });
    if (vocabListOk) successfulRequests.add(1);
    else failedRequests.add(1);

    sleep(0.5);

    // ------------------------------------------------------------------------
    // BƯỚC 4: TÌM KIẾM TỪ VỰNG THEO TỪ KHÓA & BẬC CEFR B1
    // ------------------------------------------------------------------------
    const vocabSearchRes = http.get(
      `${BASE_URL}/api/words?search=learn&cefr=B1`,
      { headers: authHeaders }
    );
    vocabSearchDuration.add(vocabSearchRes.timings.duration);
    const vocabSearchOk = check(vocabSearchRes, {
      'Vocab Search status is 200': (r) => r.status === 200,
    });
    if (vocabSearchOk) successfulRequests.add(1);
    else failedRequests.add(1);

    sleep(0.5);

    // ------------------------------------------------------------------------
    // BƯỚC 5: TÍNH TOÁN TIẾN ĐỘ HỌC TẬP (PROGRESS STATS)
    // ------------------------------------------------------------------------
    const progressRes = http.get(`${BASE_URL}/api/progress/stats?range=week`, {
      headers: authHeaders,
    });
    progressStatsDuration.add(progressRes.timings.duration);
    const progressOk = check(progressRes, {
      'Progress Stats status is 200': (r) => r.status === 200,
    });
    if (progressOk) successfulRequests.add(1);
    else failedRequests.add(1);
  }

  // Nghỉ 1s giữa các vòng lặp để mô phỏng thời gian đọc/thao tác của học viên (Think time)
  sleep(1);
}
