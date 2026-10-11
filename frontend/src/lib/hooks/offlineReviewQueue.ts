"use client";

import { useEffect, useState } from "react";
import { createReviewApi, CreateReviewPayload } from "@/features/reviews/api/reviews_api";

// Hàng chờ dùng chung cho cả "Học từ mới" và "Ôn tập theo lịch": khi POST /reviews
// thất bại vì mất mạng, lượt đánh giá được lưu tạm ở đây và đồng bộ TUẦN TỰ
// (từng cái một, đúng thứ tự đã bấm) khi có mạng trở lại.

const PENDING_KEY = "pending_reviews";

export function readPendingQueue(): CreateReviewPayload[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writePendingQueue(list: CreateReviewPayload[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

export function enqueuePending(payload: CreateReviewPayload) {
  const list = readPendingQueue();
  list.push(payload);
  writePendingQueue(list);
}

// fetch ném TypeError khi mất mạng/không kết nối được tới server
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError;
}

// Chặn hai lượt đồng bộ chạy chồng lên nhau (ví dụ cả hai màn cùng mount một lúc
// khi chuyển trang nhanh). Biến ở cấp module vì hàng chờ dùng chung cho mọi nơi gọi.
let isSyncing = false;

export async function syncPendingQueue(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    while (true) {
      const list = readPendingQueue();
      if (list.length === 0) break;

      const [head, ...rest] = list;
      try {
        await createReviewApi(head);
        writePendingQueue(rest);
      } catch {
        // Vẫn mất mạng hoặc lỗi khác: dừng lại, thử lại ở lần đồng bộ sau
        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}

// Hook dùng ở cả hai màn: tự đồng bộ khi mount và khi trình duyệt báo có mạng lại,
// trả về số lượt đang chờ đồng bộ để hiển thị cho người dùng nếu cần.
export function useOfflineReviewSync(): number {
  const [pendingCount, setPendingCount] = useState(() => readPendingQueue().length);

  useEffect(() => {
    let mounted = true;

    async function runSync() {
      await syncPendingQueue();
      if (mounted) setPendingCount(readPendingQueue().length);
    }

    if (typeof navigator === "undefined" || navigator.onLine) {
      void runSync();
    }

    const handleOnline = () => void runSync();
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return pendingCount;
}