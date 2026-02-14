'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LocateFixed, Pause, Play, Square } from 'lucide-react';
import { trpc } from '@/components/providers/TRPCProvider';
import { applyKoreanMapLabels, applyRoadVisualStyle, NAVER_LIKE_MAP_STYLE } from '@/lib/map-style';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.dev.mapbox.token';

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
}

function RunPageContent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasPath, setHasPath] = useState(false);
  const [, setPath] = useState<GPSPoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [isAutoCenterEnabled, setIsAutoCenterEnabled] = useState(true);
  const lastRecordedAtRef = useRef<number | null>(null);
  const watchId = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const currentMarker = useRef<mapboxgl.Marker | null>(null);
  const mapLoadedRef = useRef(false);
  const isTrackingRef = useRef(false);
  const pathRef = useRef<GPSPoint[]>([]);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationRef = useRef(0);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);
  const isAutoCenterRef = useRef(true);
  const courseWaypointsRef = useRef<{ lat: number; lng: number; order: number }[]>([]);
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const router = useRouter();
  const collectMutation = trpc.collection.collect.useMutation();
  const freeRunMutation = trpc.runSession.createFreeRun.useMutation();
  const { data: course } = trpc.course.byId.useQuery({ id: courseId ?? '' }, { enabled: Boolean(courseId) });

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    isAutoCenterRef.current = isAutoCenterEnabled;
  }, [isAutoCenterEnabled]);

  const courseWaypoints = useMemo(() => {
    if (!course || !Array.isArray(course.waypoints)) return [] as { lat: number; lng: number; order: number }[];
    return [...(course.waypoints as { lat: number; lng: number; order: number }[])].sort(
      (a, b) => a.order - b.order
    );
  }, [course]);

  useEffect(() => {
    courseWaypointsRef.current = courseWaypoints;
  }, [courseWaypoints]);

  const handleNewPoint = (latitude: number, longitude: number, accuracy: number, timestamp: number) => {
    setCurrentAccuracy(accuracy);
    const newPoint: GPSPoint = {
      lat: latitude,
      lng: longitude,
      timestamp,
      accuracy,
    };

    updateCurrentMarker(latitude, longitude);

    if (lastRecordedAtRef.current && timestamp - lastRecordedAtRef.current < 3000) {
      return;
    }
    lastRecordedAtRef.current = timestamp;

    if (accuracy > 20) {
      return;
    }

    setPath((prev) => {
      if (prev.length > 0) {
        const dist = calculateDistance(prev[prev.length - 1], newPoint);
        setDistance((d) => d + dist);
      }
      const nextPath = [...prev, newPoint];
      setHasPath(nextPath.length > 0);
      pathRef.current = nextPath;
      updatePathLine(nextPath);
      return nextPath;
    });

    
  };

  const updateCurrentMarker = (latitude: number, longitude: number) => {
    if (currentMarker.current) {
      currentMarker.current.setLngLat([longitude, latitude]);
    } else if (map.current) {
      currentMarker.current = new mapboxgl.Marker({ color: '#0ea5e9' })
        .setLngLat([longitude, latitude])
        .addTo(map.current);
    }

    if (!isTrackingRef.current || isAutoCenterRef.current) {
      map.current?.setCenter([longitude, latitude]);
    }
  };

  const fitMapToCourse = (points: { lat: number; lng: number }[]) => {
    if (!map.current || points.length < 2) return;

    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.lng, point.lat]));

    map.current.fitBounds(bounds, {
      padding: { top: 150, right: 40, bottom: 220, left: 40 },
      duration: 500,
      maxZoom: 16,
    });
  };

  const handleRecenter = () => {
    const lastPosition = lastPositionRef.current;
    if (lastPosition) {
      map.current?.easeTo({
        center: [lastPosition.coords.longitude, lastPosition.coords.latitude],
        duration: 400,
      });
      setIsAutoCenterEnabled(true);
      return;
    }

    const markerPosition = currentMarker.current?.getLngLat();
    if (markerPosition) {
      map.current?.easeTo({
        center: [markerPosition.lng, markerPosition.lat],
        duration: 400,
      });
      setIsAutoCenterEnabled(true);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: NAVER_LIKE_MAP_STYLE,
      center: [126.978, 37.5665],
      zoom: 15,
    });

    const applyMapStyle = () => {
      const mapInstance = map.current;
      if (!mapInstance) return;
      applyKoreanMapLabels(mapInstance);
      applyRoadVisualStyle(mapInstance);
      const layers = mapInstance.getStyle().layers ?? [];
      layers.forEach((layer) => {
        if (layer.type === 'symbol' && mapInstance.getLayer(layer.id)) {
          mapInstance.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      });
    };

    const handleMapClick = (event: mapboxgl.MapMouseEvent) => {
      if (isTrackingRef.current) return;
      const { lat, lng } = event.lngLat;
      updateCurrentMarker(lat, lng);
    };

    const handleManualMove = () => {
      if (!isTrackingRef.current || !isAutoCenterRef.current) return;
      setIsAutoCenterEnabled(false);
    };

    map.current.on('load', () => {
      mapLoadedRef.current = true;
      applyMapStyle();

      const initialCoursePoints = courseWaypointsRef.current;
      if (initialCoursePoints.length >= 2) {
        updateCourseLine(initialCoursePoints);
        fitMapToCourse(initialCoursePoints);
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            updateCurrentMarker(
              position.coords.latitude,
              position.coords.longitude
            );
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
    });
    map.current.on('click', handleMapClick);
    map.current.on('dragstart', handleManualMove);
    map.current.on('zoomstart', handleManualMove);

    return () => {
      map.current?.off('click', handleMapClick);
      map.current?.off('dragstart', handleManualMove);
      map.current?.off('zoomstart', handleManualMove);
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
      toast.error('GPS를 지원하지 않는 브라우저입니다');
      return;
    }

    setIsTracking(true);
    setPath([]);
    pathRef.current = [];
    setDistance(0);
    setDuration(0);
    setHasPath(false);
    setIsPaused(false);
    setIsAutoCenterEnabled(true);
    pausedDurationRef.current = 0;
    pausedAtRef.current = null;
    lastPositionRef.current = null;
    lastRecordedAtRef.current = null;

    // Watch position
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position;
        const { latitude, longitude, accuracy } = position.coords;
        handleNewPoint(latitude, longitude, accuracy, Date.now());
      },
      (err) => {
        toast.error(`GPS 오류: ${err.message}`);
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
    setIsPaused(false);
    setIsAutoCenterEnabled(true);
    pausedAtRef.current = null;
    setHasPath(false);
    lastRecordedAtRef.current = null;

    if (courseId && pathRef.current.length >= 2) {
      collectMutation.mutate(
        {
          courseId,
          path: pathRef.current,
          distance: Number((distance / 1000).toFixed(3)),
          duration,
          endedAt: new Date(),
        },
        {
          onSuccess: (data) => {
            const reason = data.reason ? encodeURIComponent(data.reason) : '';
            router.push(
              `/run/result?courseId=${courseId}` +
                `&runSessionId=${data.runSessionId}` +
                `&isCollected=${data.isCollected}` +
                `&matchRate=${data.matchRate}` +
                (reason ? `&reason=${reason}` : '')
            );
          },
          onError: (error) => {
            const reason = encodeURIComponent(error.message);
            router.push(
              `/run/result?courseId=${courseId}` +
                `&isCollected=false&matchRate=0&reason=${reason}`
            );
          },
        }
      );
      return;
    }

    if (courseId && pathRef.current.length < 2) {
      const reason = encodeURIComponent('경로 데이터가 부족합니다');
      router.push(
        `/run/result?courseId=${courseId}` +
          `&isCollected=false&matchRate=0&reason=${reason}`
      );
      return;
    }

    if (!courseId && pathRef.current.length >= 2) {
      freeRunMutation.mutate(
        {
          path: pathRef.current,
          distance: Number((distance / 1000).toFixed(3)),
          duration,
          endedAt: new Date(),
        },
        {
          onSuccess: (data) => {
            router.push(
              `/run/result?runSessionId=${data.runSessionId}` +
                `&isCollected=false&matchRate=0`
            );
          },
          onError: (error) => {
            const reason = encodeURIComponent(error.message);
            router.push(
              `/run/result?isCollected=false&matchRate=0&reason=${reason}`
            );
          },
        }
      );
      return;
    }

    if (!courseId) {
      const reason = encodeURIComponent('코스 정보가 없습니다');
      router.push(
        `/run/result?isCollected=false&matchRate=0&reason=${reason}`
      );
    }
  };

  const pauseTracking = () => {
    if (!isTracking) return;
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    setIsTracking(false);
    setIsPaused(true);
  };

  const resumeTracking = () => {
    if (!navigator.geolocation) {
      toast.error('GPS를 지원하지 않는 브라우저입니다');
      return;
    }
    setIsPaused(false);
    setIsTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position;
        const { latitude, longitude, accuracy } = position.coords;
        handleNewPoint(latitude, longitude, accuracy, Date.now());
      },
      (err) => {
        toast.error(`GPS 오류: ${err.message}`);
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
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

  const updateCourseLine = (points: { lat: number; lng: number }[]) => {
    if (!map.current || points.length < 2) return;
    const coordinates = points.map((p) => [p.lng, p.lat]);

    if (map.current.getSource('course-path')) {
      (map.current.getSource('course-path') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    } else {
      map.current.addSource('course-path', {
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
        id: 'course-path',
        type: 'line',
        source: 'course-path',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#22c55e',
          'line-width': 4,
        },
      });
    }
  };

  useEffect(() => {
    if (!mapLoadedRef.current || !courseWaypoints.length) return;
    updateCourseLine(courseWaypoints);
    if (!isTrackingRef.current && !hasPath) {
      fitMapToCourse(courseWaypoints);
    }
  }, [courseWaypoints, hasPath]);

  useEffect(() => {
    if (isPaused) {
      pausedAtRef.current = Date.now();
      return;
    }

    if (!isPaused && pausedAtRef.current) {
      pausedDurationRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [isPaused]);

  useEffect(() => {
    if (!isTracking) return;

    if (!startTime.current) {
      startTime.current = Date.now();
    }

    intervalId.current = setInterval(() => {
      if (startTime.current) {
        const elapsed = Date.now() - startTime.current - pausedDurationRef.current;
        setDuration(Math.max(0, Math.floor(elapsed / 1000)));
      }
    }, 1000);

    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
    };
  }, [isTracking]);

  useEffect(() => {
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (intervalId.current) clearInterval(intervalId.current);
    };
  }, []);

  return (
    <div className="rg-page pb-28">
      {/* Map */}
      <div className="h-screen relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Stats Overlay */}
        <div className="absolute top-4 left-4 right-4 rg-soft-panel rg-fade p-4">
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
          <div className="mt-3 text-center text-xs text-slate-500">
            정확도 {currentAccuracy ? `±${Math.round(currentAccuracy)}m` : '-'}
          </div>
        </div>

        {course && courseWaypoints.length >= 2 ? (
          <div className="absolute top-36 left-4 right-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-800 shadow-sm backdrop-blur">
            목표 코스: <span className="font-semibold">{course.title}</span> · {(course.totalDistance ?? 0).toFixed(1)}km
          </div>
        ) : null}

        {isTracking && !isAutoCenterEnabled ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute bottom-36 right-4 rounded-full border border-white/70 bg-white/90 shadow-lg"
            onClick={handleRecenter}
          >
            <LocateFixed className="mr-1 h-4 w-4" />
            Centered
          </Button>
        ) : null}
      </div>

      {/* Controls */}
    <div className="rg-safe-bottom fixed bottom-0 left-0 right-0 border-t border-white/70 bg-white/85 p-6 backdrop-blur-xl shadow-[0_-14px_30px_-26px_rgba(15,23,42,0.7)]">
        {!isTracking ? (
          <Button
            size="lg"
            className="rg-touch w-full h-16 text-lg rounded-2xl bg-primary hover:bg-primary/90"
            onClick={isPaused && hasPath ? resumeTracking : startTracking}
          >
            <Play className="w-6 h-6 mr-2" />
            {isPaused && hasPath ? '러닝 재개' : '러닝 시작'}
          </Button>
        ) : (
          <div className="flex gap-4">
            <Button
              size="lg"
              variant="outline"
              className="rg-touch flex-1 h-16 text-lg rounded-2xl"
              onClick={pauseTracking}
            >
              <Pause className="w-6 h-6 mr-2" />
              일시정지
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="rg-touch flex-1 h-16 text-lg rounded-2xl"
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

export default function RunPage() {
  return (
    <Suspense fallback={<div className="rg-page" />}>
      <RunPageContent />
    </Suspense>
  );
}
