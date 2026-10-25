import { ChatMessage } from "../types/ai-chat_types";

const FAKE_DELAY = 1200;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function sendChatMessageMock(question: string): Promise<ChatMessage> {
  await delay(FAKE_DELAY);
  const q = question.toLowerCase();

  if (q.includes("affect") || q.includes("effect")) {
    return {
      id: makeId(),
      role: "assistant",
      content:
        "Đây là lỗi rất phổ biến. Điểm mấu chốt để phân biệt nhanh là dựa vào từ loại:\n" +
        "• **AFFECT** thường là một **ĐỘNG TỪ (Verb)** - mang nghĩa là ảnh hưởng hay tác động đến điều gì.\n" +
        "• **EFFECT** thường là một **DANH TỪ (Noun)** - mang nghĩa là kết quả, tác động, hoặc hiệu ứng của việc gì đó.",
      examples: [
        {
          label: "Verb (Affect)",
          en: "The cold weather **affected** our crops.",
          vi: "Thời tiết lạnh đã tác động đến mùa màng của chúng tôi.",
        },
        {
          label: "Noun (Effect)",
          en: "The new law had a great **effect** on the economy.",
          vi: "Luật mới đã có tác động lớn đến nền kinh tế.",
        },
      ],
      sources: [
        { id: "s1", title: "Cambridge Dictionary", url: "https://dictionary.cambridge.org" },
        {
          id: "s2",
          title: "Oxford Learner's Dictionaries",
          url: "https://www.oxfordlearnersdictionaries.com",
        },
      ],
    };
  }

  return {
    id: makeId(),
    role: "assistant",
    content:
      "Đây là phản hồi mẫu (chế độ demo). Khi nối với Backend, câu trả lời thật của trợ lý AI sẽ hiện ở đây, kèm nguồn tham chiếu nếu có.",
  };
}