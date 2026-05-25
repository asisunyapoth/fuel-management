import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userStationLinks, userProvinceLinks, stations, provinces } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";
import { clerkClient } from "@clerk/nextjs/server";

export const GET = requireRole("system_admin", async () => {
  // Fetch all station + province links
  const [stationLinks, provinceLinks] = await Promise.all([
    db
      .select({
        clerkUserId: userStationLinks.clerkUserId,
        stationId: userStationLinks.stationId,
        stationName: stations.name,
        linkedAt: userStationLinks.linkedAt,
      })
      .from(userStationLinks)
      .leftJoin(stations, eq(userStationLinks.stationId, stations.stationId))
      .orderBy(userStationLinks.linkedAt),

    db
      .select({
        clerkUserId: userProvinceLinks.clerkUserId,
        provinceCode: userProvinceLinks.provinceCode,
        provinceName: provinces.nameTh,
        linkedAt: userProvinceLinks.linkedAt,
      })
      .from(userProvinceLinks)
      .leftJoin(provinces, eq(userProvinceLinks.provinceCode, provinces.provinceCode))
      .orderBy(userProvinceLinks.linkedAt),
  ]);

  // Collect unique Clerk user IDs
  const userIds = [
    ...new Set([
      ...stationLinks.map((r) => r.clerkUserId),
      ...provinceLinks.map((r) => r.clerkUserId),
    ]),
  ];

  // Batch-fetch user info from Clerk (max 100 per call)
  type ClerkUserInfo = { id: string; email: string; name: string };
  const clerkUsers: ClerkUserInfo[] = [];
  const client = await clerkClient();

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const results = await Promise.allSettled(
      batch.map((id) => client.users.getUser(id))
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        const u = r.value;
        clerkUsers.push({
          id: u.id,
          email: u.emailAddresses[0]?.emailAddress ?? "",
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        });
      }
    }
  }

  const clerkMap = new Map(clerkUsers.map((u) => [u.id, u]));

  // Group station links by user
  const stationsByUser = new Map<string, typeof stationLinks>();
  for (const link of stationLinks) {
    if (!stationsByUser.has(link.clerkUserId)) stationsByUser.set(link.clerkUserId, []);
    stationsByUser.get(link.clerkUserId)!.push(link);
  }

  // Group province links by user
  const provinceByUser = new Map(provinceLinks.map((r) => [r.clerkUserId, r]));

  const users = userIds.map((uid) => {
    const clerk = clerkMap.get(uid);
    return {
      clerkUserId: uid,
      email: clerk?.email ?? uid,
      name: clerk?.name ?? "",
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
