import type { NextRequest } from "next/server";
import { createVolume, listVolumes } from "@/lib/service";
import { jsonWithScope, readJson, resolveRequestScope, route, NO_STORE, intParam } from "@/lib/http";
import {
  asRole,
  asSingleLine,
  asString,
  LIMITS,
} from "@/lib/validation";

/** GET /api/volumes — the calling session's reading volumes. */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const includeRetired = req.nextUrl.searchParams.get("includeRetired") === "1";
  const limit = intParam(req, "limit", 50, 1, 100);
  const volumes = await listVolumes(scope, { includeRetired, limit });
  return jsonWithScope(
    { count: volumes.length, volumes },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});

/** POST /api/volumes — create a reading volume. */
export const POST = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const body = await readJson(req);
  const name = asSingleLine(body.name, "name", LIMITS.name);
  if (name.length < 3) {
    return jsonWithScope(
      { error: { code: "bad_request", message: "Give the volume a name of at least 3 characters." } },
      { status: 400, headers: NO_STORE, scope: { scope, setCookie } },
    );
  }
  const volume = await createVolume(scope, {
    name,
    intent: asString(body.intent ?? "", "intent", LIMITS.intent),
    role: asRole(body.role ?? "generalist"),
  });
  return jsonWithScope(
    { volume },
    { status: 201, headers: NO_STORE, scope: { scope, setCookie } },
  );
});