import { NextResponse } from "next/server";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks, activationCodes, provinces } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";

export const GET = requireRole("system_admin", async (_ctx, req) => {
  const url = new URL(req.url);
  const stationId = parseInt(url.pathname.split("/").at(-1) ?? "");
  if (isNaN(stationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const now = new Date();

  const [stationRows, managers, activeOtps] = await Promise.all([
    db
      .select({
        stationId: stations.stationId,
        name: stations.name,
        address: stations.address,
        phone: stations.phone,
        lat: stations.lat,
        lon: stations.lon,
        provinceCode: stations.provinceCode,
        provinceName: provinces.nameTh,
        dealerLicenseNo: stations.dealerLicenseNo,
        branchCode: stations.branchCode,
      })
      .from(stations)
      .leftJoin(provinces, eq(stations.provinceCode, provinces.provinceCode))
      .where(eq(stations.stationId, stationId))
      .limit(1),

    db
      .select({
        userId: userStationLinks.userId,
        linkedAt: userStationLinks.linkedAt,
      })
      .from(userStationLinks)
      .where(eq(userStationLinks.stationId, stationId))
      .orderBy(userStationLinks.linkedAt),

    db
      .select({
        id: activationCodes.id,
        expiresAt: activationCodes.expiresAt,
        createdAt: activationCodes.id, // proxy — no createdAt on this table
      })
      .from(activationCodes)
      .where(
        and(
          eq(activationCodes.targetType, "station"),
          eq(activationCodes.targetId, String(stationId)),
          isNull(activationCodes.usedAt),
          gt(activationCodes.expiresAt, now)
        )
      )
      .orderBy(activationCodes.expiresAt),
  ]);

  if (!stationRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    station: stationRows[0],
    managers,
    activeOtps: activeOtps.map((o) => ({ id: o.id, expiresAt: o.expiresAt })),
  });
});
