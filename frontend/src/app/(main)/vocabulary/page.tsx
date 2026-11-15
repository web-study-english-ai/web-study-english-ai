"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shared/PageContainer";
import { VocabularySearchBar } from "@/features/vocabulary/components/VocabularySearchBar";
import { VocabularyResultItem } from "@/features/vocabulary/components/VocabularyResultItem";
import { VocabularyDetailPanel } from "@/features/vocabulary/components/VocabularyDetailPanel";
import { VocabularyDeckList } from "@/features/vocabulary/components/VocabularyDeckList";
import { DeckStatusBar } from "@/features/vocabulary/components/DeckStatusBar";
import { useVocabularySearch } from "@/features/vocabulary/hooks/useVocabularySearch";
import { useVocabularyDeck } from "@/features/vocabulary/hooks/useVocabularyDeck";
import { useTopics } from "@/features/vocabulary/hooks/useTopics";
import {
  DeckCard,
  DeckStatusFilter,
  isCardLearned,
} from "@/features/vocabulary/types/vocabulary_types";
import { toast } from "@/components/ui/toast";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Số thẻ mỗi trang ở tab "Bộ thẻ của tôi", giống limit=20 của tab tìm kiếm
const DECK_PAGE_SIZE = 20;

export default function VocabularyPage() {
  const {
    filters,
    setFilters,
    results,
    selected,
    setSelected,
    rawSelected,
    isLoading,
    isError,
    error,
    page,
    setPage,
    meta,
    refetch,
  } = useVocabularySearch();
  const {
    deck,
    isInDeck,
    cardIdCuaTu,
    themTu,
    xoaThe,
    canhBaoHanMuc,
    themDuVuotHanMuc,
    boQuaCanhBao,
  } = useVocabularyDeck();
  const [selectedDeckItem, setSelectedDeckItem] = useState<DeckCard | null>(null);
  const [deckFilter, setDeckFilter] = useState<DeckStatusFilter>("all");
  const [deckPage, setDeckPage] = useState(1);
  const topics = useTopics();

  const learnedCount = deck.filter(isCardLearned).length;
  const notLearnedCount = deck.length - learnedCount;
  const visibleDeck =
    deckFilter === "all"
      ? deck
      : deck.filter((c) => isCardLearned(c) === (deckFilter === "learned"));

  const deckTotalPages = Math.max(1, Math.ceil(visibleDeck.length / DECK_PAGE_SIZE));
  // Kẹp lại để khi xóa thẻ cuối của trang cuối thì tự lùi về trang trước, không bị trang trống
  const currentDeckPage = Math.min(deckPage, deckTotalPages);
  const pagedDeck = visibleDeck.slice(
    (currentDeckPage - 1) * DECK_PAGE_SIZE,
    currentDeckPage * DECK_PAGE_SIZE
  );

  // Dùng chung cho nút thùng rác ở tab tìm kiếm và tab Bộ thẻ của tôi
  async function handleRemoveCard(cardId: string) {
    try {
      await xoaThe(cardId);
      if (selectedDeckItem?.id === cardId) setSelectedDeckItem(null);
    } catch {
      toast.add({
        title: "Không thể xóa khỏi bộ thẻ",
        description: "Vui lòng thử lại.",
        type: "error",
      });
    }
  }

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold text-foreground">Quản lý từ vựng</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tìm kiếm, lọc và thêm từ vựng vào bộ thẻ học của bạn.
      </p>
      {canhBaoHanMuc && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-800">{canhBaoHanMuc.message}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void themDuVuotHanMuc()}>
              Vẫn thêm
            </Button>
            <Button size="sm" variant="outline" onClick={boQuaCanhBao}>
              Để mai học
            </Button>
          </div>
        </div>
      )}
      <Tabs defaultValue="search" className="mt-6">
        <TabsList>
          <TabsTrigger value="search" onClick={() => void refetch()}>
            Tìm kiếm & khám phá
          </TabsTrigger>
          <TabsTrigger value="deck">Bộ thẻ của tôi ({deck.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <VocabularySearchBar filters={filters} topics={topics} onChange={setFilters} />

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            {/* Trên mobile: ẩn danh sách khi đã chọn 1 từ để xem chi tiết. Từ lg trở lên luôn hiện. */}
            <div className={`space-y-3 ${rawSelected ? "hidden lg:block" : ""}`}>
              {isLoading && <LoadingState text="Đang tìm kiếm..." />}

              {isError && (
                <ErrorState
                  message={error instanceof Error ? error.message : "Không thể tải danh sách từ vựng."}
                  onRetry={() => refetch()}
                />
              )}

              {!isLoading && !isError && results.length === 0 && (
                <EmptyState message="Không tìm thấy từ vựng phù hợp." />
              )}

              {!isLoading &&
                !isError &&
                results.map((item) => (
                  <VocabularyResultItem
                    key={item.id}
                    item={item}
                    isActive={selected?.id === item.id}
                    isAdded={isInDeck(item.id)}
                    onSelect={() => setSelected(item)}
                    onAdd={async () => {
                      try {
                        await themTu(item.id);
                      } catch {
                        toast.add({
                          title: "Không thể thêm từ vào bộ thẻ",
                          description: "Vui lòng thử lại.",
                          type: "error",
                        });
                      }
                    }}
                    onRemove={() => {
                      const cardId = cardIdCuaTu(item.id);
                      return cardId ? handleRemoveCard(cardId) : Promise.resolve();
                    }}
                  />
                ))}

              {!isLoading && !isError && meta && meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Trước
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Trang {meta.page} / {meta.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Trên mobile: chỉ hiện khi đã chọn 1 từ, thay thế hẳn danh sách. Từ lg trở lên luôn hiện song song. */}
            <div className={`lg:sticky lg:top-20 lg:self-start ${rawSelected ? "" : "hidden lg:block"}`}>
              <VocabularyDetailPanel
                wordId={selected?.id ?? null}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deck" className="mt-4">
          {deck.length > 0 && (
            // Trên mobile: ẩn thanh trạng thái khi đang xem chi tiết một thẻ
            <div className={selectedDeckItem ? "hidden lg:block" : ""}>
              <DeckStatusBar
                filter={deckFilter}
                onFilterChange={(f) => {
                  setDeckFilter(f);
                  setDeckPage(1);
                  setSelectedDeckItem(null);
                }}
                total={deck.length}
                learned={learnedCount}
                notLearned={notLearnedCount}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className={selectedDeckItem ? "hidden lg:block" : ""}>
              <VocabularyDeckList
                deck={pagedDeck}
                selected={selectedDeckItem}
                onSelect={setSelectedDeckItem}
                onRemove={(cardId) => void handleRemoveCard(cardId)}
                emptyMessage={
                  deck.length > 0 ? "Không có thẻ nào ở trạng thái này." : undefined
                }
              />

              {deckTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentDeckPage <= 1}
                    onClick={() => setDeckPage(currentDeckPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Trước
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Trang {currentDeckPage} / {deckTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentDeckPage >= deckTotalPages}
                    onClick={() => setDeckPage(currentDeckPage + 1)}
                  >
                    Sau
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className={`lg:sticky lg:top-20 lg:self-start ${selectedDeckItem ? "" : "hidden lg:block"}`}>
              <VocabularyDetailPanel
                wordId={selectedDeckItem?.word.id ?? null}
                onClose={() => setSelectedDeckItem(null)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}