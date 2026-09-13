"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Topic, VocabularyFilters, CefrLevel } from "../types/vocabulary_types";

interface Props {
  filters: VocabularyFilters;
  topics: Topic[];
  onChange: (filters: VocabularyFilters) => void;
}

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2"];

export function VocabularySearchBar({ filters, topics, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm từ vựng..."
          className="pl-9"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />
      </div>

      <Select
        value={filters.topicId}
        onValueChange={(v) => onChange({ ...filters, topicId: v ?? "all" })}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Chủ đề">
            {(value: string) =>
              value === "all"
                ? "Tất cả chủ đề"
                : (topics.find((t) => t.id === value)?.name ?? "Chủ đề")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả chủ đề</SelectItem>
          {topics.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.level}
        onValueChange={(v) => onChange({ ...filters, level: (v as CefrLevel) ?? "all" })}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Trình độ">
            {(value: string) => (value === "all" ? "Tất cả trình độ" : value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trình độ</SelectItem>
          {LEVELS.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}