import { AttemptPayload, ReadingListParams } from "../types/reading_types";

const DELAY = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MockStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

const TOPICS = [
  { slug: "education", name: "Giáo dục" },
  { slug: "life", name: "Cuộc sống" },
  { slug: "travel", name: "Du lịch" },
  { slug: "environment", name: "Môi trường" },
  { slug: "technology", name: "Công nghệ" },
  { slug: "health", name: "Sức khỏe" },
  { slug: "work", name: "Công việc" },
];

// a) hàm make: thêm tham số cuối và đưa vào userProgress
function make(
  id: string,
  title: string,
  description: string,
  cefr: string,
  topicSlug: string,
  estimatedMinutes: number,
  totalQuestions: number,
  status: MockStatus,
  answeredCount = 0,
  correctCount = 0,
  durationSeconds?: number
) {
  return {
    id,
    title,
    description,
    cefr,
    topic: TOPICS.find((t) => t.slug === topicSlug) ?? TOPICS[0],
    estimatedMinutes,
    userProgress: { status, answeredCount, correctCount, totalQuestions, durationSeconds },
  };
}
// 5 bài đầu giống hệt mockup
const ITEMS = [
  make("r1", "The Path to Cognitive Mastery", "Khám phá cách ghi nhớ chủ động và rèn luyện tư duy giúp bạn học hiệu quả hơn.", "B1", "education", 15, 4, "IN_PROGRESS", 2, 0),
  make("r2", "A Day in My Life", "Những thói quen hằng ngày và cách sắp xếp một ngày thật đơn giản.", "A1", "life", 5, 5, "COMPLETED", 5, 5, 312),
  make("r3", "A Weekend in London", "Ghé thăm những địa điểm nổi tiếng và trải nghiệm một cuối tuần ở London.", "A2", "travel", 8, 6, "NOT_STARTED"),
  make("r4", "The Future of Green Cities", "Tìm hiểu cách các thành phố thay đổi để trở nên xanh và bền vững hơn.", "B2", "environment", 18, 8, "NOT_STARTED"),
  make("r5", "Rethinking Artificial Intelligence", "Nhìn lại vai trò của trí tuệ nhân tạo và những câu hỏi về trách nhiệm con người.", "C1", "technology", 20, 10, "NOT_STARTED"),
  make("r6", "My Family and Friends", "Giới thiệu các thành viên trong gia đình và những người bạn thân thiết của bạn.", "A1", "life", 4, 5, "COMPLETED", 5, 4, 268),
  make("r7", "Shopping at the Market", "Học cách hỏi giá, mặc cả và mua sắm ở chợ bằng những câu giao tiếp đơn giản.", "A1", "life", 5, 5, "NOT_STARTED"),
  make("r8", "Planning a Trip to Hanoi", "Lên kế hoạch cho một chuyến đi Hà Nội: đặt phòng, chọn món ăn và di chuyển.", "A2", "travel", 7, 5, "IN_PROGRESS", 3, 2),
  make("r9", "The Benefits of Regular Exercise", "Vì sao vận động đều đặn giúp cơ thể khỏe mạnh và tinh thần thoải mái hơn.", "B1", "health", 12, 6, "COMPLETED", 6, 5, 745),
  make("r10", "Working from Home: Pros and Cons", "Ưu và nhược điểm của làm việc tại nhà đối với năng suất và đời sống cá nhân.", "B1", "work", 14, 6, "NOT_STARTED"),
  make("r11", "The Rise of Remote Education", "Học trực tuyến đang thay đổi cách chúng ta tiếp cận kiến thức như thế nào.", "B2", "education", 16, 7, "NOT_STARTED"),
  make("r12", "Plastic in Our Oceans", "Rác thải nhựa ảnh hưởng đến đại dương và những cách giảm thiểu mỗi ngày.", "B2", "environment", 17, 8, "IN_PROGRESS", 4, 3),
  make("r13", "Cultural Differences in Business", "Hiểu sự khác biệt văn hóa để giao tiếp và làm việc hiệu quả trong môi trường quốc tế.", "C1", "work", 19, 9, "NOT_STARTED"),
  make("r14", "The Ethics of Gene Editing", "Những tranh luận đạo đức xoay quanh việc chỉnh sửa gen và tương lai y học.", "C1", "health", 22, 10, "NOT_STARTED"),
  make("r15", "A Short History of the Internet", "Hành trình phát triển của mạng toàn cầu từ những ngày đầu đến thời đại hiện nay.", "B2", "technology", 15, 8, "COMPLETED", 8, 6, 892),
];

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1"];
const rank = (c: string) => CEFR_ORDER.indexOf(c);

