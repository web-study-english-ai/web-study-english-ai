"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

const TITLES: [string, string][] = [
  ["/admin/users", "Quản lý tài khoản"],
  ["/admin/words", "Quản lý từ vựng"],
  ["/admin/reading", "Bài đọc hiểu"],
];

export function AdminHeader() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const { logout } = useAuth();
  const title = TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Trang quản trị";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8">
      <h1 className="font-heading text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-2">
        {user && (
          <div className="text-right leading-tight">
            <p className="text-sm font-semibold text-foreground">{user.name}</p>
            <p className="text-xs font-medium text-rose-500">Quản trị viên cấp cao</p>
          </div>
        )}
        {/* Trên điện thoại sidebar bị ẩn nên cần nút đăng xuất ở đây */}
        <button
          type="button"
          onClick={() => void logout()}
          aria-label="Đăng xuất"
          className="ml-2 rounded-lg p-2 text-destructive hover:bg-destructive/10 md:hidden"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}