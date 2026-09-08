import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/vocabulary",
  "/learn-words",
  "/reviews",
  "/progress",
  "/lessons",
  "/image-learning",
  "/ai-chat",
  "/profile",
];

const AUTH_PAGES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const token = request.cookies.get("has_session")?.value;
  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isProtectedRoute && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/vocabulary/:path*",
    "/learn-words/:path*",
    "/reviews/:path*",
    "/progress/:path*",
    "/lessons/:path*",
    "/image-learning/:path*",
    "/ai-chat/:path*",
    "/profile/:path*",
    "/login",
    "/register",
  ],
};