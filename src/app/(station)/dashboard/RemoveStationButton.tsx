"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function RemoveStationButton({
  stationId,
  stationName,
}: {
  stationId: number;
  stationName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      await fetch("/api/internal/onboarding/link-station", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId }),
      });
      router.refresh();
    } catch {
      // ignore — page will just not refresh
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: "var(--foreground-negative-default)" }}>
          ยืนยันลบ?
        </span>
        <button
          onClick={handleRemove}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg"
          style={{ background: "var(--background-negative-light)", color: "var(--foreground-negative-default)" }}
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : null}
          ใช่
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs font-medium px-2 py-0.5 rounded-lg"
          style={{ background: "var(--neutral-96)", color: "var(--foreground-neutral-lighter)" }}
        >
          ยกเลิก
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={`ลบ ${stationName} ออกจากบัญชี`}
      className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
      style={{ color: "var(--foreground-negative-default)" }}
    >
      <Trash2 size={11} />
      ลบ
    </button>
  );
}
