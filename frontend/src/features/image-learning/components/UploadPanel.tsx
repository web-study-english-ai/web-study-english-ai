"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileInfo, Phase } from "../hooks/useImageDetection";
import { ACCEPT_ATTR } from "../utils/image_file";
import { CameraCapture } from "./CameraCapture";
import { ImagePreview } from "./ImagePreview";

interface Props {
  phase: Phase;
  previewUrl: string | null;
  fileInfo: FileInfo | null;
  inputError: string | null;
  onFile: (file: File) => void;
}

export function UploadPanel({ phase, previewUrl, fileInfo, inputError, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setCameraOpen(false);
    onFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="space-y-3">
      {inputError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {inputError}
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative min-h-[26rem] rounded-2xl border bg-card p-4 transition-colors",
          dragging ? "border-teal-500 ring-2 ring-teal-500/30" : "border-border"
        )}
      >
        {cameraOpen ? (
          <CameraCapture onCapture={(file) => pick(file)} onCancel={() => setCameraOpen(false)} />
        ) : previewUrl ? (
          <ImagePreview
            previewUrl={previewUrl}
            phase={phase}
            fileInfo={fileInfo}
            onPick={openPicker}
            onOpenCamera={() => setCameraOpen(true)}
          />
        ) : (
          <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
              <UploadCloud className="h-7 w-7" />
            </span>
            <p className="mt-4 font-semibold text-foreground">Kéo thả ảnh vào đây</p>
            <p className="mt-1 text-sm text-muted-foreground">
              hoặc chọn ảnh từ máy, hoặc chụp trực tiếp bằng camera
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                onClick={openPicker}
                className="bg-teal-600 text-white hover:bg-teal-700"
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Chọn ảnh
              </Button>
              <Button type="button" variant="outline" onClick={() => setCameraOpen(true)}>
                <Camera className="mr-2 h-4 w-4" />
                Chụp ảnh
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              JPEG, PNG hoặc WebP · ảnh được nén xuống dưới 1 MB trước khi gửi
            </p>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-teal-50/80 text-sm font-semibold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
            Thả ảnh để tải lên
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-label="Chọn ảnh từ máy"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // cho phép chọn lại cùng một tệp
            pick(file);
          }}
        />
      </div>
    </div>
  );
}