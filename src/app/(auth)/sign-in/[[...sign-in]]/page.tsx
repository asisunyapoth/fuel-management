import { SignIn } from "@clerk/nextjs";
import { Fuel } from "lucide-react";

export default function SignInPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--canvas-default)" }}
    >
      {/* ── Brand header ── */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <span
          className="flex items-center justify-center w-14 h-14 rounded-2xl shadow-custom"
          style={{ background: "var(--primary-30-base)" }}
        >
          <Fuel size={28} color="white" strokeWidth={1.75} />
        </span>
        <div className="text-center">
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--foreground-neutral-default)" }}
          >
            ระบบรายงานปริมาณการใช้น้ำมัน
          </h1>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            RFDRS — FQMS Phase 1 · กรมธุรกิจพลังงาน
          </p>
        </div>
      </div>

      <SignIn />
    </main>
  );
}
