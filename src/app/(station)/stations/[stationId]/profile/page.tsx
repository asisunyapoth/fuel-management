import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks } from "@/db/schema";
import { StationProfileForm } from "./StationProfileForm";

export default async function StationProfilePage({
  params,
}: {
  params: Promise<{ stationId: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const { stationId: stationIdStr } = await params;
  const stationId = parseInt(stationIdStr);
  if (isNaN(stationId)) redirect("/dashboard");

  // Verify ownership
  const [row] = await db
    .select({
      stationId: stations.stationId,
      name: stations.name,
      address: stations.address,
      provinceCode: stations.provinceCode,
      branchCode: stations.branchCode,
      phone: stations.phone,
      lat: stations.lat,
      lon: stations.lon,
      photos: stations.photos,
    })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(
        eq(stations.stationId, stationId),
        eq(userStationLinks.userId, userId)
      )
    )
    .limit(1);

  if (!row) redirect("/dashboard");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--foreground-neutral-default)" }}
        >
          ข้อมูลสถานีบริการ
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--foreground-neutral-lighter)" }}>
          {row.name} · #{row.stationId}
        </p>
      </div>

      <StationProfileForm
        stationId={row.stationId}
        initialData={{
          name: row.name,
          address: row.address ?? "",
          phone: row.phone ?? "",
          lat: row.lat ?? "",
          lon: row.lon ?? "",
          photos: row.photos ?? [],
        }}
      />
    </div>
  );
}
