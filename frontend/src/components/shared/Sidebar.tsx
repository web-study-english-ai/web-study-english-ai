"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  BookPlus,
  CalendarClock,
  TrendingUp,
  BookOpenCheck,
  ScanLine,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/useAuth";

const navItems = [
  { href: "/vocabulary", label: "Quản lý từ vựng", icon: LayoutGrid },
  { href: "/learn-words", label: "Học từ mới", icon: BookPlus },
  { href: "/reviews", label: "Ôn tập theo lịch", icon: CalendarClock },
  { href: "/progress", label: "Tiến trình học tập", icon: TrendingUp },
  { href: "/reading", label: "Bài tập đọc hiểu", icon: BookOpenCheck },
  { href: "/image-learning", label: "Nhận diện từ vựng", icon: ScanLine },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogoutClick = () => {
    if (pathname.startsWith("/reviews")) {
      setShowLogoutConfirm(true);
      return;
    }
    void logout();
  };

  return (
    <>
      <aside className="hidden h-full w-50 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar md:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-2 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
            <GraduationCap className="h-5 w-5 text-white" />
          </span>
          <span className="font-heading text-base font-semibold text-sidebar-foreground">
            Study English
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={handleLogoutClick}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4.5 w-4.5" />
            Đăng xuất
          </button>
        </div>
      </aside>
{showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Xác nhận đăng xuất
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Bạn đang ở màn hình ôn tập. Nếu đăng xuất bây giờ, phiên ôn tập hiện tại sẽ bị tạm dừng. Bạn có chắc chắn muốn đăng xuất không?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Ở lại ôn tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  void logout();
                }}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}