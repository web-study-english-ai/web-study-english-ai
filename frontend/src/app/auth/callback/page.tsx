"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { restoreSessionApi } from "@/features/auth/api/auth_api";

export default function OAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    void restoreSessionApi().then((res) => {
      if (!res) {
        router.replace("/login?oauth_error=Kh%C3%B4ng%20t%E1%BA%A1o%20%C4%91%C6%B0%E1%BB%A3c%20phi%C3%AAn");
        return;
      }
      localStorage.setItem("auth_user", JSON.stringify(res.user));
      document.cookie = `has_session=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
      window.dispatchEvent(new Event("auth-user-updated"));
      router.replace("/dashboard");
    });
  }, [router]);

  return (
    <p className="p-8 text-sm text-muted-foreground">Đang hoàn tất đăng nhập…</p>
  );
}