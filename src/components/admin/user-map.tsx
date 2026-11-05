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

const statusColors: Record<string, string> = {
  approved: "#10B981",
  pending: "#F59E0B",
  rejected: "#EF4444",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export default function UserMapView({ users }: UserMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Create the map exactly once.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [7.9465, -1.0232],
      zoom: 7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // The container is often hidden when the tab opens – make sure tiles fill it.
    const timer = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Re-draw markers whenever the user list changes (data loads asynchronously).
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    users.forEach((user) => {
      if (!user.gpsLat || !user.gpsLng) return;

      const color = statusColors[user.status] || "#6B7280";

      const icon = L.divIcon({
        className: "custom-pin",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const name = escapeHtml(user.name || "Member");
      const email = escapeHtml(user.email || "");
      const address = escapeHtml(user.gpsAddress || user.location || "Open in Maps");
      const status = escapeHtml(user.status || "pending");

      L.marker([user.gpsLat, user.gpsLng], { icon })
        .bindPopup(
          `
        <div style="font-family:Inter,sans-serif;min-width:180px;">
          <p style="font-weight:700;margin:0 0 4px;">${name}</p>
          <p style="font-size:12px;color:#666;margin:0 0 2px;">${email}</p>
          <a href="https://www.google.com/maps/search/?api=1&query=${user.gpsLat},${user.gpsLng}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#3b82f6;margin:0 0 2px;text-decoration:none;display:flex;align-items:center;gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${address}
          </a>
          <p style="font-size:11px;margin:4px 0 0;padding:2px 6px;display:inline-block;border-radius:8px;background:${color}20;color:${color};font-weight:600;text-transform:capitalize;">${status}</p>
        </div>
      `
        )
        .addTo(layer);
    });

    map.invalidateSize();
  }, [users]);

  return <div ref={mapRef} className="w-full h-full min-h-[400px]" />;
}
