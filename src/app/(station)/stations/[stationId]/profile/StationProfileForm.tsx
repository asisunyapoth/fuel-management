"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ImagePlus,
  Trash2,
  Phone,
  MapPin,
  Building2,
  Navigation,
  X,
} from "lucide-react";

// Leaflet must not be SSR'd
const MapPicker = dynamic(
  () => import("@/components/map/MapPicker").then((m) => m.MapPicker),
  { ssr: false, loading: () => (
    <div
      className="w-full flex items-center justify-center rounded-xl"
      style={{ height: 320, background: "var(--neutral-96)", color: "var(--foreground-neutral-lighter)", fontSize: 14 }}
    >
      กำลังโหลดแผนที่…
    </div>
  )}
);

interface PhotoMeta {
  url: string;
  name: string;
  uploadedAt: string;
}

interface StationProfileFormProps {
  stationId: number;
  initialData: {
    name: string;
    address: string;
    phone: string;
    lat: string;
    lon: string;
    photos: PhotoMeta[];
  };
}

/* ── Field wrapper ───────────────────────────────────────────── */
function Field({
  id,
  label,
  hint,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ size: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--input-label-default)" }}
      >
        {Icon && <Icon size={13} />}
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
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
  );
}

/* ── Main component ──────────────────────────────────────────── */

export function StationProfileForm({ stationId, initialData }: StationProfileFormProps) {
  const [name, setName] = useState(initialData.name);
  const [address, setAddress] = useState(initialData.address);
  const [phone, setPhone] = useState(initialData.phone);
  const [lat, setLat] = useState<number | null>(
    initialData.lat ? parseFloat(initialData.lat) : null
  );
  const [lon, setLon] = useState<number | null>(
    initialData.lon ? parseFloat(initialData.lon) : null
  );
  const [photos, setPhotos] = useState<PhotoMeta[]>(initialData.photos);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Geolocation ── */
  function handleLocateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Math.round(pos.coords.latitude * 1_000_000) / 1_000_000);
        setLon(Math.round(pos.coords.longitude * 1_000_000) / 1_000_000);
      },
      () => {/* user denied — ignore */}
    );
  }

  /* ── Save profile ── */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/internal/stations/${stationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address,
          phone,
          lat,   // number | null — server schema expects a number, not a string
          lon,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setSaveStatus("error");
    }
  }

  /* ── Upload photo ── */
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/internal/stations/${stationId}/photos`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error ?? "อัพโหลดไม่สำเร็จ");
        return;
      }
      setPhotos((prev) => [...prev, data.photo]);
    } catch {
      setPhotoError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ── Delete photo ── */
  async function handleDeletePhoto(photoUrl: string) {
    try {
      const res = await fetch(`/api/internal/stations/${stationId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: photoUrl }),
      });
      if (res.ok) setPhotos((prev) => prev.filter((p) => p.url !== photoUrl));
    } catch {/* ignore */}
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Profile card ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
            ข้อมูลทั่วไป
          </h2>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-5">
          <Field id="name" label="ชื่อสถานีบริการ" icon={Building2}>
            <TextInput id="name" value={name} onChange={setName} placeholder="ชื่อสถานี" />
          </Field>

          <Field id="address" label="ที่อยู่">
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ที่อยู่สถานีบริการ"
              rows={3}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all resize-none"
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
          </Field>

          <Field id="phone" label="เบอร์โทรศัพท์" icon={Phone}>
            <TextInput
              id="phone"
              value={phone}
              onChange={setPhone}
              placeholder="0XX-XXX-XXXX"
              inputMode="tel"
            />
          </Field>

          {/* ── Location (map) ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--input-label-default)" }}
              >
                <MapPin size={13} />
                ตำแหน่งที่ตั้ง
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLocateMe}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium"
                  style={{
                    background: "var(--primary-95)",
                    color: "var(--primary-30-base)",
                    border: "1px solid var(--primary-90)",
                  }}
                >
                  <Navigation size={11} />
                  ใช้ตำแหน่งปัจจุบัน
                </button>
                {(lat != null || lon != null) && (
                  <button
                    type="button"
                    onClick={() => { setLat(null); setLon(null); }}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ color: "var(--foreground-neutral-lighter)" }}
                  >
                    <X size={11} />
                    ล้าง
                  </button>
                )}
              </div>
            </div>

            {/* Map */}
            <div
              style={{
                border: "1px solid var(--stroke-neutral-lighter)",
                borderRadius: "0.75rem",
                overflow: "hidden",
              }}
            >
              <MapPicker lat={lat} lon={lon} onChange={(newLat, newLon) => { setLat(newLat); setLon(newLon); }} />
            </div>

            {/* Coordinates display */}
            {lat != null && lon != null ? (
              <p className="text-xs tabular-nums" style={{ color: "var(--foreground-neutral-lighter)" }}>
                📍 {lat}, {lon}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--foreground-neutral-lightest)" }}>
                คลิกบนแผนที่หรือกด &quot;ใช้ตำแหน่งปัจจุบัน&quot; เพื่อตั้งพิกัด
              </p>
            )}
          </div>

          {/* Error */}
          {saveError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{
                background: "var(--background-negative-light)",
                color: "var(--foreground-negative-default)",
              }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-between">
            {saveStatus === "saved" ? (
              <span
                className="flex items-center gap-1.5 text-sm"
                style={{ color: "var(--foreground-positive-default)" }}
              >
                <CheckCircle2 size={14} /> บันทึกแล้ว
              </span>
            ) : <span />}

            <button
              type="submit"
              disabled={saveStatus === "saving"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                background:
                  saveStatus === "saving"
                    ? "var(--button-background-disabled)"
                    : "var(--button-background-primary-solid)",
                color:
                  saveStatus === "saving"
                    ? "var(--button-foreground-disabled)"
                    : "var(--button-foreground-primary-on-solid)",
                cursor: saveStatus === "saving" ? "wait" : "pointer",
              }}
            >
              {saveStatus === "saving" ? (
                <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก…</>
              ) : (
                <><Save size={14} /> บันทึก</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── Photos card ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
            รูปภาพสถานีบริการ
          </h2>
          <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
            {photos.length} รูป
          </span>
        </div>

        <div className="px-6 py-5">
          {photoError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm mb-4"
              style={{
                background: "var(--background-negative-light)",
                color: "var(--foreground-negative-default)",
              }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {photoError}
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {photos.map((photo) => (
                <div
                  key={photo.url}
                  className="relative group rounded-xl overflow-hidden aspect-square"
                  style={{ background: "var(--neutral-96)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <button
                      onClick={() => handleDeletePhoto(photo.url)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: "rgba(220,38,38,0.9)" }}
                    >
                      <Trash2 size={11} />
                      ลบ
                    </button>
                  </div>
                  <div
                    className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs truncate"
                    style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
                  >
                    {photo.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <button
            type="button"
            disabled={uploadingPhoto}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full justify-center"
            style={{
              background: "var(--primary-95)",
              color: "var(--primary-30-base)",
              border: "1px dashed var(--primary-80)",
              cursor: uploadingPhoto ? "wait" : "pointer",
            }}
          >
            {uploadingPhoto ? (
              <><Loader2 size={14} className="animate-spin" /> กำลังอัพโหลด…</>
            ) : (
              <><ImagePlus size={14} /> เพิ่มรูปภาพ (สูงสุด 5 MB)</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
