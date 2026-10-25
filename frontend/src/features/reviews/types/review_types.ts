import { DeckCard } from "@/features/vocabulary/types/vocabulary_types";

export interface ReviewCardData {
  cardId: string;
  word: DeckCard["word"];
}