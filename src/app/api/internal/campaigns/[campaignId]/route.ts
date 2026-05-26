import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  campaignStations,
  reports,
  stations,
  userStationLinks,
} from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";

/* ── GET /api/internal/campaigns/[campaignId] ─────────────────────
   Get campaign details + per-station submission status.
   Station operators only see data for their own stations.
──────────────────────────────────────────────────────────────────── */

export const GET = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const campaignId = parseInt(segments[segments.length - 1]);

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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get user's station IDs
  const myLinks = await db
    .select({ stationId: userStationLinks.stationId })
    .from(userStationLinks)
    .where(eq(userStationLinks.userId, ctx.userId));

  const myStationIds = myLinks.map((l) => l.stationId);

  // Get targeted stations (filtered to user's stations)
  const targets = await db
    .select({
      stationId: campaignStations.stationId,
      stationName: stations.name,
    })
    .from(campaignStations)
    .innerJoin(stations, eq(campaignStations.stationId, stations.stationId))
    .where(
      and(
        eq(campaignStations.campaignId, campaignId),
        myStationIds.length > 0
          ? inArray(campaignStations.stationId, myStationIds)
          : eq(campaignStations.stationId, -1) // empty result if no linked stations
      )
    );

  // Get submission status per targeted station
  const existingReports =
    targets.length > 0
      ? await db
          .select({
            stationId: reports.stationId,
            reportId: reports.reportId,
            status: reports.status,
          })
          .from(reports)
          .where(
            and(
              eq(reports.campaignId, campaignId),
              inArray(
                reports.stationId,
                targets.map((t) => t.stationId)
              )
            )
          )
      : [];

  const reportMap = new Map(existingReports.map((r) => [r.stationId, r]));
  const today = new Date().toISOString().split("T")[0];
  const isPastDeadline = campaign.dueDate < today;

  const stationSummaries = targets.map((t) => {
    const report = reportMap.get(t.stationId);
    let reportStatus: "submitted" | "draft" | "none" | "expired" = "none";
    if (report) {
      reportStatus = report.status as typeof reportStatus;
    } else if (isPastDeadline) {
      reportStatus = "expired";
    }
    return {
      stationId: t.stationId,
      stationName: t.stationName,
      reportId: report?.reportId ?? null,
      reportStatus,
    };
  });

  return NextResponse.json({
    campaignId: campaign.campaignId,
    name: campaign.name,
    description: campaign.description,
    dueDate: campaign.dueDate,
    notificationMessage: campaign.notificationMessage,
    requiredFields: campaign.requiredFields,
    status: campaign.status,
    publishedAt: campaign.publishedAt,
    isPastDeadline,
    stations: stationSummaries,
  });
});
