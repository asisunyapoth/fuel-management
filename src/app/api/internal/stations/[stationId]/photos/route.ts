import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import { db } from "@/db";
import { stations, userStationLinks } from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";

async function verifyOwnership(userId: string, stationId: number) {
  const [row] = await db
    .select({ stationId: stations.stationId, photos: stations.photos })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(and(eq(stations.stationId, stationId), eq(userStationLinks.clerkUserId, userId)))
    .limit(1);
  return row ?? null;
}

/** POST — upload a photo for a station */
export const POST = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const stationId = parseInt(segments[segments.length - 2]);
  if (isNaN(stationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const row = await verifyOwnership(ctx.userId, stationId);
  if (!row) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 422 });

  // Validate type
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "ไฟล์ต้องเป็นรูปภาพเท่านั้น" }, { status: 422 });
  }

  // 5 MB limit
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "ไฟล์ขนาดใหญ่เกิน 5 MB" }, { status: 422 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  let photoUrl: string;

  if (process.env.NODE_ENV === "production" && process.env.NETLIFY_TOKEN) {
    // ── Production: Netlify Blobs ─────────────────────────────
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({
      name: "station-photos",
      token: process.env.NETLIFY_TOKEN,
      siteID: process.env.NETLIFY_SITE_ID ?? "",
    });
    const arrayBuffer = await file.arrayBuffer();
    const blobKey = `stations/${stationId}/${safeName}`;
    await store.set(blobKey, arrayBuffer, { metadata: { contentType: file.type } });
    photoUrl = `/.netlify/blobs/${blobKey}`;
  } else {
    // ── Development: local filesystem under public/ ───────────
    const dir = path.join(process.cwd(), "public", "station-photos", String(stationId));
    await fs.mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, safeName), buffer);
    photoUrl = `/station-photos/${stationId}/${safeName}`;
  }

  // Append photo to station's photos array
  const currentPhotos = row.photos ?? [];
  const newPhoto = { url: photoUrl, name: file.name, uploadedAt: new Date().toISOString() };

  await db
    .update(stations)
    .set({ photos: [...currentPhotos, newPhoto] })
    .where(eq(stations.stationId, stationId));

  return NextResponse.json({ success: true, photo: newPhoto });
});

/** DELETE — remove a photo by URL */
export const DELETE = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const stationId = parseInt(url.pathname.split("/").at(-2) ?? "");
  if (isNaN(stationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const row = await verifyOwnership(ctx.userId, stationId);
  if (!row) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const photoUrl: string = body?.url;
  if (!photoUrl) return NextResponse.json({ error: "No url provided" }, { status: 422 });

  const filtered = (row.photos ?? []).filter((p) => p.url !== photoUrl);
  await db.update(stations).set({ photos: filtered }).where(eq(stations.stationId, stationId));

  // Delete file from disk in dev
  if (process.env.NODE_ENV !== "production" && photoUrl.startsWith("/station-photos/")) {
    try {
      await fs.unlink(path.join(process.cwd(), "public", photoUrl));
    } catch {/* ignore if already gone */}
  }

  return NextResponse.json({ success: true });
});
