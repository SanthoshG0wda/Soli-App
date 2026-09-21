import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { env } from "@/env";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from "./token";
import type { UserRole } from "./roles";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Create a database session row, sign a JWT for it, and set the cookie. */
export async function createSession(userId: string): Promise<void> {
  const maxAgeSeconds = env.SESSION_MAX_AGE_SECONDS;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  const [row] = await db
    .insert(sessions)
    .values({ userId, expiresAt })
    .returning({ id: sessions.id });
  if (!row) {
    throw new Error("Failed to create session.");
  }

  const token = await signSessionToken({
    userId,
    sessionId: row.id,
    secret: env.SESSION_SECRET,
    maxAgeSeconds,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, cookieOptions(maxAgeSeconds));
}

/**
 * Secure session check: verifies the JWT signature/expiry AND that the
 * session row still exists and has not expired (supports logout revocation).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token, env.SESSION_SECRET);
  if (!claims) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .innerJoin(sessions, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, claims.sessionId),
        eq(sessions.userId, claims.userId),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  // The check constraint guarantees one of the two values; narrow the type.
  const role: UserRole = row.role === "admin" ? "admin" : "user";
  return { id: row.id, name: row.name, email: row.email, role };
}

/** Use at the top of protected pages; redirects anonymous users to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Delete the session row (revocation) and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const claims = await verifySessionToken(token, env.SESSION_SECRET);
    if (claims) {
      await db.delete(sessions).where(eq(sessions.id, claims.sessionId));
    }
  }
  store.delete(SESSION_COOKIE_NAME);
}
