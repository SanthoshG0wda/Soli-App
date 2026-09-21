import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

const PROTECTED_PREFIXES = ["/chat", "/documents"];
const AUTH_PAGES = ["/login", "/signup"];

/**
 * Optimistic auth check: verifies the session JWT signature/expiry from the
 * cookie and redirects accordingly. Pages and Route Handlers still perform
 * their own secure (database-backed) checks — this is redirect UX only.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? "";
  const session =
    token && secret ? await verifySessionToken(token, secret) : null;

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/documents/:path*", "/login", "/signup"],
};
