/** Shared helpers for control-plane route handlers. */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomBytes } from "node:crypto";
import { UnauthorizedError } from "./auth";
import { LimitError } from "./limits";

/** Wrap a route handler so domain errors map to clean HTTP responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof LimitError) {
      return NextResponse.json({ error: err.message, limit: err.limit }, { status: 402 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "invalid input", issues: err.issues }, { status: 400 });
    }
    console.error("[api] unhandled error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

/** Public widget key, e.g. pk_live_a1b2c3... */
export function generatePublicKey(): string {
  return `pk_live_${randomBytes(16).toString("hex")}`;
}