// mode: "full" | "empty" | "error" | "slow"
export async function getMockReadingListRaw(mode: string, params: ReadingListParams) {
  await delay(mode === "slow" ? 3000 : DELAY);
  if (mode === "error") throw new Error("Mock: lỗi tải danh sách bài đọc");

  if (mode === "empty") {
    return {
      items: [],
      topics: [],
      meta: { page: 1, limit: params.limit, total: 0, totalPages: 1 },
    };
  }

  const keyword = params.search.trim().toLowerCase();

  let list = withOverlay(ITEMS).filter((it) => {
    const matchSearch =
      !keyword ||
      it.title.toLowerCase().includes(keyword) ||
      it.description.toLowerCase().includes(keyword);
    const matchCefr = params.cefr === "all" || it.cefr === params.cefr;
    const matchTopic = params.topic === "all" || it.topic.slug === params.topic;
    const matchStatus = params.status === "all" || it.userProgress.status === params.status;
    return matchSearch && matchCefr && matchTopic && matchStatus;
  });

  if (params.sort === "cefr_asc") list = [...list].sort((a, b) => rank(a.cefr) - rank(b.cefr));
  if (params.sort === "cefr_desc") list = [...list].sort((a, b) => rank(b.cefr) - rank(a.cefr));

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  const page = Math.min(Math.max(params.page, 1), totalPages);
  const start = (page - 1) * params.limit;

  return {
    items: list.slice(start, start + params.limit),
    topics: TOPICS, // luôn trả đủ chủ đề để ô chọn không bị rút gọn khi đang lọc
    meta: { page, limit: params.limit, total, totalPages },
  };
}

// ===== Trang làm bài: chi tiết, lưu nháp, nộp bài =====

type MockDraft = AttemptPayload;

interface MockState {
  drafts: Record<string, MockDraft>;
  completed: Record<
    string,
    { correctCount: number; totalQuestions: number; durationSeconds?: number }
  >;
}

interface MockQuestion {
  id: string;
  orderIndex: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

const STATE_KEY = "reading_mock_state";

// Ba bài "Đang làm" trong danh sách có sẵn bản nháp tương ứng
const SEED: MockState = {
  drafts: {
    r1: {
      durationSeconds: 95,
      answers: [
        { questionId: "r1-q1", selectedOptionIndex: 1 },
        { questionId: "r1-q2", selectedOptionIndex: 0 },
      ],
    },
    r8: {
      durationSeconds: 140,
      answers: [
        { questionId: "r8-q1", selectedOptionIndex: 0 },
        { questionId: "r8-q2", selectedOptionIndex: 1 },
        { questionId: "r8-q3", selectedOptionIndex: 2 },
      ],
    },
    r12: {
      durationSeconds: 260,
      answers: [
        { questionId: "r12-q1", selectedOptionIndex: 0 },
        { questionId: "r12-q2", selectedOptionIndex: 0 },
        { questionId: "r12-q3", selectedOptionIndex: 1 },
        { questionId: "r12-q4", selectedOptionIndex: 0 },
      ],
    },
  },
  completed: {},
};

function writeState(state: MockState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
}

function readState(): MockState {
  const seed = (): MockState => JSON.parse(JSON.stringify(SEED));
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // dữ liệu hỏng thì dùng lại dữ liệu mẫu
  }
  const fresh = seed();
  writeState(fresh);
  return fresh;
}

// Phủ trạng thái bài đã làm lên danh sách tĩnh
function withOverlay(items: typeof ITEMS) {
  const state = readState();
  return items.map((it) => {
    const done = state.completed[it.id];
     if (done) {
      return {
        ...it,
        userProgress: {
          status: "COMPLETED" as const,
          answeredCount: done.totalQuestions,
          correctCount: done.correctCount,
          totalQuestions: done.totalQuestions,
          durationSeconds: done.durationSeconds ?? it.userProgress.durationSeconds,
        },
      };
    }
    const draft = state.drafts[it.id];
    if (draft) {
      return {
        ...it,
        userProgress: {
          ...it.userProgress,
          status: "IN_PROGRESS" as const,
          answeredCount: draft.answers.length,
          correctCount: 0,
        },
      };
    }
    return it;
  });
}

