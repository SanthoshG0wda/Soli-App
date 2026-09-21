import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Soli.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    redirect("/chat");
  }
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center px-4 py-16">
      <LoginForm next={next} />
    </main>
  );
}
