import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "soli_session";

export interface SessionTokenClaims {
  userId: string;
  sessionId: string;
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Sign a session JWT binding the user to a database session row. */
export async function signSessionToken(input: {
  userId: string;
  sessionId: string;
  secret: string;
  maxAgeSeconds: number;
}): Promise<string> {
  const expiresInSeconds =
    Math.floor(Date.now() / 1000) + input.maxAgeSeconds;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setJti(input.sessionId)
    .setIssuedAt()
    .setExpirationTime(expiresInSeconds)
    .sign(encodeSecret(input.secret));
}

/**
 * Optimistically verify a session JWT (signature + expiry only).
 * Callers must still check the session row in the database for revocation.
 * Safe to import from `proxy.ts` — no `server-only`, env, or db imports.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") {
      return null;
    }
    return { userId: payload.sub, sessionId: payload.jti };
  } catch {
    return null;
  }
}
