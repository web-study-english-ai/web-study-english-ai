"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/shared/PageContainer";
import { VocabularySearchBar } from "@/features/vocabulary/components/VocabularySearchBar";
import { VocabularyResultItem } from "@/features/vocabulary/components/VocabularyResultItem";
import { VocabularyDetailPanel } from "@/features/vocabulary/components/VocabularyDetailPanel";
import { VocabularyDeckList } from "@/features/vocabulary/components/VocabularyDeckList";
import { useVocabularySearch } from "@/features/vocabulary/hooks/useVocabularySearch";
import { useVocabularyDeck } from "@/features/vocabulary/hooks/useVocabularyDeck";
import { useTopics } from "@/features/vocabulary/hooks/useTopics";
import { DeckCard } from "@/features/vocabulary/types/vocabulary_types";
import { toast } from "@/components/ui/toast";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export default function VocabularyPage() {
  const { filters, setFilters, results, selected, setSelected, isLoading, isError, error, refetch } =
    useVocabularySearch();
   const {
    deck,
    isInDeck,
    themTu,
    xoaThe,
    canhBaoHanMuc,
    themDuVuotHanMuc,
    boQuaCanhBao,
  } = useVocabularyDeck();
  const [selectedDeckItem, setSelectedDeckItem] = useState<DeckCard | null>(null);
  const topics = useTopics();

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
          <TabsTrigger value="search">Tìm kiếm & khám phá</TabsTrigger>
          <TabsTrigger value="deck">Bộ thẻ của tôi ({deck.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <VocabularySearchBar filters={filters} topics={topics} onChange={setFilters} />

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">
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
                  />
                ))}
            </div>

            <div className="lg:sticky lg:top-20 lg:self-start">
              <VocabularyDetailPanel wordId={selected?.id ?? null} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deck" className="mt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <VocabularyDeckList
              deck={deck}
              selected={selectedDeckItem}
              onSelect={setSelectedDeckItem}
              onRemove={async (cardId) => {
                await xoaThe(cardId);
                if (selectedDeckItem?.id === cardId) setSelectedDeckItem(null);
              }}
            />

            <div className="lg:sticky lg:top-20 lg:self-start">
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