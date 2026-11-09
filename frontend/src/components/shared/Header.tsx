"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/shared/UserMenu";
import { useAuth } from "@/features/auth/hooks/useAuth";

const navItems = [
  { href: "/vocabulary", label: "Quản lý từ vựng" },
  { href: "/learn-words", label: "Học từ mới" },
  { href: "/reviews", label: "Ôn tập theo lịch" },
  { href: "/progress", label: "Tiến trình học tập" },
  { href: "/reading", label: "Bài tập đọc hiểu" },
  { href: "/image-learning", label: "Nhận diện từ vựng" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { logout } = useAuth();

  const handleMobileLogoutClick = () => {
    setOpen(false);
    if (pathname.startsWith("/reviews")) {
      setShowLogoutConfirm(true);
      return;
    }
    void logout();
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Mở menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <span className="ml-2 font-heading text-base font-semibold md:hidden">
          Study English
        </span>

        <div className="ml-auto flex items-center gap-3">
          <UserMenu />
        </div>
        {open && (
          <nav className="absolute left-0 right-0 top-16 flex flex-col border-b border-border bg-background p-4 shadow-lg md:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm font-medium",
                  pathname.startsWith(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70"
                )}
              >
                {item.label}
              </Link>
            ))}

            <button
              onClick={handleMobileLogoutClick}
              className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4.5 w-4.5" />
              Đăng xuất
            </button>
          </nav>
        )}
      </header>

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