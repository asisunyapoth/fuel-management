import { notFound } from "next/navigation";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks, activationCodes, provinces } from "@/db/schema";
import Link from "next/link";
import { ChevronLeft, Building2, Phone, MapPin, Key, Users, Calendar } from "lucide-react";
import { OtpGenerator } from "./OtpGenerator";
import { ManagerList } from "./ManagerList";

interface PageProps {
  params: Promise<{ stationId: string }>;
}

function fmt(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminStationDetailPage({ params }: PageProps) {
  const { stationId: stationIdStr } = await params;
  const stationId = parseInt(stationIdStr);
  if (isNaN(stationId)) notFound();

  const now = new Date();

  const [stationRows, managers, activeOtps, usedOtpCount] = await Promise.all([
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
      .select({ userId: userStationLinks.userId, linkedAt: userStationLinks.linkedAt })
      .from(userStationLinks)
      .where(eq(userStationLinks.stationId, stationId))
      .orderBy(userStationLinks.linkedAt),

    db
      .select({ id: activationCodes.id, expiresAt: activationCodes.expiresAt })
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

    db
      .select({ id: activationCodes.id })
      .from(activationCodes)
      .where(
        and(
          eq(activationCodes.targetType, "station"),
          eq(activationCodes.targetId, String(stationId))
        )
      ),
  ]);

  const station = stationRows[0];
  if (!station) notFound();

  const totalOtpsEver = usedOtpCount.length;
  const usedCount = totalOtpsEver - activeOtps.length;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin/stations"
        className="inline-flex items-center gap-1.5 text-sm"
        style={{ color: "var(--foreground-neutral-lighter)" }}
      >
        <ChevronLeft size={14} />
        กลับรายการสถานี
      </Link>

      {/* Station info card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{ background: "var(--primary-95)" }}
          >
            <Building2 size={16} style={{ color: "var(--primary-30-base)" }} />
          </span>
          <div>
            <h1 className="text-base font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              {station.name}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
              Station ID: {station.stationId}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={MapPin} label="ที่อยู่" value={station.address ?? "—"} />
          <InfoRow icon={Phone} label="โทรศัพท์" value={station.phone ?? "—"} />
          <InfoRow icon={Building2} label="จังหวัด" value={station.provinceName ?? station.provinceCode ?? "—"} />
          <InfoRow icon={Key} label="ใบอนุญาต" value={`${station.dealerLicenseNo}${station.branchCode ? ` / ${station.branchCode}` : ""}`} />
          {station.lat && station.lon && (
            <InfoRow icon={MapPin} label="พิกัด" value={`${station.lat}, ${station.lon}`} />
          )}
        </div>
      </div>

      {/* OTP section */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <div className="flex items-center gap-2">
            <Key size={15} style={{ color: "var(--primary-30-base)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              รหัสเปิดใช้งาน (OTP)
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
            <span>{activeOtps.length} รหัสที่ยังใช้ได้</span>
            <span>·</span>
            <span>ใช้ไปแล้ว {usedCount}</span>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Active OTPs */}
          {activeOtps.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium" style={{ color: "var(--foreground-neutral-lighter)" }}>
                รหัสที่ยังใช้ได้
              </p>
              {activeOtps.map((otp) => (
                <div
                  key={otp.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: "var(--primary-95)", color: "var(--primary-30-base)" }}
                >
                  <Key size={11} />
                  <span>รหัส #{otp.id}</span>
                  <span className="ml-auto flex items-center gap-1" style={{ color: "var(--foreground-neutral-lighter)" }}>
                    <Calendar size={10} />
                    หมดอายุ {fmt(otp.expiresAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
              ยังไม่มีรหัสที่ใช้ได้ — สร้างรหัสใหม่เพื่อเชิญผู้จัดการสถานีนี้
            </p>
          )}

          {/* OTP Generator */}
          <OtpGenerator stationId={stationId} />
        </div>
      </div>

      {/* Managers section */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <div className="flex items-center gap-2">
            <Users size={15} style={{ color: "var(--primary-30-base)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              ผู้จัดการสถานี
            </h2>
          </div>
          <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
            {managers.length} คน
          </span>
        </div>

        <div className="px-6 py-4">
          {managers.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
              ยังไม่มีผู้จัดการที่ลงทะเบียน — สร้าง OTP และแจ้งให้ผู้จัดการ onboard ผ่านหน้า /onboarding
            </p>
          ) : (
            <ManagerList
              stationId={stationId}
              managers={managers.map((m) => ({
                userId: m.userId,
                linkedAt: m.linkedAt ? new Date(m.linkedAt).toISOString() : "",
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="flex items-center gap-1 text-xs"
        style={{ color: "var(--foreground-neutral-lighter)" }}
      >
        <Icon size={11} />
        {label}
      </span>
      <span className="text-sm" style={{ color: "var(--foreground-neutral-default)" }}>
        {value}
      </span>
    </div>
  );
}
