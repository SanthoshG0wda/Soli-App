import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(): Promise<NextResponse<{ user: Awaited<ReturnType<typeof getSessionUser>> }>> {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
