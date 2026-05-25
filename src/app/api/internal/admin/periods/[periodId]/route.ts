import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportingPeriods } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";
import { z } from "zod";

const patchSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PATCH = requireRole("system_admin", async (_ctx, req) => {
  const periodId = parseInt(new URL(req.url).pathname.split("/").at(-1) ?? "");
  if (isNaN(periodId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields" }, { status: 422 });

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const [existing] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.periodId, periodId))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  await db
    .update(reportingPeriods)
    .set(parsed.data)
    .where(eq(reportingPeriods.periodId, periodId));

  return NextResponse.json({ success: true });
});
