"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LoginEvent } from "@/mock/mockData";

function timeAgo(iso: string) {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}초 전`;
  return `${Math.floor(diffSec / 60)}분 전`;
}

export default function WorldMap({ events }: { events: LoginEvent[] }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-line">
      <MapContainer
        key="world-map"
        center={[30, 20]}
        zoom={2}
        minZoom={2}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        {events.map((e) => (
          <CircleMarker
            key={e.id}
            center={[e.lat, e.lng]}
            radius={6}
            pathOptions={{
              color: e.status === "alert" ? "#E8544C" : "#4C9FE8",
              fillColor: e.status === "alert" ? "#E8544C" : "#4C9FE8",
              fillOpacity: 0.9,
              weight: 2,
              className: e.status === "alert" ? "animate-sonar" : "",
            }}
          >
            <Popup>
              <div className="font-mono text-xs leading-relaxed">
                <div className="font-semibold">{e.status === "alert" ? "🔴 이상 탐지" : "🔵 정상 접속"}</div>
                <div>IP: {e.ip}</div>
                <div>위치: {e.country} {e.city}</div>
                <div>프로파일: {e.profile}</div>
                <div>{timeAgo(e.time)}</div>
                {e.ruleId && <div>탐지 룰: {e.ruleId}</div>}
                {e.reason && <div>사유: {e.reason}</div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* 범례 */}
      <div className="absolute bottom-3 left-3 z-[1000] flex gap-4 rounded-md bg-surface/90 px-3 py-2 text-xs text-muted border border-line">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-normal" /> 정상 접속
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" /> 이상 탐지
        </span>
      </div>
    </div>
  );
}
