import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Soli account.",
};

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/chat");
  }
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center px-4 py-16">
      <SignupForm />
    </main>
  );
}
