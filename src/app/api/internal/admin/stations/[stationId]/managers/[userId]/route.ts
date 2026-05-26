import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { userStationLinks } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";

export const DELETE = requireRole("system_admin", async (_ctx, req) => {
  const parts = new URL(req.url).pathname.split("/");
  // .../stations/[stationId]/managers/[userId]
  const targetUserId = parts.at(-1) ?? "";
  const stationId = parseInt(parts.at(-3) ?? "");
  if (isNaN(stationId) || !targetUserId) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  await db
    .delete(userStationLinks)
    .where(
      and(
        eq(userStationLinks.stationId, stationId),
        eq(userStationLinks.userId, targetUserId)
      )
    );

  return NextResponse.json({ success: true });
});
