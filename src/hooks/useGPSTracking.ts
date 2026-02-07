'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
}

interface UseGPSTrackingReturn {
  isTracking: boolean;
  path: GPSPoint[];
  currentLocation: { lat: number; lng: number } | null;
  error: string | null;
  startTracking: () => void;
  stopTracking: () => GPSPoint[];
  distance: number;
  duration: number;
}

export function useGPSTracking(): UseGPSTrackingReturn {
  const [isTracking, setIsTracking] = useState(false);
  const [path, setPath] = useState<GPSPoint[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const watchId = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  // Haversine formula for distance calculation
  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
    const R = 6371e3; // Earth radius in meters
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

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS를 지원하지 않는 브라우저입니다');
      return;
    }

    setError(null);
    setPath([]);
    setDistance(0);
    setDuration(0);
    startTime.current = Date.now();
    setIsTracking(true);

    // Update duration every second
    intervalId.current = setInterval(() => {
      if (startTime.current) {
        setDuration(Math.floor((Date.now() - startTime.current) / 1000));
      }
    }, 1000);

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        // Filter low accuracy points (>20m)
        if (accuracy > 20) return;

        const newPoint: GPSPoint = {
          lat: latitude,
          lng: longitude,
          timestamp: Date.now(),
          accuracy,
        };

        setCurrentLocation({ lat: latitude, lng: longitude });
        
        setPath((prev) => {
          // Add point every 3 seconds or if moved more than 5 meters
          if (prev.length === 0) return [newPoint];
          
          const lastPoint = prev[prev.length - 1];
          const timeDiff = newPoint.timestamp - lastPoint.timestamp;
          const dist = calculateDistance(lastPoint, newPoint);
          
          if (timeDiff >= 3000 || dist >= 5) {
            setDistance((d) => d + dist);
            return [...prev, newPoint];
          }
          
          return prev;
        });
      },
      (err) => {
        setError(`GPS 오류: ${err.message}`);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  const stopTracking = useCallback((): GPSPoint[] => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    setIsTracking(false);
    return path;
  }, [path]);

  useEffect(() => {
    return () => {
      if (watchId.current) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
  }, []);

  return {
    isTracking,
    path,
    currentLocation,
    error,
    startTracking,
    stopTracking,
    distance,
    duration,
  };
}
