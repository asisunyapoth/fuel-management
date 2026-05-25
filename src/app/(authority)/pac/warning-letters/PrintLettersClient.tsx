"use client";

import { useRef } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, FileText } from "lucide-react";

interface StationInfo {
  stationId: number;
  name: string;
  address: string | null;
  phone: string | null;
}

interface PeriodInfo {
  periodId: number;
  mode: string;
  startDate: string;
  endDate: string;
  dueDate: string;
}

interface PrintLettersClientProps {
  provinceName: string;
  provinceCode: string;
  period: PeriodInfo;
  periodLabel: string;
  issueDate: string;
  stations: StationInfo[];
  backHref: string;
}

/* ── Single letter component ─────────────────────────────────── */
function WarningLetter({
  station,
  provinceName,
  provinceCode,
  periodLabel,
  dueDate,
  issueDate,
  letterNo,
  total,
}: {
  station: StationInfo;
  provinceName: string;
  provinceCode: string;
  periodLabel: string;
  dueDate: string;
  issueDate: string;
  letterNo: number;
  total: number;
}) {
  return (
    <div
      className="letter-page bg-white relative"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "20mm 25mm 20mm 30mm",
        margin: "0 auto",
        fontFamily: "'Sarabun', 'TH SarabunPSK', 'Angsana New', sans-serif",
        fontSize: "16pt",
        lineHeight: 1.8,
        pageBreakAfter: "always",
        boxSizing: "border-box",
      }}
    >
      {/* ── Letter number (print reference) ── */}
      <div
        style={{
          position: "absolute",
          top: "8mm",
          right: "15mm",
          fontSize: "9pt",
          color: "#9CA3AF",
        }}
        className="no-print-shadow"
      >
        {letterNo}/{total}
      </div>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "12mm" }}>
        <p style={{ fontWeight: "bold", fontSize: "18pt", margin: 0 }}>
          หนังสือแจ้งเตือนการส่งรายงาน
        </p>
        <p style={{ fontSize: "14pt", color: "#374151", margin: "2mm 0 0" }}>
          ระบบรายงานปริมาณน้ำมันเชื้อเพลิง (RFDRS)
        </p>
      </div>

      {/* ── Right block ── */}
      <div style={{ textAlign: "right", marginBottom: "8mm", fontSize: "15pt" }}>
        <p style={{ margin: 0 }}>
          สำนักงานสรรพสามิตพื้นที่จังหวัด{provinceName}
        </p>
        <p style={{ margin: 0 }}>{issueDate}</p>
      </div>

      {/* ── Subject line ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6mm", fontSize: "15pt" }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", width: "18mm", paddingRight: "4mm" }}>เรื่อง</td>
            <td>
              ขอให้จัดส่งรายงานสต็อกน้ำมันเชื้อเพลิง อบจ. 01-4 และ 01-6
              รอบระยะเวลา {periodLabel}
            </td>
          </tr>
          <tr>
            <td style={{ verticalAlign: "top", paddingRight: "4mm" }}>เรียน</td>
            <td>
              ผู้ประกอบการสถานีบริการน้ำมันเชื้อเพลิง {station.name}
              {station.address && (
                <span style={{ color: "#374151" }}>
                  {" "}
                  — {station.address}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Body ── */}
      <div style={{ fontSize: "15pt", textAlign: "justify" }}>
        <p style={{ textIndent: "18mm", margin: "0 0 4mm" }}>
          ตามที่กรมสรรพสามิตได้กำหนดให้ผู้ประกอบการสถานีบริการน้ำมันเชื้อเพลิง
          ส่งรายงานสต็อกน้ำมันเชื้อเพลิง (อบจ. 01-4 และ 01-6)
          ผ่านระบบรายงานปริมาณน้ำมันเชื้อเพลิง (RFDRS)
          ประจำรอบระยะเวลา <strong>{periodLabel}</strong>{" "}
          ภายในวันที่ <strong>{dueDate}</strong> นั้น
        </p>
        <p style={{ textIndent: "18mm", margin: "0 0 4mm" }}>
          สำนักงานฯ ตรวจสอบแล้วพบว่า สถานีบริการฯ ของท่าน{" "}
          <strong>ยังมิได้จัดส่งรายงานดังกล่าว</strong> ตามกำหนดเวลาที่กำหนดไว้
          จึงขอให้ท่านดำเนินการส่งรายงานผ่านระบบ RFDRS
          ที่ <strong>https://rfdrs.go.th</strong> โดยเร็วที่สุด
        </p>
        <p style={{ textIndent: "18mm", margin: "0 0 4mm" }}>
          หากท่านมีข้อสงสัยหรือต้องการความช่วยเหลือ กรุณาติดต่อสำนักงาน
          สรรพสามิตพื้นที่จังหวัด{provinceName} หรือศูนย์บริการ RFDRS
          โทร. 1713 (ในวันและเวลาราชการ)
        </p>
        <p style={{ textIndent: "18mm", margin: "0 0 8mm" }}>
          จึงเรียนมาเพื่อโปรดดำเนินการ และขอขอบคุณในความร่วมมือ
        </p>
      </div>

      {/* ── Signature block ── */}
      <div style={{ marginTop: "10mm", textAlign: "center" }}>
        <p style={{ margin: "0 0 20mm" }}>ขอแสดงความนับถือ</p>
        <p style={{ margin: 0, fontWeight: "bold" }}>
          (...........................................................................)
        </p>
        <p style={{ margin: "1mm 0 0" }}>
          สรรพสามิตพื้นที่จังหวัด{provinceName}
        </p>
      </div>

      {/* ── Footer reference ── */}
      <div
        style={{
          position: "absolute",
          bottom: "12mm",
          left: "30mm",
          right: "25mm",
          borderTop: "0.5pt solid #D1D5DB",
          paddingTop: "3mm",
          fontSize: "10pt",
          color: "#9CA3AF",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>รหัสสถานี: {station.stationId} · จังหวัด: {provinceCode}</span>
        <span>ออกโดยระบบ RFDRS · {issueDate}</span>
      </div>
    </div>
  );
}

