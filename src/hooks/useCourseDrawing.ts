'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.dev.mapbox.token';

interface Waypoint {
  lat: number;
  lng: number;
  order: number;
}

interface UseCourseDrawingReturn {
  waypoints: Waypoint[];
  addWaypoint: (lat: number, lng: number) => void;
  removeWaypoint: (index: number) => void;
  clearWaypoints: () => void;
  totalDistance: number;
  isValid: boolean;
  mapRef: React.RefObject<mapboxgl.Map | null>;
}

export function useCourseDrawing(): UseCourseDrawingReturn {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
    const R = 6371; // Earth radius in km
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

  // Update total distance whenever waypoints change
  useEffect(() => {
    if (waypoints.length < 2) {
      setTotalDistance(0);
      return;
    }

    let distance = 0;
    for (let i = 1; i < waypoints.length; i++) {
      distance += calculateDistance(waypoints[i-1], waypoints[i]);
    }
    setTotalDistance(Math.round(distance * 100) / 100);
  }, [waypoints]);

  const addWaypoint = useCallback((lat: number, lng: number) => {
    if (waypoints.length >= 30) {
      alert('최대 30개의 waypoint만 추가할 수 있습니다');
      return;
    }

    setWaypoints((prev) => [
      ...prev,
      { lat, lng, order: prev.length },
    ]);
  }, [waypoints.length]);

  const removeWaypoint = useCallback((index: number) => {
    setWaypoints((prev) => {
      const newWaypoints = prev.filter((_, i) => i !== index);
      // Reorder remaining waypoints
      return newWaypoints.map((wp, i) => ({ ...wp, order: i }));
    });
  }, []);

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
    setTotalDistance(0);
  }, []);

  const isValid = waypoints.length >= 5 && waypoints.length <= 30;

  return {
    waypoints,
    addWaypoint,
    removeWaypoint,
    clearWaypoints,
    totalDistance,
    isValid,
    mapRef,
  };
}
