import { NextResponse, type NextRequest } from "next/server";
import { SCOPE_COOKIE, SCOPE_HEADER, resolveScope } from "./session";
import { errorResponse, badRequest, payloadTooLarge } from "./errors";

/**
 * Request plumbing shared by every route: scope resolution, a bounded JSON body
 * reader, and one error funnel so a thrown AppError always becomes the same
 * envelope with the right status.
 */

const MAX_BODY_BYTES = 64 * 1024;

export interface RequestScope {
  scope: string;
  /** Present only when this request minted a new session. */
  setCookie: string | null;
}

/**
 * Resolve the owning scope for a route handler, preferring an explicit
 * `x-herbarium-scope` header so agents and scripts work without a cookie jar.
 */
export function resolveRequestScope(req: NextRequest | Request): RequestScope {
  const { scope, isNew } = resolveScope({
    headerValue: req.headers.get(SCOPE_HEADER),
    cookieValue: readScopeCookie(req.headers.get("cookie")),
  });
  return {
    scope,
    setCookie: isNew ? serializeScopeCookie(scope) : null,
  };
}

/** Test seam: the cookie parser, exported so its behaviour is asserted directly. */
export const readScopeCookieForTest = readScopeCookie;

/** Parse the scope cookie straight from the header, so any Request works. */
function readScopeCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SCOPE_COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function serializeScopeCookie(scope: string): string {
  return [
    `${SCOPE_COOKIE}=${scope}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ].join("; ");
}

export function jsonWithScope(body: unknown, init: ResponseInit & { scope?: RequestScope } = {}): NextResponse {
  const { scope, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (scope?.setCookie) headers.append("set-cookie", scope.setCookie);
  return NextResponse.json(body, { ...rest, headers });
}

/** Read and parse a JSON body with a hard size ceiling. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw payloadTooLarge("Request body is too large.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw payloadTooLarge("Request body is too large.");
  if (text.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest("Request body is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Route context as Next supplies it: for a dynamic segment, `params` is a promise
 * that resolves to the segment values.
 */
export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type Handler<T, P extends Record<string, string>> = (
  req: NextRequest,
  ctx: RouteContext<P>,
) => Promise<NextResponse<T>>;

/**
 * Wrap a handler so thrown AppErrors become the standard error envelope. Works for
 * both static routes (no params) and dynamic ones, so every route funnels its
 * failures through one place.
 */
export function route<T, P extends Record<string, string> = Record<string, string>>(
  handler: Handler<T, P>,
): Handler<T, P> {
  return async (req: NextRequest, ctx: RouteContext<P>) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error) as NextResponse<T>;
    }
  };
}

/** Bounded integer query parameter with a fallback. */
export function intParam(req: NextRequest, name: string, fallback: number, min: number, max: number): number {
  const raw = req.nextUrl.searchParams.get(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export function stringParam(req: NextRequest, name: string, max = 120): string | undefined {
  const raw = req.nextUrl.searchParams.get(name);
  if (raw === null) return undefined;
  return raw.trim().slice(0, max);
}

export const NO_STORE = { "cache-control": "no-store" } as const;