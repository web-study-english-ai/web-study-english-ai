"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManualSearch } from "../hooks/useManualSearch";
import { DetectedWordList } from "./DetectedWordList";

export function ManualWordSearch({ imageUrl }: { imageUrl: string }) {
  const [value, setValue] = useState("");
  const { term, search, results, isFetching, isError, refetch } = useManualSearch();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    search(value);
  }

  return (
    <div className="mt-4 text-left">
      <form onSubmit={submit} role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Gõ từ vựng cần tìm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Gõ từ tiếng Anh cần tìm..."
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <Button type="submit" disabled={!value.trim() || isFetching}>
          Tìm
        </Button>
      </form>

      <div className="mt-4">
        {isFetching && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {isError && !isFetching && (
          <p role="alert" className="text-sm text-destructive">
            Không tìm được từ vựng lúc này.{" "}
            <button type="button" onClick={() => void refetch()} className="font-medium underline">
              Thử lại
            </button>
          </p>
        )}

        {!isFetching && !isError && term && results.length === 0 && (
          <p className="text-sm text-muted-foreground">Không tìm thấy từ &ldquo;{term}&rdquo;.</p>
        )}

        {!isFetching && !isError && results.length > 0 && (
          <DetectedWordList
            key={term}
            items={results}
            imageUrl={imageUrl}
            lowConfidence={false}
            showScore={false}
          />
        )}
      </div>
    </div>
  );
}