"use client";

import { useEffect } from "react";
import { restoreSessionApi } from "@/features/auth/api/auth_api";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void restoreSessionApi().then((res) => {
      if (res) {
        const role = res.user.role?.toUpperCase() ?? "USER";
        localStorage.setItem("auth_user", JSON.stringify({ ...res.user, role }));
        document.cookie = `has_session=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
        document.cookie = `user_role=${role}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;

        const path = window.location.pathname;
        const isAdminPath = path.startsWith("/admin");

        if (role === "ADMIN" && !isAdminPath) {
          window.location.replace("/admin/words");
          return;
        }
        if (role !== "ADMIN" && isAdminPath) {
          window.location.replace("/dashboard");
          return;
        }
      } else {
        localStorage.removeItem("auth_user");
        document.cookie = "has_session=; path=/; max-age=0";
        document.cookie = "user_role=; path=/; max-age=0";
      }
      window.dispatchEvent(new Event("auth-user-updated"));
    });
  }, []);

  return <>{children}</>;
}