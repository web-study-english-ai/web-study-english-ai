import { VocabularyFilters, VocabularyItem } from "../types/vocabulary_types";

const FAKE_DELAY = 400;

import { SRSRating, WordProgressRecord } from "../types/vocabulary_types";

const FAKE_DELAY_SHORT = 250;

const MOCK_VOCABULARY: VocabularyItem[] = [
  {
    id: "1",
    word: "Eloquent",
    ipa: "/ˈel.ə.kwənt/",
    type: "adj",
    meaningVi: "Hùng biện, lưu loát, trôi chảy",
    topic: "Giao tiếp",
    level: "B2",
    definition:
      "Hùng biện, có khả năng nói hoặc viết một cách trôi chảy, biểu cảm và đầy sức thuyết phục.",
    exampleEn: "She made an eloquent appeal for action on climate change.",
    exampleVi: "Cô ấy đã có một lời kêu gọi đầy sức thuyết phục về việc hành động chống lại biến đổi khí hậu.",
  },
  {
    id: "2",
    word: "Elaborate",
    ipa: "/ɪˈlæb.ər.ət/",
    type: "adj",
    meaningVi: "Tỉ mỉ, kỹ lưỡng, công phu",
    topic: "Giao tiếp",
    level: "B2",
    definition: "Được thực hiện hoặc thiết kế một cách tỉ mỉ, có nhiều chi tiết.",
    exampleEn: "They came up with an elaborate plan to solve the problem.",
    exampleVi: "Họ đã đưa ra một kế hoạch công phu để giải quyết vấn đề.",
  },
  {
    id: "3",
    word: "Elude",
    ipa: "/ɪˈluːd/",
    type: "v",
    meaningVi: "Tránh né, lảng tránh, vượt ngoài tầm hiểu biết",
    topic: "Giao tiếp",
    level: "B2",
    definition: "Tránh hoặc thoát khỏi ai đó/cái gì đó một cách khéo léo.",
    exampleEn: "The exact meaning of the poem eluded most readers.",
    exampleVi: "Ý nghĩa chính xác của bài thơ vượt ngoài tầm hiểu biết của hầu hết độc giả.",
  },
    {
    id: "4",
    word: "Happy",
    ipa: "/ˈhæp.i/",
    type: "adj",
    meaningVi: "Vui vẻ, hạnh phúc",
    topic: "Giao tiếp",
    level: "A1",
    definition: "Cảm thấy vui hoặc hài lòng.",
    exampleEn: "She feels happy when she sees her friends.",
    exampleVi: "Cô ấy cảm thấy vui khi gặp bạn bè.",
  },
  {
    id: "5",
    word: "Family",
    ipa: "/ˈfæm.əl.i/",
    type: "n",
    meaningVi: "Gia đình",
    topic: "Giao tiếp",
    level: "A1",
    definition: "Nhóm người có quan hệ huyết thống, gồm bố mẹ, con cái...",
    exampleEn: "I love spending time with my family.",
    exampleVi: "Tôi thích dành thời gian bên gia đình.",
  },
  {
    id: "6",
    word: "Work",
    ipa: "/wɜːrk/",
    type: "v",
    meaningVi: "Làm việc",
    topic: "Công việc",
    level: "A1",
    definition: "Thực hiện một công việc hoặc nhiệm vụ nào đó.",
    exampleEn: "He works at a hospital.",
    exampleVi: "Anh ấy làm việc ở bệnh viện.",
  },
  {
    id: "7",
    word: "Travel",
    ipa: "/ˈtræv.əl/",
    type: "v",
    meaningVi: "Đi du lịch, di chuyển",
    topic: "Du lịch",
    level: "A1",
    definition: "Di chuyển từ nơi này đến nơi khác, thường là để tham quan.",
    exampleEn: "We travel to a new country every summer.",
    exampleVi: "Chúng tôi đi du lịch đến một đất nước mới mỗi mùa hè.",
  },
  {
    id: "8",
    word: "School",
    ipa: "/skuːl/",
    type: "n",
    meaningVi: "Trường học",
    topic: "Học thuật",
    level: "A1",
    definition: "Nơi học sinh đến để học tập.",
    exampleEn: "My children go to school every day.",
    exampleVi: "Con tôi đi học mỗi ngày.",
  },
  {
    id: "9",
    word: "Easy",
    ipa: "/ˈiː.zi/",
    type: "adj",
    meaningVi: "Dễ dàng",
    topic: "Học thuật",
    level: "A1",
    definition: "Không khó, không tốn nhiều công sức để làm hoặc hiểu.",
    exampleEn: "This exercise is easy for beginners.",
    exampleVi: "Bài tập này dễ đối với người mới bắt đầu.",
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchVocabularyMock(
  filters: VocabularyFilters
): Promise<VocabularyItem[]> {
  await delay(FAKE_DELAY);

  return MOCK_VOCABULARY.filter((item) => {
    const matchQuery = filters.query
      ? item.word.toLowerCase().includes(filters.query.toLowerCase())
      : true;
    const matchTopic = filters.topic === "all" ? true : item.topic === filters.topic;
    const matchLevel = filters.level === "all" ? true : item.level === filters.level;
    return matchQuery && matchTopic && matchLevel;
  });
}

export async function addToDeckMock(wordId: string): Promise<{ success: true }> {
  await delay(300);
  return { success: true };
}

const INTERVAL_DAYS: Record<SRSRating, number> = {
  forgot: 0, // xem lại ngay trong phiên học tiếp theo
  hard: 1,
  medium: 3,
  easy: 7,
};

export async function getNewWordsBatchMock(count = 20): Promise<VocabularyItem[]> {
  await delay(FAKE_DELAY_SHORT);
  return MOCK_VOCABULARY.slice(0, count);
}

export async function saveWordProgressMock(
  wordId: string,
  rating: SRSRating,
  responseTimeMs: number,
  isIdle: boolean
): Promise<WordProgressRecord> {
  await delay(FAKE_DELAY_SHORT);

  const now = new Date();
  const nextReview = new Date(now);
  nextReview.setDate(now.getDate() + INTERVAL_DAYS[rating]);

  return {
    wordId,
    rating,
    responseTimeMs,
    isIdle,
    reviewedAt: now.toISOString(),
    nextReviewAt: nextReview.toISOString(),
  };
}