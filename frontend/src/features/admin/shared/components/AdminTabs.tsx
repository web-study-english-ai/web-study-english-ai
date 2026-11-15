"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/words", label: "Quản lý từ vựng" },
  { href: "/admin/users", label: "Quản lý tài khoản" },
  { href: "/admin/reading", label: "Bài đọc hiểu" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Phân hệ quản trị" className="flex gap-6 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}