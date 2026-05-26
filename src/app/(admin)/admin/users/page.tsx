import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  userStationLinks,
  userProvinceLinks,
  userProfiles,
  stations,
  provinces,
} from "@/db/schema";
import { User, Building2, MapPin, Calendar } from "lucide-react";
import Link from "next/link";

function fmt(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminUsersPage() {
  const [stationLinks, provinceLinks, profiles] = await Promise.all([
    db
      .select({
        userId: userStationLinks.userId,
        stationId: userStationLinks.stationId,
        stationName: stations.name,
        linkedAt: userStationLinks.linkedAt,
      })
      .from(userStationLinks)
      .leftJoin(stations, eq(userStationLinks.stationId, stations.stationId))
      .orderBy(userStationLinks.linkedAt),

    db
      .select({
        userId: userProvinceLinks.userId,
        provinceCode: userProvinceLinks.provinceCode,
        provinceName: provinces.nameTh,
        linkedAt: userProvinceLinks.linkedAt,
      })
      .from(userProvinceLinks)
      .leftJoin(provinces, eq(userProvinceLinks.provinceCode, provinces.provinceCode)),

    db
      .select({
        userId: userProfiles.userId,
        givenName: userProfiles.givenName,
        familyName: userProfiles.familyName,
        email: userProfiles.email,
      })
      .from(userProfiles),
  ]);

  // Unique user IDs from links
  const userIds = [
    ...new Set([
      ...stationLinks.map((r) => r.userId),
      ...provinceLinks.map((r) => r.userId),
    ]),
  ];

  // Profile map from user_profiles
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  // Group by user
  const stationsByUser = new Map<string, typeof stationLinks>();
  for (const link of stationLinks) {
    if (!stationsByUser.has(link.userId)) stationsByUser.set(link.userId, []);
    stationsByUser.get(link.userId)!.push(link);
  }
  const provinceByUser = new Map(provinceLinks.map((r) => [r.userId, r]));

  const users = userIds.map((uid) => {
    const profile = profileMap.get(uid);
    const name = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ");
    return {
      userId: uid,
      email: profile?.email ?? uid,
      name,
      stations: stationsByUser.get(uid) ?? [],
      province: provinceByUser.get(uid) ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
          ผู้ใช้งาน
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
          {users.length} บัญชีที่มีการเชื่อมโยง
        </p>
      </div>

      {users.length === 0 ? (
        <div
          className="rounded-2xl py-16 text-center"
          style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
        >
          <User size={32} className="mx-auto mb-3" style={{ color: "var(--foreground-neutral-lightest)" }} />
          <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>ยังไม่มีผู้ใช้งาน</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user.userId}
              className="rounded-2xl overflow-hidden"
              style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
            >
              {/* User header */}
              <div
                className="px-5 py-4 flex items-center gap-3"
                style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                  style={{ background: "var(--primary-95)" }}
                >
                  <User size={16} style={{ color: "var(--primary-30-base)" }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--foreground-neutral-default)" }}>
                    {user.name || user.email}
                  </p>
                  {user.name && (
                    <p className="text-xs truncate" style={{ color: "var(--foreground-neutral-lighter)" }}>
                      {user.email}
                    </p>
                  )}
                </div>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: "var(--neutral-95)", color: "var(--foreground-neutral-lighter)" }}
                >
                  {user.userId.slice(0, 8)}…
                </span>
              </div>

              {/* Links */}
              <div className="px-5 py-3 flex flex-wrap gap-4">
                {/* Stations */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-48">
                  <p
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: "var(--foreground-neutral-lighter)" }}
                  >
                    <Building2 size={11} />
                    สถานีที่เชื่อมโยง ({user.stations.length})
                  </p>
                  {user.stations.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--foreground-neutral-lightest)" }}>—</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {user.stations.map((s) => (
                        <Link
                          key={s.stationId}
                          href={`/admin/stations/${s.stationId}`}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                          style={{ background: "var(--primary-95)", color: "var(--primary-30-base)" }}
                        >
                          {s.stationName ?? `#${s.stationId}`}
                          <Calendar size={9} className="opacity-60" />
                          {fmt(s.linkedAt)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Province */}
                {user.province && (
                  <div className="flex flex-col gap-1.5 min-w-36">
                    <p
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--foreground-neutral-lighter)" }}
                    >
                      <MapPin size={11} />
                      อบจ. Officer
                    </p>
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full w-fit"
                      style={{ background: "var(--background-positive-light)", color: "var(--foreground-positive-default)" }}
                    >
                      🏛️ {user.province.provinceName ?? user.province.provinceCode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
