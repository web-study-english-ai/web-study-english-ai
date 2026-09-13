"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/shared/UserMenu";

const navItems = [
  { href: "/vocabulary", label: "Quản lý từ vựng" },
  { href: "/learn-words", label: "Học từ mới" },
  { href: "/reviews", label: "Ôn tập theo lịch" },
  { href: "/progress", label: "Tiến trình học tập" },
  { href: "/lessons", label: "Bài tập đọc hiểu" },
  { href: "/image-learning", label: "Nhận diện từ vựng" },
  { href: "/ai-chat", label: "Hỏi đáp với trợ lí AI" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
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
        UTC English
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
        </nav>
      )}
    </header>
  );
}