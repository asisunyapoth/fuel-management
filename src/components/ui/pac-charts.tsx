"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

/* ── Shared types (also exported so page.tsx can build data) ─────── */

export type TrendPoint = {
  label: string;        // e.g. "พ.ค. 68"
  volumeSold: number;   // total liters sold (all fuels, all stations)
  closingStock: number; // total closing inventory liters
  submittedCount: number;
  totalStations: number;
  compliancePct: number; // 0-100
  taxCollected: number;  // total tax in THB
};

export type FuelMixPoint = {
  fuelTypeId: string;
  nameTh: string;
  volume: number; // liters
};

interface PacChartsProps {
  trendData: TrendPoint[];
  fuelMix: FuelMixPoint[];
  currentPeriodLabel: string;
}

/* ── Colours ─────────────────────────────────────────────────────── */

const FUEL_COLORS: Record<string, string> = {
  BENZINE_95:  "#8b5cf6",
  GASOHOL_E10: "#10b981",
  GASOHOL_E20: "#06b6d4",
  GASOHOL_E85: "#f59e0b",
  DIESEL_B7:   "#3b82f6",
  DIESEL_B10:  "#6366f1",
  DIESEL_B20:  "#1e40af",
  LPG:         "#f97316",
  NGV:         "#14b8a6",
};

function fuelColor(id: string) {
  return FUEL_COLORS[id] ?? "#6b7280";
}

/* ── Number formatters ───────────────────────────────────────────── */

function fmtL(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

function fmtLFull(v: number) {
  return `${v.toLocaleString("th-TH")} ล.`;
}

function fmtBaht(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

function fmtBahtFull(v: number) {
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Tooltip helpers ─────────────────────────────────────────────── */

const CARD_STYLE: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "12px",
  color: "#374151",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

function VolumeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CARD_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtLFull(p.value)}
        </p>
      ))}
    </div>
  );
}

function ComplianceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TrendPoint | undefined;
  return (
    <div style={CARD_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "#2d6a4f" }}>
        ส่งแล้ว {d?.submittedCount ?? 0}/{d?.totalStations ?? 0} สถานี ({payload[0]?.value ?? 0}%)
      </p>
    </div>
  );
}

function FuelTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CARD_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: payload[0]?.fill }}>
        {fmtLFull(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

function TaxTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CARD_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "#d97706" }}>
        ภาษีที่จัดเก็บ: {fmtBahtFull(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

/* ── Card wrapper ────────────────────────────────────────────────── */

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--canvas-white)",
        border: "1px solid var(--stroke-neutral-lighter)",
      }}
    >
      <div className="mb-3">
        <p className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--foreground-neutral-lightest)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export function PacCharts({ trendData, fuelMix, currentPeriodLabel }: PacChartsProps) {
  if (trendData.length === 0 && fuelMix.length === 0) return null;

  // Sort fuel mix descending for the chart
  const sortedFuel = [...fuelMix].sort((a, b) => b.volume - a.volume);

  return (
    <div className="mb-6 flex flex-col gap-4">

      {/* ── Row 1: Volume sold trend + Closing stock trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Volume sold (liters) */}
        <ChartCard
          title="ปริมาณการจำหน่าย (รวมทุกประเภทน้ำมัน)"
          subtitle="ลิตร · สถานีในจังหวัดที่ส่งรายงานแล้ว"
        >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2d6a4f" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2d6a4f" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={fmtL}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip content={<VolumeTooltip />} />
              <Area
                type="monotone"
                dataKey="volumeSold"
                name="ปริมาณจำหน่าย"
                stroke="#2d6a4f"
                strokeWidth={2}
                fill="url(#gradVolume)"
                dot={{ r: 3, fill: "#2d6a4f", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Closing stock */}
        <ChartCard
          title="ปริมาณสินค้าคงเหลือ (Closing Balance)"
          subtitle="ลิตร · คำนวณจากรายงาน อบจ. 01-6"
        >
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradStock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={fmtL}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip content={<VolumeTooltip />} />
              <Area
                type="monotone"
                dataKey="closingStock"
                name="สินค้าคงเหลือ"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradStock)"
                dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 2: Fuel mix + Compliance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Fuel type breakdown — horizontal bar */}
        <div className="lg:col-span-2">
          <ChartCard
            title={`สัดส่วนประเภทน้ำมัน · ${currentPeriodLabel}`}
            subtitle="รวมทุกสถานีในจังหวัดที่ส่งรายงานแล้ว"
          >
            {sortedFuel.length > 0 ? (
              <ResponsiveContainer width="100%" height={sortedFuel.length * 36 + 8}>
                <BarChart
                  data={sortedFuel}
                  layout="vertical"
                  margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  barSize={20}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={fmtL}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nameTh"
                    tick={{ fontSize: 11, fill: "#374151" }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip content={<FuelTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="volume" name="ปริมาณ" radius={[0, 4, 4, 0]}>
                    {sortedFuel.map((entry) => (
                      <Cell key={entry.fuelTypeId} fill={fuelColor(entry.fuelTypeId)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p
                className="text-xs py-6 text-center"
                style={{ color: "var(--foreground-neutral-lightest)" }}
              >
                ยังไม่มีข้อมูลรอบนี้
              </p>
            )}
          </ChartCard>
        </div>

        {/* Compliance rate over time */}
        <div className="lg:col-span-1">
          <ChartCard
            title="อัตราการส่งรายงาน (%)"
            subtitle="จำนวนสถานีที่ส่งแล้ว / ทั้งหมด"
          >
            <ResponsiveContainer width="100%" height={sortedFuel.length * 36 + 8}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip content={<ComplianceTooltip />} />
                <Line
                  type="monotone"
                  dataKey="compliancePct"
                  stroke="#2d6a4f"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const pct: number = payload.compliancePct ?? 0;
                    const color =
                      pct >= 100 ? "#10b981" :
                      pct >= 80  ? "#2d6a4f" :
                      pct >= 50  ? "#f59e0b" :
                      "#ef4444";
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={color}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* ── Row 3: Tax collected per period ── */}
      {trendData.some((d) => d.taxCollected > 0) && (
        <ChartCard
          title="ภาษีน้ำมันที่จัดเก็บได้ (บาท)"
          subtitle="รวมทุกสถานีในจังหวัดที่ส่งรายงานแล้ว"
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#d97706" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={fmtBaht}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip content={<TaxTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="taxCollected" name="ภาษีที่จัดเก็บ" fill="url(#gradTax)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
