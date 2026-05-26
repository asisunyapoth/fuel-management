import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  userStationLinks,
  userProvinceLinks,
  userRoles,
  userProfiles,
  stations,
  provinces,
  authUsers,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";

export const GET = requireRole("system_admin", async () => {
  // Fetch all station + province links
  const [stationLinks, provinceLinks, allRoles, profiles] = await Promise.all([
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
      .leftJoin(provinces, eq(userProvinceLinks.provinceCode, provinces.provinceCode))
      .orderBy(userProvinceLinks.linkedAt),

    db
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles),

    db
      .select({
        userId: userProfiles.userId,
        givenName: userProfiles.givenName,
        familyName: userProfiles.familyName,
        email: userProfiles.email,
      })
      .from(userProfiles),
  ]);

  // Collect unique user IDs from links
  const userIds = [
    ...new Set([
      ...stationLinks.map((r) => r.userId),
      ...provinceLinks.map((r) => r.userId),
    ]),
  ];

  // Build lookup maps
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const rolesByUser = new Map<string, string[]>();
  for (const r of allRoles) {
    if (!rolesByUser.has(r.userId)) rolesByUser.set(r.userId, []);
    rolesByUser.get(r.userId)!.push(r.role);
  }

  const stationsByUser = new Map<string, typeof stationLinks>();
  for (const link of stationLinks) {
    if (!stationsByUser.has(link.userId)) stationsByUser.set(link.userId, []);
    stationsByUser.get(link.userId)!.push(link);
  }

  const provinceByUser = new Map(provinceLinks.map((r) => [r.userId, r]));

  const users = userIds.map((uid) => {
    const profile = profileMap.get(uid);
    const fullName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ");
    return {
      userId: uid,
      email: profile?.email ?? uid,
      name: fullName || null,
      roles: rolesByUser.get(uid) ?? [],
      linkedStations: (stationsByUser.get(uid) ?? []).map((s) => ({
        stationId: s.stationId,
        stationName: s.stationName,
        linkedAt: s.linkedAt,
      })),
      linkedProvince: provinceByUser.get(uid)
        ? {
            provinceCode: provinceByUser.get(uid)!.provinceCode,
            provinceName: provinceByUser.get(uid)!.provinceName,
          }
        : null,
    };
  });

  return NextResponse.json({ users });
});
