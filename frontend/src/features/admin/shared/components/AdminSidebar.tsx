"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, LogOut, PenLine, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/useAuth";

const NAV = [
  { href: "/admin/users", label: "Quản lý tài khoản", icon: Users },
  { href: "/admin/words", label: "Quản lý từ vựng", icon: BookOpen },
  { href: "/admin/reading", label: "Bài đọc hiểu", icon: PenLine },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar md:flex">
      <Link href="/admin/words" className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
          <GraduationCap className="h-5 w-5 text-white" />
        </span>
        <span className="leading-tight">
          <span className="block font-heading text-sm font-semibold text-sidebar-foreground">
            Study English
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
            Trang quản trị
          </span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}