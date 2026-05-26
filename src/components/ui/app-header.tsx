import { auth, signOut } from "@/auth";
import { Fuel, ArrowLeftRight, LogOut, User } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { userStationLinks, userProvinceLinks, userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AppRole = "station" | "officer";

interface AppHeaderProps {
  homeHref?: string;
  /** Short label shown below RFDRS on wider screens */
  subtitle?: string;
  /** Which role context this header is rendered in */
  role?: AppRole;
}

const ROLE_LABEL: Record<AppRole, string> = {
  station: "ผู้ประกอบการ",
  officer: "เจ้าหน้าที่ อบจ.",
};

const ROLE_ICON: Record<AppRole, string> = {
  station: "🏪",
  officer: "🏛️",
};

export async function AppHeader({
  homeHref = "/dashboard",
  subtitle,
  role,
}: AppHeaderProps) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Load display name from user_profiles
  let displayName = "";
  if (userId) {
    const [profile] = await db
      .select({ givenName: userProfiles.givenName, familyName: userProfiles.familyName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (profile) {
      displayName = [profile.givenName, profile.familyName].filter(Boolean).join(" ");
    }
    displayName ||= session?.user?.name ?? session?.user?.email ?? "";
  }

  // Check whether this user holds both roles
  let hasStationRole = false;
  let hasOfficerRole = false;

  if (userId) {
    const [stationLinks, provinceLinks] = await Promise.all([
      db
        .select({ id: userStationLinks.id })
        .from(userStationLinks)
        .where(eq(userStationLinks.userId, userId))
        .limit(1),
      db
        .select({ provinceCode: userProvinceLinks.provinceCode })
        .from(userProvinceLinks)
        .where(eq(userProvinceLinks.userId, userId))
        .limit(1),
    ]);
    hasStationRole = stationLinks.length > 0;
    hasOfficerRole = provinceLinks.length > 0;
  }

  const showSwitcher = hasStationRole && hasOfficerRole && !!role;
  const otherRole: AppRole | null = role === "station" ? "officer" : role === "officer" ? "station" : null;
  const switchHref = otherRole === "officer" ? "/pac" : "/dashboard";

  return (
    <header
      style={{ background: "var(--primary-30-base)" }}
      className="sticky top-0 z-40 w-full"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

        {/* ── Brand ── */}
        <Link
          href={homeHref}
          className="flex items-center gap-2.5 shrink-0 group"
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ background: "var(--a-light-a20)" }}
          >
            <Fuel size={16} style={{ color: "white" }} strokeWidth={2} />
          </span>
          <span className="flex flex-col leading-tight">
            <span
              className="text-sm font-semibold tracking-wide"
              style={{ color: "white" }}
            >
              RFDRS
            </span>
            {subtitle && (
              <span
                className="text-xs hidden sm:block"
                style={{ color: "var(--a-light-a60)" }}
              >
                {subtitle}
              </span>
            )}
          </span>
        </Link>

        {/* ── Right side ── */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Current-role pill — visible on sm+ */}
          {role && (
            <span
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium shrink-0"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <span>{ROLE_ICON[role]}</span>
              {ROLE_LABEL[role]}
            </span>
          )}

          {/* ── Role switcher ── */}
          {showSwitcher && otherRole && (
            <Link
              href={switchHref}
              title={`สลับเป็น${ROLE_LABEL[otherRole]}`}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors shrink-0"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              <ArrowLeftRight size={11} strokeWidth={2.5} />
              <span className="hidden sm:inline">
                {ROLE_ICON[otherRole]}&nbsp;{ROLE_LABEL[otherRole]}
              </span>
              <span className="sm:hidden">สลับ</span>
            </Link>
          )}

          {/* User name */}
          {displayName && (
            <span
              className="text-sm hidden md:flex items-center gap-1.5 shrink-0"
              style={{ color: "var(--primary-90)" }}
            >
              <User size={13} strokeWidth={1.75} />
              {displayName}
            </span>
          )}

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
              style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