/* ── Main client component ───────────────────────────────────── */

export function PrintLettersClient({
  provinceName,
  provinceCode,
  period,
  periodLabel,
  issueDate,
  stations,
  backHref,
}: PrintLettersClientProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Toolbar (hidden on print) ── */}
      <div
        className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 px-5 py-3"
        style={{
          background: "var(--canvas-white)",
          borderBottom: "1px solid var(--stroke-neutral-lighter)",
          boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl"
            style={{
              color: "var(--foreground-neutral-lighter)",
              background: "var(--neutral-96)",
              border: "1px solid var(--stroke-neutral-lighter)",
            }}
          >
            <ArrowLeft size={14} />
            กลับ
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "var(--primary-30-base)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
                จดหมายแจ้งเตือน · จังหวัด{provinceName}
              </span>
            </div>
            <p className="text-xs ml-5" style={{ color: "var(--foreground-neutral-lighter)" }}>
              รอบ {periodLabel} · {stations.length} สถานียังไม่ส่งรายงาน
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{
            background: "var(--button-background-primary-solid)",
            color: "var(--button-foreground-primary-on-solid)",
          }}
        >
          <Printer size={15} />
          พิมพ์ / บันทึก PDF
        </button>
      </div>

      {/* ── Preview banner ── */}
      <div
        className="no-print max-w-[220mm] mx-auto mt-6 mb-3 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
        style={{
          background: "var(--background-warning-light)",
          border: "1px solid var(--warning-80)",
          color: "var(--foreground-warning-default)",
        }}
      >
        <Printer size={14} className="shrink-0" />
        <span>
          แสดง <strong>{stations.length} จดหมาย</strong> สำหรับสถานีที่ยังไม่ส่งรายงาน
          — กดปุ่ม &quot;พิมพ์ / บันทึก PDF&quot; หรือ Ctrl+P เพื่อพิมพ์หรือบันทึกเป็น PDF
        </span>
      </div>

      {/* ── Letters ── */}
      <div ref={printAreaRef} className="letters-container">
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; background: white; }
            .letters-container { padding: 0; }
            .letter-page { page-break-after: always; }
            .letter-page:last-child { page-break-after: avoid; }
          }
          @page {
            size: A4;
            margin: 0;
          }
        `}</style>

        {stations.map((s, i) => (
          <WarningLetter
            key={s.stationId}
            station={s}
            provinceName={provinceName}
            provinceCode={provinceCode}
            periodLabel={periodLabel}
            dueDate={period.dueDate}
            issueDate={issueDate}
            letterNo={i + 1}
            total={stations.length}
          />
        ))}
      </div>
    </>
  );
}
