"use client";

import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Search } from "lucide-react";

interface MapPickerProps {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
}

const THAILAND_CENTER = { lat: 13.0, lng: 101.0 };
const ROUND = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

// Configure the Maps API bootstrap once (module-level, no-op on repeat calls)
setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  v: "weekly",
});

export function MapPicker({ lat, lon, onChange }: MapPickerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    const el = mapDivRef.current;
    if (!el) return;
    let isMounted = true;

    async function init() {
      // Load both libraries before touching the DOM
      await importLibrary("maps");
      await importLibrary("places");
      if (!isMounted || !mapDivRef.current) return;

      const hasCoords = lat != null && lon != null;

      const map = new google.maps.Map(mapDivRef.current, {
        center: hasCoords ? { lat: lat!, lng: lon! } : THAILAND_CENTER,
        zoom: hasCoords ? 17 : 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "cooperative",
      });

      // Drop marker if coords already set
      if (hasCoords) {
        const m = new google.maps.Marker({
          position: { lat: lat!, lng: lon! },
          map,
          draggable: true,
          animation: google.maps.Animation.DROP,
        });
        m.addListener("dragend", () => {
          const pos = m.getPosition()!;
          onChange(ROUND(pos.lat()), ROUND(pos.lng()));
        });
        markerRef.current = m;
      }

      // Click map → place / move marker
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const newLat = ROUND(e.latLng.lat());
        const newLng = ROUND(e.latLng.lng());

        if (markerRef.current) {
          markerRef.current.setPosition(e.latLng);
        } else {
          const m = new google.maps.Marker({
            position: e.latLng,
            map,
            draggable: true,
            animation: google.maps.Animation.DROP,
          });
          m.addListener("dragend", () => {
            const pos = m.getPosition()!;
            onChange(ROUND(pos.lat()), ROUND(pos.lng()));
          });
          markerRef.current = m;
        }
        onChange(newLat, newLng);
      });

      // Places Autocomplete — search box
      if (searchRef.current) {
        const ac = new google.maps.places.Autocomplete(searchRef.current, {
          fields: ["geometry", "name"],
          componentRestrictions: { country: "th" },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const newLat = ROUND(place.geometry.location.lat());
          const newLng = ROUND(place.geometry.location.lng());

          map.panTo({ lat: newLat, lng: newLng });
          map.setZoom(17);

          if (markerRef.current) {
            markerRef.current.setPosition({ lat: newLat, lng: newLng });
          } else {
            const m = new google.maps.Marker({
              position: { lat: newLat, lng: newLng },
              map,
              draggable: true,
              animation: google.maps.Animation.DROP,
            });
            m.addListener("dragend", () => {
              const pos = m.getPosition()!;
              onChange(ROUND(pos.lat()), ROUND(pos.lng()));
            });
            markerRef.current = m;
          }
          onChange(newLat, newLng);
        });
      }

      mapRef.current = map;
    }

    void init();

    return () => {
      isMounted = false;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear marker when coords reset externally (e.g. "ล้าง" button)
  useEffect(() => {
    if (lat == null || lon == null) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    }
  }, [lat, lon]);

  return (
    <div className="flex flex-col" style={{ borderRadius: "0.75rem", overflow: "hidden" }}>
      {/* Search box */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        />
        <input
          ref={searchRef}
          type="text"
          placeholder="ค้นหาชื่อสถานที่หรือที่อยู่…"
          className="w-full pl-8 pr-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--canvas-white)",
            borderBottom: "1px solid var(--stroke-neutral-lighter)",
            color: "var(--input-input-default)",
          }}
        />
      </div>

      {/* Map canvas */}
      <div ref={mapDivRef} style={{ width: "100%", height: 320 }} />
    </div>
  );
}
