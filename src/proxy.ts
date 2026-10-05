import { NextResponse, type NextRequest } from "next/server";
import { SCOPE_COOKIE, isValidScope, newScopeToken } from "@/lib/session";

/**
 * Anonymous session bootstrap.
 *
 * A visitor arrives with no cookie. Rather than making them sign up, the first
 * request mints an unguessable 128-bit scope token and stores it in an HTTP-only
 * cookie: that token is the only thing that owns their volumes and sheets. Every
 * read and write is filtered by it, so two visitors on the same browser profile
 * still cannot see each other's work.
 *
 * An agent or script can skip the cookie entirely by sending its own token in the
 * `x-herbarium-scope` header, which the routes accept in preference.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(SCOPE_COOKIE)?.value;
  if (isValidScope(existing)) return NextResponse.next();

  const scope = newScopeToken();
  const response = NextResponse.next();
  response.cookies.set(SCOPE_COOKIE, scope, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Everything except static assets and image optimisation, so a page render and
  // the API calls behind it always share one scope.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mcp.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};