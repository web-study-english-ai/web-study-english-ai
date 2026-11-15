"use client";

import { useState } from "react";
import { useDebouncedValue } from "@/features/reading/hooks/useDebouncedValue";

export function useListState<F extends Record<string, string>>(initialFilters: F) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<F>(initialFilters);
  const search = useDebouncedValue(searchInput, 300).trim();

  // Trang gắn với (từ khóa, bộ lọc) hiện tại: đổi một trong hai thì tự về trang 1
  // mà không phát sinh thêm một lần gọi API
  const key = JSON.stringify([search, filters]);
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;

  return {
    searchInput,
    search,
    filters,
    page,
    setPage: (p: number) => setPageState({ key, page: p }),
    onSearchChange: setSearchInput,
    onFilterChange: (name: string, value: string) =>
      setFilters((f) => ({ ...f, [name]: value })),
  };
}