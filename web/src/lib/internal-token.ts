/**
 * Signs short-lived HS256 service tokens that authorise the FastAPI AI service to act
 * for a tenant/bot. The Python side (`app/core/security.py`) verifies these with the
 * same shared secret. Keep the payload shape in sync.
 */
import { SignJWT } from "jose";

const secret = () => {
  const s = process.env.INTERNAL_JWT_SECRET;
  if (!s) throw new Error("INTERNAL_JWT_SECRET is not set");
  return new TextEncoder().encode(s);
};

export async function issueServiceToken(opts: {
  tenantId: string;
  botId?: string | null;
  scope: string;
  ttlSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? 300;
  return new SignJWT({
    tenant_id: opts.tenantId,
    bot_id: opts.botId ?? null,
    scope: opts.scope,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(secret());
}
