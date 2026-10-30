"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getStoredTheme } from "@/lib/theme";

const LIGHT_ONLY_PREFIXES = ["/login", "/register", "/auth"];
const LIGHT_ONLY_EXACT = ["/"];

export function ThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    const lightOnly =
      LIGHT_ONLY_EXACT.includes(pathname) ||
      LIGHT_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    const dark = !lightOnly && getStoredTheme() === "dark";
    document.documentElement.classList.toggle("dark", dark);
  }, [pathname]);

  return null;
}