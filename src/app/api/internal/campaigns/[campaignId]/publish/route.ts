import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignStations, stations, dealerLicenses } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

/* ── POST /api/internal/campaigns/[campaignId]/publish ────────────
   Materialise campaign_stations from a targetScope filter, then flip
   the campaign status to 'active'.

   targetScope is one of:
     { all: true }
     { provinceCodes: string[] }
     { section: 7 | 11 }
     { stationIds: number[] }

   Idempotent: calling publish again on an already-active campaign is
   a no-op (returns 200 with the existing station count).
──────────────────────────────────────────────────────────────────── */

const targetScopeSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ provinceCodes: z.array(z.string()).min(1) }),
  z.object({ section: z.union([z.literal(7), z.literal(11)]) }),
  z.object({ stationIds: z.array(z.number().int().positive()).min(1) }),
]);

const publishSchema = z.object({
  targetScope: targetScopeSchema,
});

export const POST = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  // path: /api/internal/campaigns/[campaignId]/publish
  const campaignId = parseInt(segments[segments.length - 2]);

  if (isNaN(campaignId)) {
    return NextResponse.json({ error: "Invalid campaignId" }, { status: 400 });
  }

  // Load campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.campaignId, campaignId))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Idempotent: already active — return current count
  if (campaign.status === "active") {
    const existing = await db
      .select({ stationId: campaignStations.stationId })
      .from(campaignStations)
      .where(eq(campaignStations.campaignId, campaignId));
    return NextResponse.json({
      campaignId,
      status: "active",
      stationCount: existing.length,
      message: "Campaign already active",
    });
  }

  if (campaign.status === "closed") {
    return NextResponse.json({ error: "Campaign is closed" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid targetScope", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { targetScope } = parsed.data;

  // ── Resolve target stations from scope ────────────────────────
  let targetStationIds: number[] = [];

  if ("all" in targetScope) {
    const rows = await db.select({ stationId: stations.stationId }).from(stations);
    targetStationIds = rows.map((r) => r.stationId);
  } else if ("provinceCodes" in targetScope) {
    const rows = await db
      .select({ stationId: stations.stationId })
      .from(stations)
      .where(inArray(stations.provinceCode, targetScope.provinceCodes));
    targetStationIds = rows.map((r) => r.stationId);
  } else if ("section" in targetScope) {
    const rows = await db
      .select({ stationId: stations.stationId })
      .from(stations)
      .innerJoin(dealerLicenses, eq(stations.dealerLicenseNo, dealerLicenses.licenseNo))
      .where(eq(dealerLicenses.section, String(targetScope.section)));
    targetStationIds = rows.map((r) => r.stationId);
  } else if ("stationIds" in targetScope) {
    // Validate that all requested stations actually exist
    const rows = await db
      .select({ stationId: stations.stationId })
      .from(stations)
      .where(inArray(stations.stationId, targetScope.stationIds));
    targetStationIds = rows.map((r) => r.stationId);
  }

  if (targetStationIds.length === 0) {
    return NextResponse.json(
      { error: "No stations matched the targetScope — campaign not published" },
      { status: 422 }
    );
  }

  // ── Materialise campaign_stations (Neon-http: no transactions — sequential awaits) ──
  await db
    .insert(campaignStations)
    .values(targetStationIds.map((stationId) => ({ campaignId, stationId })))
    .onConflictDoNothing(); // safe to re-run

  await db
    .update(campaigns)
    .set({ status: "active", publishedAt: new Date() })
    .where(eq(campaigns.campaignId, campaignId));

  return NextResponse.json({
    campaignId,
    status: "active",
    stationCount: targetStationIds.length,
  });
});
