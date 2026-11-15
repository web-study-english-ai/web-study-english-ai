"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { listDueCardsApi } from "@/features/vocabulary/api/cards_api";

export function useLogoutConfirm() {
  const { logout } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [checking, setChecking] = useState(false);

  async function requestLogout() {
    if (checking) return;
    setChecking(true);
    try {
      const dueCards = await listDueCardsApi();
      if (dueCards.length > 0) {
        setDueCount(dueCards.length);
        setShowConfirm(true);
        return;
      }
    } catch {
      // Nếu lỗi mạng khi kiểm tra thì vẫn cho phép đăng xuất
    } finally {
      setChecking(false);
    }
    void logout();
  }

  function cancelLogout() {
    setShowConfirm(false);
  }

  function confirmLogout() {
    setShowConfirm(false);
    void logout();
  }

  return {
    showConfirm,
    dueCount,
    checking,
    requestLogout,
    cancelLogout,
    confirmLogout,
  };
}

interface LogoutConfirmDialogProps {
  open: boolean;
  dueCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmDialog({
  open,
  dueCount,
  onCancel,
  onConfirm,
}: LogoutConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Xác nhận đăng xuất
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Bạn có chắc chắn muốn đăng xuất không?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Ở lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}