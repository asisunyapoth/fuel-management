import { signIn } from "@/auth";
import { Fuel, ShieldCheck } from "lucide-react";

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--canvas-default)" }}
    >
      {/* ── Brand header ── */}
      <div className="flex flex-col items-center gap-3 mb-10">
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

      {/* ── Sign-in card ── */}
      <div
        className="w-full max-w-sm rounded-2xl shadow-custom p-8 flex flex-col items-center gap-6"
        style={{ background: "var(--canvas-card)" }}
      >
        <div className="text-center">
          <p
            className="text-base font-medium"
            style={{ color: "var(--foreground-neutral-default)" }}
          >
            เข้าสู่ระบบด้วยบัญชีภาครัฐ
          </p>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            ใช้บัญชี Digital ID ของ DGA (ทางรัฐ)
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("dga-digital-id", {
              redirectTo: callbackUrl ?? "/dashboard",
            });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--primary-30-base)" }}
          >
            <ShieldCheck size={20} strokeWidth={1.75} />
            เข้าสู่ระบบด้วย DGA Digital ID
          </button>
        </form>

        <p
          className="text-xs text-center leading-relaxed"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        >
          บัญชีผู้ใช้งานจัดการโดยระบบ Digital ID
          <br />
          ของสำนักงานพัฒนารัฐบาลดิจิทัล (DGA)
        </p>
      </div>
    </main>
  );
}
