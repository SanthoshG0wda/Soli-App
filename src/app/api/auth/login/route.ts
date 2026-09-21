import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, loginSchema, verifyPassword } from "@/lib/auth";

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse({
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : body.email,
    password: body.password,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid login details.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  // Generic message so callers can't probe which emails are registered.
  if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  await createSession(row.id);
  return NextResponse.json({
    user: { id: row.id, name: row.name, email: row.email },
  });
}
