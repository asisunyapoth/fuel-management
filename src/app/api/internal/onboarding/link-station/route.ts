import { NextResponse } from "next/server";
import { eq, and, isNull, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { activationCodes, stations, userStationLinks } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

const schema = z.object({
  stationId: z.number().int().positive(),
  otp: z.string().length(6),
});

/** POST — link a station to the current user via OTP */
export const POST = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณาระบุรหัสสถานีและ OTP 6 หลัก" }, { status: 422 });
  }

  const { stationId, otp } = parsed.data;

  // Verify the station exists
  const [station] = await db
    .select({ stationId: stations.stationId, name: stations.name, provinceCode: stations.provinceCode })
    .from(stations)
    .where(eq(stations.stationId, stationId))
    .limit(1);

  if (!station) {
    return NextResponse.json({ error: "ไม่พบรหัสสถานี" }, { status: 404 });
  }

  // Check for existing link
  const [existing] = await db
    .select({ id: userStationLinks.id })
    .from(userStationLinks)
    .where(and(eq(userStationLinks.userId, ctx.userId), eq(userStationLinks.stationId, stationId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "สถานีนี้เชื่อมโยงกับบัญชีของคุณแล้ว" }, { status: 409 });
  }

  // Find a valid, unused OTP
  const now = new Date();
  const candidates = await db
    .select()
    .from(activationCodes)
    .where(
      and(
        eq(activationCodes.targetType, "station"),
        eq(activationCodes.targetId, String(stationId)),
        isNull(activationCodes.usedAt),
        gt(activationCodes.expiresAt, now)
      )
    );

  const match = candidates.find((c) => bcrypt.compareSync(otp, c.codeHash));
  if (!match) {
    return NextResponse.json({ error: "รหัสเปิดใช้งานไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  }

  // Mark OTP used + create link (sequential — neon-http has no transaction support)
  await db.update(activationCodes).set({ usedAt: now }).where(eq(activationCodes.id, match.id));
  await db.insert(userStationLinks).values({ userId: ctx.userId, stationId });

  return NextResponse.json({ success: true, stationId, stationName: station.name });
});

/** DELETE — unlink a station from the current user */
export const DELETE = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const stationId = Number(body?.stationId);
  if (!stationId) {
    return NextResponse.json({ error: "กรุณาระบุ stationId" }, { status: 422 });
  }

  await db
    .delete(userStationLinks)
    .where(and(eq(userStationLinks.userId, ctx.userId), eq(userStationLinks.stationId, stationId)));

  return NextResponse.json({ success: true });
});
