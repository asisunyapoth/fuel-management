import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  userProvinceLinks,
  stations,
  reports,
  reportingPeriods,
  provinces,
  form014Lines,
  fuelTypes,
} from "@/db/schema";
import ExcelJS from "exceljs";

/* ── Colours (matching CZP token palette) ────────────────────── */
const CLR = {
  headerBg:    "2D6A4F",  // primary-30-base green
  headerFg:    "FFFFFF",
  submitted:   "D1FAE5",  // green-50 tint
  submittedFg: "065F46",
  draft:       "FEF3C7",  // amber-50 tint
  draftFg:     "92400E",
  missing:     "FEE2E2",  // red-50 tint
  missingFg:   "991B1B",
  altRow:      "F9FAFB",
  border:      "E5E7EB",
};

function colFill(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } };
}

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const [link] = await db
    .select({ provinceCode: userProvinceLinks.provinceCode })
    .from(userProvinceLinks)
    .where(eq(userProvinceLinks.userId, userId))
    .limit(1);

  if (!link) return NextResponse.json({ error: "Province not linked" }, { status: 403 });

  const { provinceCode } = link;

  // ── Resolve period ──────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const periodIdParam = searchParams.get("periodId");
  const periodId = periodIdParam ? parseInt(periodIdParam) : NaN;

  const periodRow = isNaN(periodId)
    ? await db
        .select()
        .from(reportingPeriods)
        .orderBy(desc(reportingPeriods.startDate))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.periodId, periodId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

  if (!periodRow) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  // ── Province name ────────────────────────────────────────────
  const [province] = await db
    .select({ nameTh: provinces.nameTh })
    .from(provinces)
    .where(eq(provinces.provinceCode, provinceCode))
    .limit(1);

  const provinceName = province?.nameTh ?? provinceCode;

  // ── Stations in province ─────────────────────────────────────
  const allStations = await db
    .select({
      stationId: stations.stationId,
      name: stations.name,
      address: stations.address,
      phone: stations.phone,
    })
    .from(stations)
    .where(eq(stations.provinceCode, provinceCode))
    .orderBy(stations.name);

  const stationIds = allStations.map((s) => s.stationId);

  // ── Reports for this period ───────────────────────────────────
  const periodReports =
    stationIds.length > 0
      ? await db
          .select({
            reportId: reports.reportId,
            stationId: reports.stationId,
            status: reports.status,
            submittedAt: reports.submittedAt,
          })
          .from(reports)
          .where(
            and(
              eq(reports.periodId, periodRow.periodId),
              inArray(reports.stationId, stationIds)
            )
          )
      : [];

  const reportMap = new Map(periodReports.map((r) => [r.stationId, r]));

  // ── Form 01-4 lines for submitted reports ────────────────────
  const submittedReportIds = periodReports
    .filter((r) => r.status === "submitted")
    .map((r) => r.reportId);

  const lines014 =
    submittedReportIds.length > 0
      ? await db
          .select({
            reportId: form014Lines.reportId,
            fuelTypeId: form014Lines.fuelTypeId,
            volumeSoldLiters: form014Lines.volumeSoldLiters,
            taxRatePerLiter: form014Lines.taxRatePerLiter,
            taxAmount: form014Lines.taxAmount,
          })
          .from(form014Lines)
          .where(inArray(form014Lines.reportId, submittedReportIds))
      : [];

  const activeFuelTypes = await db
    .select({ fuelTypeId: fuelTypes.fuelTypeId, nameTh: fuelTypes.nameTh })
    .from(fuelTypes)
    .where(eq(fuelTypes.isActive, true))
    .orderBy(fuelTypes.fuelTypeId);

  // lines014 grouped by reportId
  type Line014 = typeof lines014[0];
  const linesMap = new Map<number, Line014[]>();
  for (const l of lines014) {
    if (!linesMap.has(l.reportId)) linesMap.set(l.reportId, []);
    linesMap.get(l.reportId)!.push(l);
  }

  // ── Build Excel workbook ──────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator  = "RFDRS";
  wb.created  = new Date();
  wb.modified = new Date();

  /* ─── Sheet 1: Compliance Summary ─────────────────────────── */
  const ws1 = wb.addWorksheet("สรุปการส่งรายงาน", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  // Title rows
  ws1.mergeCells("A1:H1");
  const titleCell = ws1.getCell("A1");
  titleCell.value = `รายงานสถานะการส่งรายงาน · จังหวัด${provinceName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF" + CLR.headerBg } };
  titleCell.alignment = { horizontal: "center" };

  ws1.mergeCells("A2:H2");
  const subCell = ws1.getCell("A2");
  subCell.value = `รอบ ${periodRow.startDate} – ${periodRow.endDate} · กำหนดส่ง ${periodRow.dueDate} · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}`;
  subCell.font = { size: 10, color: { argb: "FF6B7280" } };
  subCell.alignment = { horizontal: "center" };

  ws1.addRow([]); // spacer

  // Header row
  const headers1 = [
    "ลำดับ",
    "รหัสสถานี",
    "ชื่อสถานี",
    "ที่อยู่",
    "โทรศัพท์",
    "สถานะ",
    "วันที่ส่ง",
    "เลขที่รายงาน",
  ];
  const hRow1 = ws1.addRow(headers1);
  hRow1.eachCell((cell) => {
    cell.fill  = colFill(CLR.headerBg);
    cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF" + CLR.border } },
    };
  });
  hRow1.height = 28;

  // Data rows
  allStations.forEach((s, idx) => {
    const r = reportMap.get(s.stationId);
    const status = r ? r.status : "missing";
    const statusTh = status === "submitted" ? "ส่งแล้ว" : status === "draft" ? "แบบร่าง" : "ยังไม่ส่ง";

    const dataRow = ws1.addRow([
      idx + 1,
      s.stationId,
      s.name,
      s.address ?? "",
      s.phone ?? "",
      statusTh,
      r?.submittedAt
        ? new Date(r.submittedAt).toLocaleDateString("th-TH")
        : "",
      r?.reportId ?? "",
    ]);

    // Colour by status
    const [bgHex, fgHex] =
      status === "submitted" ? [CLR.submitted, CLR.submittedFg] :
      status === "draft"     ? [CLR.draft,     CLR.draftFg]     :
                               [CLR.missing,   CLR.missingFg];

    dataRow.getCell(6).fill = colFill(bgHex);
    dataRow.getCell(6).font = { color: { argb: "FF" + fgHex }, bold: true };

    if (idx % 2 === 1) {
      [1, 2, 3, 4, 5, 7, 8].forEach((col) => {
        dataRow.getCell(col).fill = colFill(CLR.altRow);
      });
    }

    dataRow.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  });

  // Column widths
  ws1.getColumn(1).width = 6;
  ws1.getColumn(2).width = 10;
  ws1.getColumn(3).width = 32;
  ws1.getColumn(4).width = 40;
  ws1.getColumn(5).width = 14;
  ws1.getColumn(6).width = 12;
  ws1.getColumn(7).width = 14;
  ws1.getColumn(8).width = 14;

  /* ─── Sheet 2: Tax Detail (submitted reports only) ─────────── */
  if (submittedReportIds.length > 0) {
    const ws2 = wb.addWorksheet("ภาษีน้ำมัน 01-4", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    ws2.mergeCells(`A1:${String.fromCharCode(65 + 3 + activeFuelTypes.length * 3)}1`);
    const t2 = ws2.getCell("A1");
    t2.value = `รายละเอียดภาษีน้ำมัน อบจ. 01-4 · จังหวัด${provinceName} · รอบ ${periodRow.startDate} – ${periodRow.endDate}`;
    t2.font = { bold: true, size: 13, color: { argb: "FF" + CLR.headerBg } };
    t2.alignment = { horizontal: "center" };
    ws2.addRow([]);

    // Build header: Station | Station Name | [FuelType × (ปริมาณ, อัตรา, ภาษี)] | รวมภาษี
    const hCols2: string[] = ["รหัสสถานี", "ชื่อสถานี"];
    for (const ft of activeFuelTypes) {
      hCols2.push(`${ft.nameTh}\n(ลิตร)`, `อัตรา\n(บาท/ลิตร)`, `ภาษี\n(บาท)`);
    }
    hCols2.push("รวมภาษีทั้งหมด (บาท)");

    const hRow2 = ws2.addRow(hCols2);
    hRow2.height = 36;
    hRow2.eachCell((cell) => {
      cell.fill  = colFill(CLR.headerBg);
      cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });

    // Data rows (submitted stations only)
    let rowIdx = 0;
    for (const s of allStations) {
      const r = reportMap.get(s.stationId);
      if (!r || r.status !== "submitted") continue;

      const ftLines = linesMap.get(r.reportId) ?? [];
      const ftMap = new Map(ftLines.map((l) => [l.fuelTypeId, l]));
      let totalTax = 0;

      const rowData: (string | number)[] = [s.stationId, s.name];
      for (const ft of activeFuelTypes) {
        const l = ftMap.get(ft.fuelTypeId);
        const vol  = l ? parseFloat(l.volumeSoldLiters) : 0;
        const rate = l ? parseFloat(l.taxRatePerLiter) : 0;
        const tax  = l ? parseFloat(l.taxAmount) : 0;
        totalTax += tax;
        rowData.push(vol, rate, tax);
      }
      rowData.push(totalTax);

      const dataRow = ws2.addRow(rowData);
      if (rowIdx % 2 === 1) {
        dataRow.eachCell((cell) => { cell.fill = colFill(CLR.altRow); });
      }
      dataRow.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0.00";
      });
      dataRow.getCell(1).alignment = { horizontal: "center" };
      dataRow.getCell(2).alignment = { horizontal: "left" };

      rowIdx++;
    }

    ws2.getColumn(1).width = 10;
    ws2.getColumn(2).width = 30;
    let colIdx = 3;
    for (const _ of activeFuelTypes) {
      ws2.getColumn(colIdx).width = 12;
      ws2.getColumn(colIdx + 1).width = 12;
      ws2.getColumn(colIdx + 2).width = 12;
      colIdx += 3;
    }
    ws2.getColumn(colIdx).width = 18;
  }

  // ── Stream response ───────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `RFDRS_${provinceCode}_${periodRow.startDate}_${periodRow.endDate}.xlsx`
    .replace(/\s/g, "_");

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
