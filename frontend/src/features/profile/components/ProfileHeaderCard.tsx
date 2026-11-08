"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  name: string;
  email: string;
  avatarUrl: string | null; // ảnh đang hiển thị (ảnh xem trước hoặc ảnh đã lưu)
  avatarError?: string;
  onPickAvatar: (file: File) => void;
  children?: React.ReactNode; // khu vực bên phải, dùng cho công tắc dark mode
}

export function ProfileHeaderCard({
  name,
  email,
  avatarUrl,
  avatarError,
  onPickAvatar,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(-2)
      .join("")
      .toUpperCase() || "?";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative shrink-0">
          <Avatar className="h-16 w-16">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="bg-orange-100 text-lg font-semibold text-orange-600">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            aria-label="Đổi ảnh đại diện"
            onClick={() => inputRef.current?.click()}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickAvatar(file);
              e.target.value = ""; // cho phép chọn lại cùng một file
            }}
          />
        </div>

        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-bold text-foreground">{name}</h1>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
          {avatarError && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {avatarError}
            </p>
          )}
        </div>
      </div>

      {children && <div className="w-full sm:w-72 sm:shrink-0">{children}</div>}
    </section>
  );
}