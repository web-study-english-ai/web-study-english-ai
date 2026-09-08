"use client";

import { useEffect } from "react";
import { restoreSessionApi } from "@/features/auth/api/auth_api";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void restoreSessionApi().then((res) => {
      if (res) {
        localStorage.setItem("auth_user", JSON.stringify(res.user));
      } else {
        localStorage.removeItem("auth_user");
        document.cookie = "has_session=; path=/; max-age=0";
      }
      window.dispatchEvent(new Event("auth-user-updated"));
    });
  }, []);

  return <>{children}</>;
}