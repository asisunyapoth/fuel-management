import { NextResponse } from "next/server";
import { desc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportingPeriods, reports } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";
import { z } from "zod";

export const GET = requireRole("system_admin", async () => {
  const [periods, submissionCounts] = await Promise.all([
    db
      .select()
      .from(reportingPeriods)
      .orderBy(desc(reportingPeriods.startDate)),

    db
      .select({ periodId: reports.periodId, cnt: count() })
      .from(reports)
      .where(eq(reports.status, "submitted"))
      .groupBy(reports.periodId),
  ]);

  const submissionMap = new Map(submissionCounts.map((r) => [r.periodId, Number(r.cnt)]));

  return NextResponse.json({
    periods: periods.map((p) => ({
      ...p,
      submittedCount: submissionMap.get(p.periodId) ?? 0,
    })),
  });
});

const createSchema = z.object({
  mode: z.enum(["M", "W", "D"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = requireRole("system_admin", async (_ctx, req) => {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields", issues: parsed.error.issues }, { status: 422 });

  const { mode, startDate, endDate, dueDate } = parsed.data;

  if (endDate <= startDate) {
    return NextResponse.json({ error: "endDate must be after startDate" }, { status: 422 });
  }
  if (dueDate < endDate) {
    return NextResponse.json({ error: "dueDate must be on or after endDate" }, { status: 422 });
  }

  const [row] = await db
    .insert(reportingPeriods)
    .values({ mode, startDate, endDate, dueDate })
    .returning({ periodId: reportingPeriods.periodId });

  return NextResponse.json({ periodId: row.periodId }, { status: 201 });
});
