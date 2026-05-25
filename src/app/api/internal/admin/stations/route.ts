import { NextResponse } from "next/server";
import { desc, eq, count, isNull, and, or, ilike } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks, activationCodes, provinces } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";

export const GET = requireRole("system_admin", async (_ctx, req) => {
  const url = new URL(req.url);
  const provinceFilter = url.searchParams.get("province");
  const search = url.searchParams.get("search")?.trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (provinceFilter) conditions.push(eq(stations.provinceCode, provinceFilter));
  if (search) {
    conditions.push(
      or(
        ilike(stations.name, `%${search}%`),
        ilike(stations.address, `%${search}%`),
        ilike(stations.dealerLicenseNo, `%${search}%`)
      )!
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows, managerCounts, otpCounts] = await Promise.all([
    db
      .select({
        stationId: stations.stationId,
        name: stations.name,
        address: stations.address,
        provinceCode: stations.provinceCode,
        provinceName: provinces.nameTh,
        dealerLicenseNo: stations.dealerLicenseNo,
        phone: stations.phone,
      })
      .from(stations)
      .leftJoin(provinces, eq(stations.provinceCode, provinces.provinceCode))
      .where(whereClause)
      .orderBy(desc(stations.stationId))
      .limit(limit)
      .offset(offset),

    db.select({ cnt: count() }).from(stations).where(whereClause),

    db
      .select({ stationId: userStationLinks.stationId, cnt: count() })
      .from(userStationLinks)
      .groupBy(userStationLinks.stationId),

    db
      .select({ targetId: activationCodes.targetId, cnt: count() })
      .from(activationCodes)
      .where(and(eq(activationCodes.targetType, "station"), isNull(activationCodes.usedAt)))
      .groupBy(activationCodes.targetId),
  ]);

  const managerMap = new Map(managerCounts.map((r) => [r.stationId, Number(r.cnt)]));
  const otpMap = new Map(otpCounts.map((r) => [parseInt(r.targetId), Number(r.cnt)]));

  return NextResponse.json({
    stations: rows.map((r) => ({
      ...r,
      managerCount: managerMap.get(r.stationId) ?? 0,
      activeOtpCount: otpMap.get(r.stationId) ?? 0,
    })),
    total: totalRows[0]?.cnt ?? 0,
    page,
    limit,
  });
});
