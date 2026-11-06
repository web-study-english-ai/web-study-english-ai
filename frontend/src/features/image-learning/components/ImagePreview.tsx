"use client";

import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileInfo, Phase } from "../hooks/useImageDetection";
import { formatBytes } from "../utils/image_file";

interface Props {
  previewUrl: string;
  phase: Phase;
  fileInfo: FileInfo | null;
  onPick: () => void;
  onOpenCamera: () => void;
}

export function ImagePreview({ previewUrl, phase, fileInfo, onPick, onOpenCamera }: Props) {
  const busy = phase === "compressing" || phase === "detecting";
  const label = phase === "compressing" ? "Đang nén ảnh..." : "AI đang nhận diện từ vựng...";

  let info = "";
  if (phase === "compressing") {
    info = "Đang chuẩn bị ảnh...";
  } else if (fileInfo) {
    info = fileInfo.wasCompressed
      ? `Ảnh gốc ${formatBytes(fileInfo.originalBytes)} → đã nén ${formatBytes(fileInfo.compressedBytes)}`
      : `Ảnh ${formatBytes(fileInfo.originalBytes)} (đã dưới 1 MB, không cần nén)`;
  }

  return (
    <div className="flex min-h-[24rem] flex-col">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Ảnh bạn đã tải lên"
          className="max-h-[24rem] w-full object-contain"
        />

        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm font-medium text-foreground backdrop-blur-sm"
          >
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            {label}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{info}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onOpenCamera}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            Chụp lại
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onPick}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            Tải ảnh khác
          </Button>
        </div>
      </div>
    </div>
  );
}