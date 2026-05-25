"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, Filter, Loader2 } from "lucide-react";

interface Props {
  provinces: { provinceCode: string; nameTh: string }[];
  defaultSearch?: string;
  defaultProvince?: string;
}

export function StationSearch({ provinces, defaultSearch = "", defaultProvince = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(defaultSearch);
  const [province, setProvince] = useState(defaultProvince);

  function apply(newSearch: string, newProvince: string) {
    const params = new URLSearchParams();
    if (newSearch) params.set("search", newSearch);
    if (newProvince) params.set("province", newProvince);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      {/* Search input */}
      <div className="relative flex-1 min-w-52">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        />
        <input
          type="text"
          placeholder="ค้นหาชื่อ, ที่อยู่, เลขใบอนุญาต..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply(search, province)}
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--input-background-default)",
            border: "1px solid var(--input-stroke-default)",
            color: "var(--input-input-default)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--input-stroke-focused)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--a-primary-a10)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--input-stroke-default)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>

      {/* Province filter */}
      <div className="relative">
        <Filter
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        />
        <select
          value={province}
          onChange={(e) => {
            setProvince(e.target.value);
            apply(search, e.target.value);
          }}
          className="pl-8 pr-8 py-2 rounded-lg text-sm outline-none appearance-none cursor-pointer"
          style={{
            background: "var(--input-background-default)",
            border: "1px solid var(--input-stroke-default)",
            color: "var(--input-input-default)",
            minWidth: "160px",
          }}
        >
          <option value="">ทุกจังหวัด</option>
          {provinces.map((p) => (
            <option key={p.provinceCode} value={p.provinceCode}>
              {p.nameTh}
            </option>
          ))}
        </select>
      </div>

      {/* Search button */}
      <button
        onClick={() => apply(search, province)}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{
          background: "var(--button-background-primary-solid)",
          color: "var(--button-foreground-primary-on-solid)",
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        ค้นหา
      </button>
    </div>
  );
}
