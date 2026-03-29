"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { UserDoc } from "@/lib/types";

interface UserItem extends UserDoc {
  id: string;
}

interface UserMapViewProps {
  users: UserItem[];
}

export default function UserMapView({ users }: UserMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [7.9465, -1.0232],
      zoom: 7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const statusColors: Record<string, string> = {
      approved: "#10B981",
      pending: "#F59E0B",
      rejected: "#EF4444",
    };

    users.forEach((user) => {
      if (!user.gpsLat || !user.gpsLng) return;

      const color = statusColors[user.status] || "#6B7280";

      const icon = L.divIcon({
        className: "custom-pin",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker([user.gpsLat, user.gpsLng], { icon });

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:180px;">
          <p style="font-weight:700;margin:0 0 4px;">${user.name}</p>
          <p style="font-size:12px;color:#666;margin:0 0 2px;">${user.email}</p>
          <p style="font-size:12px;color:#666;margin:0 0 2px;">${user.gpsAddress || user.location || "N/A"}</p>
          <p style="font-size:11px;margin:4px 0 0;padding:2px 6px;display:inline-block;border-radius:8px;background:${color}20;color:${color};font-weight:600;text-transform:capitalize;">${user.status}</p>
        </div>
      `);

      marker.addTo(map);
    });

    mapInstanceRef.current = map;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [users]);

  return <div ref={mapRef} className="w-full h-full" />;
}
