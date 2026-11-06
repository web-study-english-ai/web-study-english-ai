const DELAY = 900;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const KITCHEN = [
  { wordId: "w-kettle", term: "kettle", ipa: "/ˈket.əl/", pos: "NOUN", meaningVi: "ấm đun nước", exampleEn: "The kettle is boiling.", cefr: "B2", score: 0.72, inDeck: false },
  { wordId: "w-cabinet", term: "cabinet", ipa: "/ˈkæb.ɪ.nət/", pos: "NOUN", meaningVi: "tủ bếp", exampleEn: "Put the plates in the cabinet.", cefr: "B2", score: 0.55, inDeck: false },
  { wordId: "w-countertop", term: "countertop", ipa: "/ˈkaʊn.tə.tɒp/", pos: "NOUN", meaningVi: "mặt bếp", exampleEn: "Wipe the countertop after cooking.", cefr: "C1", score: 0.38, inDeck: false },
  { wordId: "w-refrigerator", term: "refrigerator", ipa: "/rɪˈfrɪdʒ.ə.reɪ.tər/", pos: "NOUN", meaningVi: "tủ lạnh", exampleEn: "Keep the milk in the refrigerator.", cefr: "B2", score: 0.27, inDeck: false },
  // Từ này đã có sẵn trong bộ thẻ, để test nhãn "Đã có trong bộ thẻ" và nút "Gắn ảnh"
  { wordId: "w-microwave", term: "microwave", ipa: "/ˈmaɪ.kroʊ.weɪv/", pos: "NOUN", meaningVi: "lò vi sóng", exampleEn: "Heat it in the microwave.", cefr: "B2", score: 0.18, inDeck: true },
];

// Thêm vài từ để thử tìm thủ công
const EXTRA = [
  { wordId: "w-apple", term: "apple", ipa: "/ˈæp.əl/", pos: "NOUN", meaningVi: "quả táo", exampleEn: "She ate an apple.", cefr: "A1", score: 0, inDeck: false },
  { wordId: "w-table", term: "table", ipa: "/ˈteɪ.bəl/", pos: "NOUN", meaningVi: "cái bàn", exampleEn: "Put it on the table.", cefr: "A1", score: 0, inDeck: false },
  { wordId: "w-chair", term: "chair", ipa: "/tʃer/", pos: "NOUN", meaningVi: "cái ghế", exampleEn: "Take a chair.", cefr: "A1", score: 0, inDeck: false },
  { wordId: "w-window", term: "window", ipa: "/ˈwɪn.doʊ/", pos: "NOUN", meaningVi: "cửa sổ", exampleEn: "Open the window.", cefr: "A1", score: 0, inDeck: false },
];

const ALL = [...KITCHEN, ...EXTRA];

// mode: "full" | "low" | "empty" | "degraded" | "unavailable" | "error" | "slow"
//       "add-error" | "limit" | "search-error"
export async function getMockDetectRaw(mode: string) {
  await delay(mode === "slow" ? 3000 : DELAY);

  if (mode === "unavailable") {
    throw Object.assign(new Error("Mock: 503 Service Unavailable"), { status: 503 });
  }
  if (mode === "error") throw new Error("Mock: lỗi mạng");

  const base = {
    imageUrl: "https://example.com/mock-vision-image.jpg",
    tau: 0.1,
    latencyMs: 380,
  };

  if (mode === "degraded") return { ...base, items: [], lowConfidence: false, degraded: true };
  if (mode === "empty") return { ...base, items: [], lowConfidence: true, degraded: false };
  if (mode === "low") {
    return {
      ...base,
      items: [
        { ...KITCHEN[0], score: 0.12 },
        { ...KITCHEN[1], score: 0.09 },
      ],
      lowConfidence: true,
      degraded: false,
    };
  }

  return { ...base, items: KITCHEN, lowConfidence: false, degraded: false };
}

export async function getMockSearchRaw(mode: string, term: string) {
  await delay(400);
  if (mode === "search-error") throw new Error("Mock: lỗi tìm từ");

  const keyword = term.trim().toLowerCase();
  return {
    items: ALL.filter(
      (w) => w.term.includes(keyword) || w.meaningVi.toLowerCase().includes(keyword)
    ).slice(0, 8),
  };
}

export async function mockAddCards(
  mode: string,
  payload: { wordIds: string[]; force: boolean }
) {
  await delay(600);
  if (mode === "add-error") throw new Error("Mock: lỗi thêm vào bộ thẻ");
  if (mode === "limit" && !payload.force) {
    throw Object.assign(new Error("Mock: 409 vượt hạn mức từ mới trong ngày"), { status: 409 });
  }

  const skipped = payload.wordIds.filter((id) =>
    ALL.some((w) => w.wordId === id && w.inDeck)
  ).length;
  const added = payload.wordIds.length - skipped;

  return {
    added,
    skippedExisting: skipped,
    notFound: [] as string[],
    exceededLimit: [] as string[],
    newCardCount: added,
    message:
      skipped > 0
        ? `Đã thêm ${added} thẻ, cập nhật ảnh cho ${skipped} thẻ đã có.`
        : `Đã thêm ${added} thẻ vào bộ thẻ.`,
  };
}