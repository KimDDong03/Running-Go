'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// 개발용 더미 토큰
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.dev.mapbox.token';

interface MapProps {
  className?: string;
  onMapLoad?: (map: mapboxgl.Map) => void;
  center?: [number, number];
  zoom?: number;
}

export function Map({ className, onMapLoad, center = [126.978, 37.5665], zoom = 13 }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: center,
      zoom: zoom,
    });

    map.current.on('load', () => {
      setIsLoaded(true);
      onMapLoad?.(map.current!);
    });

    return () => {
      map.current?.remove();
    };
  }, [center, zoom, onMapLoad]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full" />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}
