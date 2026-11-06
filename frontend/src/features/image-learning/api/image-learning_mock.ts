const DELAY = 900;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 4 từ đầu giống mockup, từ thứ 5 đã có sẵn trong bộ thẻ để test trạng thái "inDeck"
const KITCHEN = [
  { wordId: "w-kettle", term: "kettle", ipa: "/ˈket.əl/", pos: "NOUN", meaningVi: "ấm đun nước", exampleEn: "The kettle is boiling.", cefr: "B2", score: 0.98, inDeck: false },
  { wordId: "w-cabinet", term: "cabinet", ipa: "/ˈkæb.ɪ.nət/", pos: "NOUN", meaningVi: "tủ bếp", exampleEn: "Put the plates in the cabinet.", cefr: "B2", score: 0.94, inDeck: false },
  { wordId: "w-countertop", term: "countertop", ipa: "/ˈkaʊn.tə.tɒp/", pos: "NOUN", meaningVi: "mặt bếp", exampleEn: "Wipe the countertop after cooking.", cefr: "C1", score: 0.91, inDeck: false },
  { wordId: "w-refrigerator", term: "refrigerator", ipa: "/rɪˈfrɪdʒ.ə.reɪ.tər/", pos: "NOUN", meaningVi: "tủ lạnh", exampleEn: "Keep the milk in the refrigerator.", cefr: "B2", score: 0.87, inDeck: false },
  { wordId: "w-microwave", term: "microwave", ipa: "/ˈmaɪ.kroʊ.weɪv/", pos: "NOUN", meaningVi: "lò vi sóng", exampleEn: "Heat it in the microwave.", cefr: "B2", score: 0.79, inDeck: true },
];

// mode: "full" | "low" | "empty" | "degraded" | "unavailable" | "error" | "slow" | "add-error"
export async function getMockDetectRaw(mode: string) {
  await delay(mode === "slow" ? 3000 : DELAY);

  if (mode === "unavailable") {
    throw Object.assign(new Error("Mock: 503 Service Unavailable"), { status: 503 });
  }
  if (mode === "error") throw new Error("Mock: lỗi mạng");

  const base = {
    imageUrl: "https://example.com/mock-vision-image.jpg",
    tau: 0.24,
    latencyMs: 380,
  };

  if (mode === "degraded") return { ...base, items: [], lowConfidence: false, degraded: true };
  if (mode === "empty") return { ...base, items: [], lowConfidence: true, degraded: false };
  if (mode === "low") {
    return {
      ...base,
      items: [
        { ...KITCHEN[0], score: 0.31 },
        { ...KITCHEN[1], score: 0.27 },
      ],
      lowConfidence: true,
      degraded: false,
    };
  }

  return { ...base, items: KITCHEN, lowConfidence: false, degraded: false };
}

export async function mockAddCards(mode: string): Promise<void> {
  await delay(600);
  if (mode === "add-error") throw new Error("Mock: lỗi thêm vào bộ thẻ");
}