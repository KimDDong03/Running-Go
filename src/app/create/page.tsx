'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, Trash2, RotateCcw } from 'lucide-react';
import Link from 'next/link';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.dev.mapbox.token';

interface Waypoint {
  lat: number;
  lng: number;
  order: number;
}

export default function CreateCoursePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [126.978, 37.5665], // Seoul
      zoom: 14,
    });

    // Add click handler to add waypoints
    map.current.on('click', (e) => {
      if (waypoints.length >= 30) {
        alert('최대 30개의 waypoint만 추가할 수 있습니다');
        return;
      }

      const { lng, lat } = e.lngLat;
      addWaypoint(lat, lng);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Calculate distance between two points
  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
    const R = 6371;
    const φ1 = p1.lat * Math.PI / 180;
    const φ2 = p2.lat * Math.PI / 180;
    const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
    const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  // Add waypoint
  const addWaypoint = (lat: number, lng: number) => {
    const newWaypoint: Waypoint = { lat, lng, order: waypoints.length };
    const newWaypoints = [...waypoints, newWaypoint];
    setWaypoints(newWaypoints);

    // Add marker
    const marker = new mapboxgl.Marker({ color: '#0ea5e9' })
      .setLngLat([lng, lat])
      .addTo(map.current!);
    
    markersRef.current.push(marker);

    // Update distance
    if (newWaypoints.length > 1) {
      const prev = newWaypoints[newWaypoints.length - 2];
      const dist = calculateDistance(prev, newWaypoint);
      setTotalDistance((d) => d + dist);
    }

    // Draw line
    updateRouteLine(newWaypoints);
  };

  // Update route line on map
  const updateRouteLine = (points: Waypoint[]) => {
    if (!map.current || points.length < 2) return;

    const sourceId = 'route';
    const coordinates = points.map((p) => [p.lng, p.lat]);

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    } else {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        },
      });

      map.current.addLayer({
        id: sourceId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 4,
        },
      });
    }
  };

  // Clear all waypoints
  const clearWaypoints = () => {
    setWaypoints([]);
    setTotalDistance(0);
    
    // Remove markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Remove line
    if (map.current) {
      if (map.current.getLayer('route')) {
        map.current.removeLayer('route');
      }
      if (map.current.getSource('route')) {
        map.current.removeSource('route');
      }
    }
  };

  const isValid = waypoints.length >= 5 && waypoints.length <= 30;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">코스 제작</h1>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={clearWaypoints}
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        
        {/* Instructions */}
        <div className="absolute top-4 left-4 right-4 bg-white/90 backdrop-blur rounded-2xl p-4 shadow-lg">
          <p className="text-sm text-slate-600 text-center">
            지도를 터치해서 waypoint를 추가하세요
          </p>
        </div>
      </div>

      {/* Bottom Panel */}
      <Card className="m-4 rounded-3xl shadow-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Waypoint</p>
              <p className="text-2xl font-bold text-primary">
                {waypoints.length}<span className="text-sm text-slate-400">/30</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">예상 거리</p>
              <p className="text-2xl font-bold text-primary">
                {totalDistance.toFixed(2)}<span className="text-sm text-slate-400">km</span>
              </p>
            </div>
          </div>

          {waypoints.length < 5 && (
            <p className="text-sm text-orange-500 text-center">
              최소 5개의 waypoint가 필요합니다
            </p>
          )}

          <Button
            size="lg"
            className="w-full h-14 text-lg rounded-2xl"
            disabled={!isValid}
            onClick={() => {
              // Navigate to course info input page
              console.log('Waypoints:', waypoints);
            }}
          >
            다음 단계로 →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
