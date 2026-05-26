"use client";

import { useState } from "react";
import { Trash2, Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";

interface Manager {
  userId: string;
  linkedAt: string;
}

interface Props {
  stationId: number;
  managers: Manager[];
}

export function ManagerList({ stationId, managers: initial }: Props) {
  const router = useRouter();
  const [managers, setManagers] = useState(initial);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlink(userId: string) {
    if (!confirm(`ยืนยันการยกเลิกการเชื่อมโยงผู้ใช้ ${userId.slice(0, 12)}… ?`)) return;

    setUnlinking(userId);
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/admin/stations/${stationId}/managers/${userId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setManagers((prev) => prev.filter((m) => m.userId !== userId));
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "เกิดข้อผิดพลาด");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setUnlinking(null);
    }
  }

  function fmt(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (managers.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
        ยังไม่มีผู้จัดการที่ลงทะเบียน
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--background-negative-light)", color: "var(--foreground-negative-default)" }}>
          {error}
        </p>
      )}
      {managers.map((m) => (
        <div
          key={m.userId}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: "var(--neutral-97)", border: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <span
            className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
            style={{ background: "var(--primary-95)" }}
          >
            <User size={13} style={{ color: "var(--primary-30-base)" }} />
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono truncate" style={{ color: "var(--foreground-neutral-default)" }}>
              {m.userId}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
              เชื่อมโยงเมื่อ {fmt(m.linkedAt)}
            </p>
          </div>

          <button
            onClick={() => handleUnlink(m.userId)}
            disabled={unlinking === m.userId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0"
            style={{
              background: "var(--background-negative-light)",
              color: "var(--foreground-negative-default)",
              cursor: unlinking === m.userId ? "wait" : "pointer",
            }}
          >
            {unlinking === m.userId ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            ยกเลิก
          </button>
        </div>
      ))}
    </div>
  );
}
