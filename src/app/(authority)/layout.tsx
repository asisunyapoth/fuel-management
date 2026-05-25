import { AppHeader } from "@/components/ui/app-header";

export default function AuthorityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--canvas-default)" }}>
      <AppHeader
        homeHref="/pac"
        subtitle="ระบบกำกับดูแลการจำหน่ายน้ำมันเชื้อเพลิง"
        role="officer"
      />
      {children}
    </div>
  );
}
