import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { stations, userStationLinks } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

async function verifyOwnership(userId: string, stationId: number) {
  const [row] = await db
    .select({ stationId: stations.stationId })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(and(eq(stations.stationId, stationId), eq(userStationLinks.userId, userId)))
    .limit(1);
  return !!row;
}

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
});

export const PATCH = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const stationId = parseInt(url.pathname.split("/").at(-1) ?? "");
  if (isNaN(stationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const owned = await verifyOwnership(ctx.userId, stationId);
  if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields" }, { status: 422 });

  const { lat, lon, ...rest } = parsed.data;

  await db
    .update(stations)
    .set({
      ...rest,
      ...(lat !== undefined ? { lat: lat !== null ? String(lat) : null } : {}),
      ...(lon !== undefined ? { lon: lon !== null ? String(lon) : null } : {}),
    })
    .where(eq(stations.stationId, stationId));

  return NextResponse.json({ success: true });
});
