import { AppHeader } from "@/components/ui/app-header";

export default function StationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--canvas-default)" }}>
      <AppHeader
        homeHref="/dashboard"
        subtitle="ระบบรายงานการจำหน่ายน้ำมันเชื้อเพลิง"
        role="station"
      />
      {children}
    </div>
  );
}
