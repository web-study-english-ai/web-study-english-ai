"use client";

import Link from "next/link";
import { CloudOff, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetectErrorKind, Phase } from "../hooks/useImageDetection";
import { DetectResult } from "../types/image-learning_types";
import { DetectedWordList } from "./DetectedWordList";

interface Props {
  phase: Phase;
  result: DetectResult | null;
  resultId: number;
  errorKind: DetectErrorKind | null;
  errorMessage: string | null;
  onRetry: () => void;
}

const linkButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

function Placeholder() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ScanLine className="h-6 w-6 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm text-muted-foreground">
        Tải ảnh lên để AI nhận diện các từ vựng có trong ảnh.
      </p>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function ServiceUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700/50 dark:bg-amber-950/30">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <CloudOff className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
        Dịch vụ AI tạm thời không khả dụng.
      </p>
      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
        Bạn vẫn có thể tự tìm và thêm từ vựng thủ công.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href="/vocabulary" className={linkButton}>
          Tìm từ vựng thủ công
        </Link>
        {onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function DetectionResults({
  phase,
  result,
  resultId,
  errorKind,
  errorMessage,
  onRetry,
}: Props) {
  if (phase === "idle") return <Placeholder />;
  if (phase === "compressing" || phase === "detecting") return <ResultSkeleton />;

  if (phase === "error") {
    if (errorKind === "unavailable") return <ServiceUnavailable onRetry={onRetry} />;
    if (errorKind === "compress") {
      return (
        <ErrorBox
          message={`${errorMessage ?? "Không thể xử lý ảnh này."} Hãy thử chọn ảnh khác.`}
        />
      );
    }
    return (
      <ErrorBox
        message="Không thể nhận diện ảnh lúc này. Vui lòng kiểm tra kết nối và thử lại."
        onRetry={onRetry}
      />
    );
  }

  if (!result) return <Placeholder />;
  if (result.degraded) return <ServiceUnavailable onRetry={onRetry} />;

  if (result.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm font-semibold text-foreground">
          Chưa nhận diện được từ vựng nào trong ảnh.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hãy chụp lại gần vật thể hơn, đủ sáng và rõ nét hơn.
        </p>
      </div>
    );
  }

  return <DetectedWordList key={resultId} result={result} />;
}