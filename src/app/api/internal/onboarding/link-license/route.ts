import { NextResponse } from "next/server";
import { eq, and, isNull, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { activationCodes, dealerLicenses, userLicenseLinks } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { linkLicenseSchema } from "@/lib/validation/onboarding";

export const POST = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const parsed = linkLicenseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { licenseNo, otp } = parsed.data;

  // Verify the dealer license exists and is active
  const [license] = await db
    .select()
    .from(dealerLicenses)
    .where(and(eq(dealerLicenses.licenseNo, licenseNo), eq(dealerLicenses.isActive, true)));

  if (!license) {
    return NextResponse.json({ error: "ไม่พบเลขทะเบียนผู้ค้า" }, { status: 404 });
  }

  // Check user hasn't already linked this license
  const [existingLink] = await db
    .select()
    .from(userLicenseLinks)
    .where(
      and(
        eq(userLicenseLinks.userId, ctx.userId),
        eq(userLicenseLinks.licenseNo, licenseNo)
      )
    );

  if (existingLink) {
    return NextResponse.json({ error: "เลขทะเบียนนี้เชื่อมโยงกับบัญชีของคุณแล้ว" }, { status: 409 });
  }

  // Find a valid, unused OTP for this license
  const now = new Date();
  const candidates = await db
    .select()
    .from(activationCodes)
    .where(
      and(
        eq(activationCodes.targetType, "license"),
        eq(activationCodes.targetId, licenseNo),
        isNull(activationCodes.usedAt),
        gt(activationCodes.expiresAt, now)
      )
    );

  const matchingCode = candidates.find((c) => bcrypt.compareSync(otp, c.codeHash));

  if (!matchingCode) {
    return NextResponse.json({ error: "รหัสเปิดใช้งานไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 400 });
  }

  // Determine role: section-7 = dealer_admin, section-11 = station_operator
  const role = license.section === "7" ? "dealer_admin" : "station_operator";

  // Mark OTP used, then create the link.
  // neon-http doesn't support transactions; sequential writes are safe here
  await db
    .update(activationCodes)
    .set({ usedAt: now })
    .where(eq(activationCodes.id, matchingCode.id));

  await db.insert(userLicenseLinks).values({
    userId: ctx.userId,
    licenseNo,
    role,
  });

  return NextResponse.json({ success: true, licenseNo, role });
});
