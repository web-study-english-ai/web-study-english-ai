"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

type Status = "starting" | "ready" | "error";

function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Bạn đã chặn quyền truy cập camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Không tìm thấy camera trên thiết bị này.";
  }
  if (name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng.";
  return "Không thể mở camera.";
}

export function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Trình duyệt hoặc kết nối hiện tại không hỗ trợ camera (cần HTTPS).");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(describeError(err));
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCaptureError("Không chụp được ảnh, vui lòng thử lại.");
          return;
        }
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="flex min-h-[24rem] flex-col">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setStatus("ready")}
          className={cn("max-h-[24rem] w-full object-contain", status === "error" && "hidden")}
        />

        {status === "starting" && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white"
          >
            <Loader2 className="h-6 w-6 animate-spin" />
            Đang mở camera...
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="flex flex-col items-center gap-4 px-6 py-10 text-center text-sm text-white">
            <p>{message}</p>
            <Button type="button" variant="outline" onClick={() => fallbackRef.current?.click()}>
              <ImagePlus className="mr-2 h-4 w-4" />
              Dùng camera của thiết bị
            </Button>
          </div>
        )}
      </div>

      {captureError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {captureError}
        </p>
      )}

      <div className="mt-3 flex justify-center gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button
          type="button"
          disabled={status !== "ready"}
          onClick={capture}
          className="bg-teal-600 text-white hover:bg-teal-700"
        >
          <Camera className="mr-2 h-4 w-4" />
          Chụp
        </Button>
      </div>

      {/* Dự phòng: trên điện thoại sẽ mở thẳng camera hệ thống, trên máy tính mở hộp chọn tệp */}
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Chụp ảnh bằng camera thiết bị"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onCapture(file);
        }}
      />
    </div>
  );
}