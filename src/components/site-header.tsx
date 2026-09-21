import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { getSessionUser } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Consult" },
  { href: "/documents", label: "Case files" },
];

const linkClassName =
  "rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-soli-nav/90">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-baseline gap-2"
          aria-label="Soli home"
        >
          <span className="font-serif text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Soli
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-soli-accent sm:inline">
            AI Paralegal
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {user && (
            <nav aria-label="Primary">
              <ul className="flex items-center gap-1 text-sm font-medium">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={linkClassName}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="ml-2 flex items-center gap-1 border-l border-zinc-200 pl-2 text-sm font-medium dark:border-zinc-800">
            {user ? (
              <>
                <span
                  className="max-w-40 truncate px-2 text-zinc-500 dark:text-zinc-400"
                  title={user.email}
                >
                  {user.name}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className={linkClassName}>
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-white transition-colors hover:bg-zinc-700 dark:bg-soli-accent dark:text-zinc-950 dark:hover:bg-soli-accent/85"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
