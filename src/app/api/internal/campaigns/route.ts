import { NextResponse } from "next/server";
import { eq, and, inArray, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  campaignStations,
  reports,
  stations,
  userStationLinks,
} from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

/* ── POST /api/internal/campaigns ─────────────────────────────────
   Create a new campaign (draft state). Any authenticated user for MVP;
   in production wrap with requireRole('doeb_admin').
──────────────────────────────────────────────────────────────────── */

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
  notificationMessage: z.string().optional(),
  // null = all fields required; string[] = only listed FuelLineState keys required
  requiredFields: z.array(z.string()).nullable().optional(),
});

export const POST = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { name, description, dueDate, notificationMessage, requiredFields } = parsed.data;

  const [campaign] = await db
    .insert(campaigns)
    .values({
      name,
      description: description ?? null,
      dueDate,
      notificationMessage: notificationMessage ?? null,
      requiredFields: requiredFields ?? null,
      createdBy: ctx.userId,
      status: "draft",
    })
    .returning({
      campaignId: campaigns.campaignId,
      name: campaigns.name,
      status: campaigns.status,
    });

  return NextResponse.json(campaign, { status: 201 });
});

/* ── GET /api/internal/campaigns ──────────────────────────────────
   List active campaigns that target any of the current user's stations.
   Returns each campaign with a per-station submission summary.
──────────────────────────────────────────────────────────────────── */

export const GET = secureRoute(async (ctx) => {
  // 1. Find stations linked to this user
  const myLinks = await db
    .select({ stationId: userStationLinks.stationId })
    .from(userStationLinks)
    .where(eq(userStationLinks.clerkUserId, ctx.userId));

  if (myLinks.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const myStationIds = myLinks.map((l) => l.stationId);
  const today = new Date().toISOString().split("T")[0];

  // 2. Find active campaigns that include at least one of the user's stations
  const activeCampaigns = await db
    .selectDistinct({
      campaignId: campaigns.campaignId,
      name: campaigns.name,
      description: campaigns.description,
      dueDate: campaigns.dueDate,
      notificationMessage: campaigns.notificationMessage,
      requiredFields: campaigns.requiredFields,
      status: campaigns.status,
    })
    .from(campaigns)
    .innerJoin(campaignStations, eq(campaigns.campaignId, campaignStations.campaignId))
    .where(
      and(
        eq(campaigns.status, "active"),
        gte(campaigns.dueDate, today),
        inArray(campaignStations.stationId, myStationIds)
      )
    );

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const campaignIds = activeCampaigns.map((c) => c.campaignId);

  // 3. Find which of the user's stations are targeted by each campaign
  const targets = await db
    .select({
      campaignId: campaignStations.campaignId,
      stationId: campaignStations.stationId,
      stationName: stations.name,
    })
    .from(campaignStations)
    .innerJoin(stations, eq(campaignStations.stationId, stations.stationId))
    .where(
      and(
        inArray(campaignStations.campaignId, campaignIds),
        inArray(campaignStations.stationId, myStationIds)
      )
    );

  // 4. Find existing reports for these campaign+station pairs
  const existingReports = await db
    .select({
      campaignId: reports.campaignId,
      stationId: reports.stationId,
      reportId: reports.reportId,
      status: reports.status,
    })
    .from(reports)
    .where(
      and(
        inArray(reports.campaignId, campaignIds),
        inArray(reports.stationId, myStationIds)
      )
    );

  const reportMap = new Map(
    existingReports.map((r) => [`${r.campaignId}-${r.stationId}`, r])
  );

  // 5. Assemble response
  const result = activeCampaigns.map((campaign) => {
    const campaignTargets = targets.filter((t) => t.campaignId === campaign.campaignId);
    const isPastDeadline = campaign.dueDate < today;

    const stationSummaries = campaignTargets.map((t) => {
      const report = reportMap.get(`${campaign.campaignId}-${t.stationId}`);
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

    return {
      ...campaign,
      isPastDeadline,
      stations: stationSummaries,
    };
  });

  return NextResponse.json({ campaigns: result });
});
