import { desc, eq, count, isNull, and, or, ilike } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks, activationCodes, provinces } from "@/db/schema";
import Link from "next/link";
import { Building2, Users, Key, ChevronRight, MapPin } from "lucide-react";
import { StationSearch } from "./StationSearch";

interface PageProps {
  searchParams: Promise<{ province?: string; search?: string; page?: string }>;
}

export default async function AdminStationsPage({ searchParams }: PageProps) {
  const { province, search, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 50;
  const offset = (page - 1) * limit;

  // Fetch all provinces for filter dropdown
  const allProvinces = await db
    .select({ provinceCode: provinces.provinceCode, nameTh: provinces.nameTh })
    .from(provinces)
    .orderBy(provinces.nameTh);

  // Build where clause
  const conditions = [];
  if (province) conditions.push(eq(stations.provinceCode, province));
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

  const [rows, [totalRow], managerCounts, otpCounts] = await Promise.all([
    db
      .select({
        stationId: stations.stationId,
        name: stations.name,
        address: stations.address,
        provinceCode: stations.provinceCode,
        provinceName: provinces.nameTh,
        dealerLicenseNo: stations.dealerLicenseNo,
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

  const total = Number(totalRow?.cnt ?? 0);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
          สถานีบริการ
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
          {total.toLocaleString()} สถานีทั้งหมด
        </p>
      </div>

      {/* Search + filter */}
      <StationSearch provinces={allProvinces} defaultSearch={search} defaultProvince={province} />

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 size={32} className="mx-auto mb-3" style={{ color: "var(--foreground-neutral-lightest)" }} />
            <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>ไม่พบสถานีที่ตรงกับเงื่อนไข</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}>
                  {["ID", "ชื่อสถานี", "จังหวัด", "ใบอนุญาต", "ผู้จัดการ", "OTP ที่ใช้ได้", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
                      style={{ color: "var(--foreground-neutral-lighter)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const managerCount = managerMap.get(row.stationId) ?? 0;
                  const otpCount = otpMap.get(row.stationId) ?? 0;
                  return (
                    <tr
                      key={row.stationId}
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                      className="hover:bg-[var(--neutral-97)] transition-colors"
                    >
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--foreground-neutral-lighter)" }}>
                        {row.stationId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: "var(--foreground-neutral-default)" }}>
                          {row.name}
                        </div>
                        <div
                          className="text-xs mt-0.5 flex items-center gap-1 truncate max-w-xs"
                          style={{ color: "var(--foreground-neutral-lightest)" }}
                        >
                          <MapPin size={10} />
                          {row.address}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--foreground-neutral-default)" }}>
                        {row.provinceName ?? row.provinceCode}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
                        {row.dealerLicenseNo}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: managerCount > 0 ? "var(--background-positive-light)" : "var(--neutral-95)",
                            color: managerCount > 0 ? "var(--foreground-positive-default)" : "var(--foreground-neutral-lighter)",
                          }}
                        >
                          <Users size={10} />
                          {managerCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: otpCount > 0 ? "var(--primary-95)" : "var(--neutral-95)",
                            color: otpCount > 0 ? "var(--primary-30-base)" : "var(--foreground-neutral-lighter)",
                          }}
                        >
                          <Key size={10} />
                          {otpCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/stations/${row.stationId}`}
                          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{
                            background: "var(--primary-95)",
                            color: "var(--primary-30-base)",
                          }}
                        >
                          จัดการ
                          <ChevronRight size={11} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/stations?${new URLSearchParams({
                ...(province ? { province } : {}),
                ...(search ? { search } : {}),
                page: String(p),
              })}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm"
              style={{
                background: p === page ? "var(--primary-30-base)" : "var(--canvas-white)",
                color: p === page ? "white" : "var(--foreground-neutral-default)",
                border: `1px solid ${p === page ? "transparent" : "var(--stroke-neutral-lighter)"}`,
              }}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
