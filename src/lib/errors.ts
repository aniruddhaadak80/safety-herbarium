import { NextResponse } from "next/server";
import type { ApiError } from "./types";

/**
 * One error shape for every surface: REST routes, the MCP transport and the
 * UI. Status codes are part of the contract, so a client can branch on them.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, "bad_request", message, details);

export const unauthorized = (message = "This record belongs to another session.") =>
  new AppError(403, "forbidden", message);

export const notFound = (message = "No such record.") => new AppError(404, "not_found", message);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, "conflict", message, details);

export const payloadTooLarge = (message: string) => new AppError(413, "too_large", message);

export const rateLimited = (message: string, retryAfterSeconds: number) =>
  new AppError(429, "rate_limited", message, { retryAfterSeconds });

export const upstreamFailure = (message: string) => new AppError(502, "upstream_failed", message);

export const storeFailure = (message = "The store is not reachable.") =>
  new AppError(503, "store_unavailable", message);

/** Never leaks a stack trace, an SQL string or an environment value. */
export function errorEnvelope(error: unknown): { status: number; body: ApiError } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Something went wrong on our side." } },
  };
}

export function errorResponse(error: unknown): NextResponse<ApiError> {
  const { status, body } = errorEnvelope(error);
  return NextResponse.json(body, { status });
}