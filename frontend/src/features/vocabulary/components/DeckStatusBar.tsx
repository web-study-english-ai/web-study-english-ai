"use client";

import { cn } from "@/lib/utils";
import { DeckStatusFilter } from "../types/vocabulary_types";

interface Props {
    filter: DeckStatusFilter;
    onFilterChange: (filter: DeckStatusFilter) => void;
    total: number;
    learned: number;
    notLearned: number;
}

const TONE = {
    neutral: {
        active: "border-primary bg-primary text-primary-foreground",
        idle: "border-border text-muted-foreground hover:bg-muted",
    },
    green: {
        active: "border-green-600 bg-green-600 text-white",
        idle: "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-950/40",
    },
    red: {
        active: "border-red-600 bg-red-600 text-white",
        idle: "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40",
    },
} as const;

export function DeckStatusBar({ filter, onFilterChange, total, learned, notLearned }: Props) {
    const options: {
        value: DeckStatusFilter;
        label: string;
        count: number;
        tone: keyof typeof TONE;
    }[] = [
            { value: "all", label: "Tất cả", count: total, tone: "neutral" },
            { value: "learned", label: "Đã học", count: learned, tone: "green" },
            { value: "notLearned", label: "Chưa học", count: notLearned, tone: "red" },
        ];

    return (
        <div
            role="group"
            aria-label="Lọc theo trạng thái học"
            className="mb-4 flex flex-wrap gap-2"
        >
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={filter === o.value}
                    onClick={() => onFilterChange(o.value)}
                    className={cn(
                        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        filter === o.value ? TONE[o.tone].active : TONE[o.tone].idle
                    )}
                >
                    {o.label} ({o.count})
                </button>
            ))}
        </div>
    );
}