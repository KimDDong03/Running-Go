'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { applyKoreanMapLabels, applyRoadVisualStyle, NAVER_LIKE_MAP_STYLE } from '@/lib/map-style';

interface MapProps {
  className?: string;
  onMapLoad?: (map: maplibregl.Map) => void;
  center?: [number, number];
  zoom?: number;
}

export function Map({ className, onMapLoad, center = [126.978, 37.5665], zoom = 13 }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: NAVER_LIKE_MAP_STYLE,
      center: center,
      zoom: zoom,
    });

    const handleMapStyleData = () => {
      if (!map.current) return;
      applyKoreanMapLabels(map.current);
      applyRoadVisualStyle(map.current);
    };

    map.current.on('load', () => {
      handleMapStyleData();
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
