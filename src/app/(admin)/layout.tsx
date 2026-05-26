import { auth, signOut, getUserRoles } from "@/auth";
import { redirect } from "next/navigation";
import { LogOut, Fuel, LayoutDashboard, Building2, Users, CalendarDays, Settings2 } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin/stations", label: "สถานีบริการ", icon: Building2 },
  { href: "/admin/users", label: "ผู้ใช้งาน", icon: Users },
  { href: "/admin/periods", label: "รอบการรายงาน", icon: CalendarDays },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const roles = await getUserRoles(session.user.id);
  if (!roles.includes("system_admin")) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--canvas-default)" }}>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-40 w-full"
        style={{ background: "var(--neutral-20)", borderBottom: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/stations" className="flex items-center gap-2.5 shrink-0">
              <span
                className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{ background: "var(--a-light-a20)" }}
              >
                <Fuel size={16} style={{ color: "white" }} strokeWidth={2} />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold tracking-wide" style={{ color: "white" }}>
                  RFDRS
                </span>
                <span className="text-xs hidden sm:block" style={{ color: "var(--neutral-60)" }}>
                  System Admin
                </span>
              </span>
            </Link>

            {/* Pill badge */}
            <span
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
            >
              <Settings2 size={11} />
              Admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs px-3 py-1.5 rounded-lg hidden sm:flex items-center gap-1.5"
              style={{ color: "var(--neutral-60)", border: "1px solid var(--neutral-60)" }}
            >
              <LayoutDashboard size={12} />
              กลับหน้าหลัก
            </Link>

            {/* Sign out */}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                title="ออกจากระบบ"
                className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                style={{ background: "rgba(255,255,255,0.12)", color: "var(--neutral-60)" }}
              >
                <LogOut size={15} strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-screen-xl mx-auto w-full">
        {/* ── Sidebar nav ── */}
        <aside
          className="hidden md:flex flex-col w-52 shrink-0 pt-6 px-3 gap-1"
          style={{ borderRight: "1px solid var(--stroke-neutral-lighter)" }}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "var(--foreground-neutral-default)" }}
            >
              <Icon size={15} style={{ color: "var(--foreground-neutral-lighter)" }} />
              {label}
            </Link>
          ))}
        </aside>

        {/* ── Mobile nav ── */}
        <div
          className="md:hidden flex items-center gap-1 px-4 pt-3 pb-0 w-full overflow-x-auto"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lighter)" }}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium shrink-0"
              style={{ color: "var(--foreground-neutral-default)" }}
            >
              <Icon size={13} />
              {label}
            </Link>
          ))}
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
