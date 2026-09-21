import "server-only";

import { env } from "@/env";

export type UserRole = "admin" | "user";

/** Emails listed in ADMIN_EMAILS are granted the admin role on signup. */
export function isAdminEmail(email: string): boolean {
  const allowlist = env.ADMIN_EMAILS.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return allowlist.includes(email.toLowerCase());
}
