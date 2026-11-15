import { NextRequest, NextResponse } from "next/server";

const USER_PREFIXES = [
  "/dashboard",
  "/vocabulary",
  "/learn-words",
  "/reviews",
  "/progress",
  "/reading",
  "/lessons",
  "/image-learning",
  "/ai-chat",
  "/profile",
];

const AUTH_PAGES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const token = request.cookies.get("has_session")?.value;
  const role = request.cookies.get("user_role")?.value;
  const { pathname } = request.nextUrl;

  const isUserRoute = USER_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if ((isUserRoute || isAdminRoute) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && role === "ADMIN" && (isAuthPage || isUserRoute || pathname === "/")) {
    return NextResponse.redirect(new URL("/admin/words", request.url));
  }

  if (token && role !== "ADMIN" && (isAdminRoute || isAuthPage)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/dashboard/:path*",
    "/vocabulary/:path*",
    "/learn-words/:path*",
    "/reviews/:path*",
    "/progress/:path*",
    "/reading/:path*",
    "/lessons/:path*",
    "/image-learning/:path*",
    "/ai-chat/:path*",
    "/profile/:path*",
    "/login",
    "/register",
  ],
};