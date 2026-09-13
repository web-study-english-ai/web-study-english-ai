"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

export function UserMenu() {
  const user = useCurrentUser();
  const router = useRouter();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(-2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <button
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-foreground shadow-sm transition-colors hover:bg-muted"
        aria-label="Thông báo"
      >
        <Bell className="h-4.5 w-4.5" />
      </button>

      <button
        onClick={() => router.push("/profile")}
        className="flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80"
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src="" alt={user.name} />
          <AvatarFallback className="bg-orange-100 text-sm font-semibold text-orange-600">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="hidden text-left sm:block">
          <p className="text-sm font-semibold leading-tight text-foreground">{user.name}</p>
        </div>
      </button>
    </div>
  );
}