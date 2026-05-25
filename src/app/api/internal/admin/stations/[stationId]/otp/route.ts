import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stations, activationCodes } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";
import bcrypt from "bcryptjs";
import { addDays } from "date-fns";
import { z } from "zod";

const bodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const POST = requireRole("system_admin", async (_ctx, req) => {
  const url = new URL(req.url);
  const stationId = parseInt(url.pathname.split("/").at(-2) ?? "");
  if (isNaN(stationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Verify station exists
  const [station] = await db
    .select({ stationId: stations.stationId })
    .from(stations)
    .where(eq(stations.stationId, stationId))
    .limit(1);
  if (!station) return NextResponse.json({ error: "Station not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields" }, { status: 422 });

  // Generate a cryptographically random 6-digit code
  const { randomInt } = await import("crypto");
  const otp = String(randomInt(100000, 1000000)).padStart(6, "0");

  const hash = await bcrypt.hash(otp, 10);
  const expiresAt = addDays(new Date(), parsed.data.expiresInDays);

  await db.insert(activationCodes).values({
    targetType: "station",
    targetId: String(stationId),
    codeHash: hash,
    expiresAt,
    usedAt: null,
  });

  // Return plain-text code ONCE — it is never stored
  return NextResponse.json({ otp, expiresAt });
});
