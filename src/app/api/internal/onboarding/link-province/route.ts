import { NextResponse } from "next/server";
import { eq, and, isNull, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { activationCodes, provinces, userProvinceLinks, userRoles } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { linkProvinceSchema } from "@/lib/validation/onboarding";

export const POST = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const parsed = linkProvinceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { provinceCode, otp } = parsed.data;

  // Enforce 1-province-per-user before doing anything else
  const [existingLink] = await db
    .select()
    .from(userProvinceLinks)
    .where(eq(userProvinceLinks.userId, ctx.userId));

  if (existingLink) {
    return NextResponse.json(
      { error: "บัญชีนี้เชื่อมโยงกับจังหวัดแล้ว — ติดต่อผู้ดูแลระบบ ธพ. เพื่อเปลี่ยนแปลง" },
      { status: 409 }
    );
  }

  // Verify province exists
  const [province] = await db
    .select()
    .from(provinces)
    .where(eq(provinces.provinceCode, provinceCode));

  if (!province) {
    return NextResponse.json({ error: "ไม่พบรหัสจังหวัด" }, { status: 404 });
  }

  // Find valid unused OTP for this province
  const now = new Date();
  const candidates = await db
    .select()
    .from(activationCodes)
    .where(
      and(
        eq(activationCodes.targetType, "province"),
        eq(activationCodes.targetId, provinceCode),
        isNull(activationCodes.usedAt),
        gt(activationCodes.expiresAt, now)
      )
    );

  const matchingCode = candidates.find((c) => bcrypt.compareSync(otp, c.codeHash));

  if (!matchingCode) {
    return NextResponse.json({ error: "รหัสเปิดใช้งานไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  }

  // neon-http doesn't support transactions; sequential writes are safe here
  await db
    .update(activationCodes)
    .set({ usedAt: now })
    .where(eq(activationCodes.id, matchingCode.id));

  await db.insert(userProvinceLinks).values({
    userId: ctx.userId,
    provinceCode,
  });

  // Grant pac_officer role in the user_roles DB table (idempotent via onConflictDoNothing)
  await db
    .insert(userRoles)
    .values({ userId: ctx.userId, role: "pac_officer" })
    .onConflictDoNothing();

  return NextResponse.json({
    success: true,
    provinceCode,
    provinceName: province.nameTh,
  });
});
