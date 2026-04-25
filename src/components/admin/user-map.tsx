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
          <a href="https://www.google.com/maps/search/?api=1&query=${user.gpsLat},${user.gpsLng}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#3b82f6;margin:0 0 2px;text-decoration:none;display:flex;align-items:center;gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${user.gpsAddress || user.location || "Open in Maps"}
          </a>
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