const R1_CONTENT = [
  "In any serious academic pursuit, students encounter obstacles that test their limits. Those who **persist** through these trials often develop deeper mental models of their subjects. Learning is not a linear climb; rather, it is a complex, iterative cycle where old concepts are constantly re-evaluated.",
  "Cognitive scientists argue that **simultaneous** multi-modal training—combining audio visual materials with written reviews—speeds up retention. Instead of passive cramming, active recall using spacing algorithms prompts the brain to solidify neural pathways. This is especially true in second language acquisition, where eloquence is rarely achieved by mere vocabulary lists, but through continuous contextual application.",
  "The concept of **iterative** learning suggests that revisiting previously studied material with fresh perspective accelerates mastery. Experts recommend breaking study sessions into shorter, focused intervals rather than long, exhausting marathons. This technique, known as distributed practice, has been shown to significantly improve long-term memory retention across all academic disciplines.",
  "Ultimately, cognitive mastery is not reserved for the naturally gifted. It is the result of deliberate, consistent effort combined with strategic learning methods. Students who embrace discomfort as an integral part of growth are those who ultimately achieve **eloquence** and expertise in their chosen fields.",
].join("\n");

const R1_QUESTIONS: MockQuestion[] = [
  {
    id: "r1-q1",
    orderIndex: 0,
    questionText: "What is the primary topic of the passage?",
    options: [
      "The architectural history of ancient universities.",
      "How persistent focus and effective learning strategies accelerate cognitive mastery.",
      "The economic benefits of online language platforms.",
      "Strategies for preparing balanced meals on a budget.",
    ],
    correctOptionIndex: 1,
    explanation:
      "Đoạn văn tập trung vào cách học hiệu quả: sự kiên trì, luyện tập chủ động và chia nhỏ thời gian học để đạt sự thành thạo nhận thức (cognitive mastery). Đây là nội dung xuyên suốt cả bài.",
  },
  {
    id: "r1-q2",
    orderIndex: 1,
    questionText: "Which word best matches the meaning of 'simultaneous' in paragraph 2?",
    options: [
      "Happening at the exact same time.",
      "Delayed or postponed over weeks.",
      "Characterized by high financial costs.",
      "Highly controversial or debated.",
    ],
    correctOptionIndex: 0,
    explanation:
      "“Simultaneous” nghĩa là xảy ra cùng một lúc. Đoạn văn nói về “simultaneous multi-modal training”: kết hợp nhiều hình thức học (âm thanh, hình ảnh, ôn viết) diễn ra đồng thời để tăng tốc độ ghi nhớ.",
  },
  {
    id: "r1-q3",
    orderIndex: 2,
    questionText: "According to the passage, what is 'distributed practice'?",
    options: [
      "Studying only one subject per day for long hours.",
      "Sharing study notes with classmates online.",
      "Breaking study sessions into shorter, focused intervals.",
      "Using flashcards exclusively for memorization.",
    ],
    correctOptionIndex: 2,
    explanation:
      "Đoạn 3 nêu rõ: các chuyên gia khuyên chia nhỏ buổi học thành những khoảng ngắn, tập trung thay vì học marathon dài. Kỹ thuật này gọi là distributed practice.",
  },
  {
    id: "r1-q4",
    orderIndex: 3,
    questionText:
      "True or False: The passage claims that cognitive mastery is only possible for naturally gifted people.",
    options: ["True", "False"],
    correctOptionIndex: 1,
    explanation:
      "Sai. Đoạn cuối khẳng định cognitive mastery không dành riêng cho người có năng khiếu bẩm sinh mà là kết quả của nỗ lực có chủ đích và phương pháp học phù hợp.",
  },
];

const GENERIC_STEMS = [
  "What is the main idea of the passage?",
  "Which statement is true according to the passage?",
  "What does the writer suggest in the second paragraph?",
  "Which word best describes the tone of the passage?",
  "What can be inferred from the passage?",
];

const GENERIC_OPTIONS = [
  "The writer’s main point",
  "A minor supporting detail",
  "An unrelated opinion",
  "A common misunderstanding",
];

