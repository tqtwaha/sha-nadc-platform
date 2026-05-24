'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface IncidentMarker {
  id: string;
  display_id: string;
  priority: 1 | 2 | 3 | 4;
  complaint: string;
  status: string;
  lat: number;
  lng: number;
  unit_id: string | null;
}

interface UnitMarker {
  id: string;
  type: 'ALS' | 'BLS';
  lat: number;
  lng: number;
  status: string;
}

interface HospitalMarker {
  id: string;
  name: string;
  level: number;
  lat: number;
  lng: number;
  ed_capacity_pct: number;
  diversion_status: 'open' | 'caution' | 'diverting' | 'bypass';
}

interface Props {
  incidents: IncidentMarker[];
  units?: UnitMarker[];
  hospitals?: HospitalMarker[];
  height?: string;
}

// Mapbox-only renderer for the dispatch console. Stays inside its own
// container, never blocks SSR (mapbox-gl is browser-only). Re-renders
// markers in place when props change so realtime updates feel smooth.

const PRIORITY_COLOR: Record<number, string> = {
  1: '#FF3B30',
  2: '#FF8C00',
  3: '#F5B100',
  4: '#27AAE1',
};

const NAIROBI_CENTER: [number, number] = [36.8219, -1.2921];

export function DispatchMap({ incidents, units = [], hospitals = [], height = '420px' }: Props) {
  const router = useRouter();
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [missingToken, setMissingToken] = useState(false);

  // Boot map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMissingToken(true);
      return;
    }
    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: NAIROBI_CENTER,
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right');
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-render markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    // Incident pins
    for (const inc of incidents) {
      const el = document.createElement('button');
      el.title = `${inc.display_id} · ${inc.complaint}`;
      el.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%;
        background: ${PRIORITY_COLOR[inc.priority] ?? '#888'};
        border: 2px solid #fff; box-shadow: 0 0 8px ${PRIORITY_COLOR[inc.priority] ?? '#888'};
        cursor: pointer; padding: 0;
        font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
        color: #fff; display: flex; align-items: center; justify-content: center;
      `;
      el.textContent = `${inc.priority}`;
      el.onclick = () => router.push(`/dispatch/${inc.id}`);

      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([inc.lng, inc.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(`
            <div style="font-family: 'Exo 2', sans-serif; color: #111; padding: 4px 0;">
              <div style="font-weight: 700;">${inc.complaint}</div>
              <div style="font-family: monospace; font-size: 10px; color: #555; margin-top: 2px;">
                ${inc.display_id} · ${inc.status}${inc.unit_id ? ' · ' + inc.unit_id : ''}
              </div>
            </div>
          `),
        )
        .addTo(map);
      markersRef.current.push(m);
    }

    // Hospital plus-sign markers (color = diversion + capacity)
    for (const h of hospitals) {
      const el = document.createElement('button');
      el.title = `${h.name} · L${h.level} · ${h.ed_capacity_pct}% · ${h.diversion_status}`;
      const color =
        h.diversion_status === 'bypass'
          ? '#FF3B30'
          : h.diversion_status === 'diverting'
            ? '#FF8C00'
            : h.diversion_status === 'caution'
              ? '#F5B100'
              : h.ed_capacity_pct >= 90
                ? '#FF3B30'
                : h.ed_capacity_pct >= 75
                  ? '#FF8C00'
                  : '#50C020';
      el.style.cssText = `
        width: 14px; height: 14px; padding: 0; border: 0; cursor: pointer;
        background: ${color}; clip-path: polygon(
          40% 0%, 60% 0%, 60% 40%, 100% 40%,
          100% 60%, 60% 60%, 60% 100%, 40% 100%,
          40% 60%, 0% 60%, 0% 40%, 40% 40%
        );
      `;
      el.onclick = () => router.push(`/hospital/${h.id}`);
      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([h.lng, h.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(`
            <div style="font-family: 'Exo 2', sans-serif; color: #111; padding: 4px 0;">
              <div style="font-weight: 700;">${h.name}</div>
              <div style="font-family: monospace; font-size: 10px; color: #555; margin-top: 2px;">
                L${h.level} · ED ${h.ed_capacity_pct}% · ${h.diversion_status}
              </div>
            </div>
          `),
        )
        .addTo(map);
      markersRef.current.push(m);
    }

    // Unit dots (smaller, green for available, blue for deployed)
    for (const u of units) {
      const el = document.createElement('div');
      el.title = `${u.id} · ${u.type} · ${u.status}`;
      const color = u.status === 'available' ? '#50C020' : '#27AAE1';
      el.style.cssText = `
        width: 10px; height: 10px; border-radius: 50%;
        background: ${color}; border: 1.5px solid #fff;
        box-shadow: 0 0 4px ${color};
      `;
      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([u.lng, u.lat])
        .addTo(map);
      markersRef.current.push(m);
    }
  }, [incidents, units, hospitals, router]);

  if (missingToken) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-lg border border-dashed border-line flex items-center justify-center text-t3 font-mono text-xs px-4 text-center"
      >
        Set <span className="text-t1 mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</span> in your Vercel env
        to enable the live map.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg overflow-hidden border border-line"
    />
  );
}
