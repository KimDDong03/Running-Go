'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Pause, Play, Square } from 'lucide-react';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.dev.mapbox.token';

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
}

export default function RunPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [path, setPath] = useState<GPSPoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const watchId = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const currentMarker = useRef<mapboxgl.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [126.978, 37.5665],
      zoom: 15,
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Calculate distance
  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
    const R = 6371e3;
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

  // Format duration
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format pace
  const formatPace = (durationSec: number, distKm: number): string => {
    if (distKm === 0) return "--'--\"";
    const paceMinPerKm = (durationSec / 60) / distKm;
    const min = Math.floor(paceMinPerKm);
    const sec = Math.floor((paceMinPerKm - min) * 60);
    return `${min}'${sec.toString().padStart(2, '0')}"`;
  };

  // Start tracking
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert('GPS를 지원하지 않는 브라우저입니다');
      return;
    }

    setIsTracking(true);
    setPath([]);
    setDistance(0);
    setDuration(0);
    startTime.current = Date.now();

    // Update duration
    intervalId.current = setInterval(() => {
      if (startTime.current) {
        setDuration(Math.floor((Date.now() - startTime.current) / 1000));
      }
    }, 1000);

    // Watch position
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        if (accuracy > 20) return;

        const newPoint: GPSPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: Date.now(),
          accuracy,
        };

        setPath((prev) => {
          if (prev.length > 0) {
            const dist = calculateDistance(prev[prev.length - 1], newPoint);
            setDistance((d) => d + dist);
          }
          return [...prev, newPoint];
        });

        // Update marker
        if (currentMarker.current) {
          currentMarker.current.setLngLat([longitude, latitude]);
        } else {
          currentMarker.current = new mapboxgl.Marker({ color: '#0ea5e9' })
            .setLngLat([longitude, latitude])
            .addTo(map.current!);
        }

        // Center map
        map.current?.setCenter([longitude, latitude]);

        // Draw path
        updatePathLine([...path, newPoint]);
      },
      (err) => {
        alert(`GPS 오류: ${err.message}`);
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Stop tracking
  const stopTracking = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    setIsTracking(false);
  };

  // Update path line
  const updatePathLine = (points: GPSPoint[]) => {
    if (!map.current || points.length < 2) return;

    const coordinates = points.map((p) => [p.lng, p.lat]);

    if (map.current.getSource('run-path')) {
      (map.current.getSource('run-path') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    } else {
      map.current.addSource('run-path', {
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
        id: 'run-path',
        type: 'line',
        source: 'run-path',
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

  useEffect(() => {
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (intervalId.current) clearInterval(intervalId.current);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Stats Overlay */}
        <div className="absolute top-4 left-4 right-4 bg-white/90 backdrop-blur rounded-2xl p-4 shadow-lg">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{formatDuration(duration)}</div>
              <div className="text-xs text-slate-600">시간</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{(distance / 1000).toFixed(2)}</div>
              <div className="text-xs text-slate-600">km</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{formatPace(duration, distance / 1000)}</div>
              <div className="text-xs text-slate-600">페이스</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-6 bg-white border-t">
        {!isTracking ? (
          <Button
            size="lg"
            className="w-full h-16 text-lg rounded-2xl bg-primary hover:bg-primary/90"
            onClick={startTracking}
          >
            <Play className="w-6 h-6 mr-2" />
            러닝 시작
          </Button>
        ) : (
          <div className="flex gap-4">
            <Button
              size="lg"
              variant="outline"
              className="flex-1 h-16 text-lg rounded-2xl"
              onClick={() => {}}
            >
              <Pause className="w-6 h-6 mr-2" />
              일시정지
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="flex-1 h-16 text-lg rounded-2xl"
              onClick={stopTracking}
            >
              <Square className="w-6 h-6 mr-2" />
              종료
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