function genericContent(item: (typeof ITEMS)[number]) {
  return [
    `**${item.title}** is a topic that many learners find interesting. In this passage, we look at the **key ideas** behind it and why they matter in everyday life.`,
    "Many people believe that small, **consistent** steps lead to better results than rare, intense effort. Experts often point out that **practice** and patience are more useful than talent alone.",
    "In conclusion, understanding this topic helps readers make better decisions. Whether you are a beginner or an advanced learner, the **main point** is the same: keep learning, stay curious, and apply what you read.",
  ].join("\n");
}

function genericQuestions(item: (typeof ITEMS)[number]): MockQuestion[] {
  return Array.from({ length: item.userProgress.totalQuestions }, (_, i) => {
    const id = `${item.id}-q${i + 1}`;

    // Cứ 4 câu có 1 câu True/False để test câu chỉ có 2 đáp án
    if (i % 4 === 3) {
      return {
        id,
        orderIndex: i,
        questionText: `True or False: The passage is mainly about “${item.title}”.`,
        options: ["True", "False"],
        correctOptionIndex: 0,
        explanation:
          "Đúng. Toàn bộ đoạn văn xoay quanh chủ đề của bài (nội dung giả lập để kiểm thử giao diện).",
      };
    }

    const correct = i % 4;
    const options = [...GENERIC_OPTIONS];
    [options[0], options[correct]] = [options[correct], options[0]]; // đưa đáp án đúng về vị trí `correct`

    return {
      id,
      orderIndex: i,
      questionText: GENERIC_STEMS[i % GENERIC_STEMS.length],
      options,
      correctOptionIndex: correct,
      explanation:
        "Đáp án đúng là “The writer’s main point” vì đây là ý chính được nhấn mạnh trong đoạn văn (nội dung giả lập để kiểm thử).",
    };
  });
}

function getMockQuestions(item: (typeof ITEMS)[number]): MockQuestion[] {
  return item.id === "r1" ? R1_QUESTIONS : genericQuestions(item);
}

// mode: "full" | "slow" | "error" | "save-error"
export async function getMockReadingDetailRaw(mode: string, id: string) {
  await delay(mode === "slow" ? 3000 : DELAY);
  if (mode === "error") throw new Error("Mock: lỗi tải bài đọc");

  const item = ITEMS.find((it) => it.id === id);
  if (!item) throw new Error("Mock: không tìm thấy bài đọc");

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    cefr: item.cefr,
    topic: item.topic,
    content: item.id === "r1" ? R1_CONTENT : genericContent(item),
    // Giống BE: chưa nộp bài thì không gửi đáp án đúng
    questions: getMockQuestions(item).map(({ id: qid, orderIndex, questionText, options }) => ({
      id: qid,
      orderIndex,
      questionText,
      options,
    })),
    draftAttempt: readState().drafts[id] ?? null,
  };
}

export async function mockSaveReadingDraft(
  mode: string,
  id: string,
  payload: AttemptPayload
): Promise<void> {
  await delay(300);
  if (mode === "save-error") throw new Error("Mock: lỗi lưu nháp");

  const state = readState();
  state.drafts[id] = payload;
  writeState(state);
}

export async function mockSubmitReading(
  mode: string,
  id: string,
  payload: AttemptPayload
): Promise<Record<string, unknown>> {
  await delay(800);
  if (mode === "save-error") throw new Error("Mock: lỗi nộp bài");

  const item = ITEMS.find((it) => it.id === id);
  if (!item) throw new Error("Mock: không tìm thấy bài đọc");

  const questions = getMockQuestions(item);
  const results = questions.map((q) => ({
    questionId: q.id,
    correctOptionIndex: q.correctOptionIndex,
    explanation: q.explanation,
  }));

  // Câu chưa trả lời tính là sai
  const correctCount = questions.filter(
    (q) =>
      payload.answers.find((a) => a.questionId === q.id)?.selectedOptionIndex ===
      q.correctOptionIndex
  ).length;

  const state = readState();
  delete state.drafts[id];
  state.completed[id] = { correctCount, totalQuestions: questions.length };
  writeState(state);

  state.completed[id] = {
    correctCount,
    totalQuestions: questions.length,
    durationSeconds: payload.durationSeconds,
  };

  return {
    correctCount,
    wrongCount: questions.length - correctCount,
    totalQuestions: questions.length,
    results,
  };
}