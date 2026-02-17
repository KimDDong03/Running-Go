'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, LocateFixed, Pause, Play, Square } from 'lucide-react';
import { trpc } from '@/components/providers/TRPCProvider';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import {
  loadMapSdk,
  type MapLike,
  type MapMarkerLike,
  type MapPolylineLike,
  type MapSdkApi,
} from '@/lib/map/sdk';
import { createCurrentLocationMarkerElement } from '@/lib/current-location-marker';
import { LOCATION_FAB_BASE_CLASS, LOCATION_FAB_TRANSITION_CLASS, getLocationFabBottom } from '@/lib/map-controls';

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
}

const MIN_POINT_INTERVAL_MS = 3000;
const MAX_ALLOWED_ACCURACY_METERS = 20;
const MIN_MOVEMENT_METERS = 2;
const MAX_RUNNING_SPEED_MPS = 8.5;

const hasCoord = (value: unknown): value is { coord: { lat: () => number; lng: () => number } } => {
  if (!value || typeof value !== 'object') return false;
  if (!('coord' in value)) return false;
  const coord = (value as { coord?: unknown }).coord;
  if (!coord || typeof coord !== 'object') return false;
  return typeof (coord as { lat?: unknown }).lat === 'function' && typeof (coord as { lng?: unknown }).lng === 'function';
};

function RunPageContent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const map = useRef<MapLike | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasPath, setHasPath] = useState(false);
  const [, setPath] = useState<GPSPoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [isAutoCenterEnabled, setIsAutoCenterEnabled] = useState(true);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);

  const lastRecordedAtRef = useRef<number | null>(null);
  const watchId = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const currentMarker = useRef<MapMarkerLike | null>(null);
  const currentMarkerImageRef = useRef<string | null>(null);
  const runPathOutlineRef = useRef<MapPolylineLike | null>(null);
  const runPathMainRef = useRef<MapPolylineLike | null>(null);
  const coursePathOutlineRef = useRef<MapPolylineLike | null>(null);
  const coursePathMainRef = useRef<MapPolylineLike | null>(null);
  const mapLoadedRef = useRef(false);
  const isTrackingRef = useRef(false);
  const pathRef = useRef<GPSPoint[]>([]);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationRef = useRef(0);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);
  const isAutoCenterRef = useRef(true);
  const courseWaypointsRef = useRef<{ lat: number; lng: number; order: number }[]>([]);
  const hasInitialLocationRef = useRef(false);

  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const router = useRouter();
  const { locale } = useLocale();
  const isEnglish = locale === 'en';

  const collectMutation = trpc.collection.collect.useMutation();
  const freeRunMutation = trpc.runSession.createFreeRun.useMutation();
  const { data: course } = trpc.course.byId.useQuery({ id: courseId ?? '' }, { enabled: Boolean(courseId) });
  const { data: profileSummary } = trpc.profile.summary.useQuery();

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    isAutoCenterRef.current = isAutoCenterEnabled;
  }, [isAutoCenterEnabled]);

  const courseWaypoints = useMemo(() => {
    if (!course || !Array.isArray(course.waypoints)) return [] as { lat: number; lng: number; order: number }[];
    const normalized = course.waypoints
      .map((point) => {
        if (!point || typeof point !== 'object') return null;

        const lat = (point as { lat?: unknown }).lat;
        const lng = (point as { lng?: unknown }).lng;
        const order = (point as { order?: unknown }).order;

        if (
          typeof lat !== 'number'
          || typeof lng !== 'number'
          || typeof order !== 'number'
          || !Number.isFinite(lat)
          || !Number.isFinite(lng)
          || !Number.isFinite(order)
        ) {
          return null;
        }

        return { lat, lng, order };
      })
      .filter((point): point is { lat: number; lng: number; order: number } => Boolean(point));

    return normalized.sort((a, b) => a.order - b.order);
  }, [course]);

  useEffect(() => {
    courseWaypointsRef.current = courseWaypoints;
  }, [courseWaypoints]);

  const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
    const R = 6371e3;
    const phi1 = p1.lat * Math.PI / 180;
    const phi2 = p2.lat * Math.PI / 180;
    const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
    const deltaLambda = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
      + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toLatLng = useMemo(() => (lat: number, lng: number) => {
    const sdk = mapSdkRef.current;
    if (!sdk) return null;
    return new sdk.LatLng(lat, lng);
  }, []);

  const updateCurrentMarker = useMemo(() => (latitude: number, longitude: number) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    const position = toLatLng(latitude, longitude);
    if (!sdk || !mapInstance || !position) return;

    const markerImage = profileSummary?.user.image ?? null;

    if (!currentMarker.current || currentMarkerImageRef.current !== markerImage) {
      currentMarker.current?.setMap(null);
      currentMarker.current = new sdk.Marker({
        map: mapInstance,
        position,
        icon: {
          content: createCurrentLocationMarkerElement(markerImage, { size: 36 }),
          size: new sdk.Size(36, 36),
          anchor: new sdk.Point(18, 18),
        },
      });
      currentMarkerImageRef.current = markerImage;
    } else {
      currentMarker.current.setPosition(position);
    }

    if (!isTrackingRef.current || isAutoCenterRef.current) {
      mapInstance.setCenter(position);
    }
  }, [profileSummary?.user.image, toLatLng]);

  const fitMapToCourse = useMemo(() => (points: { lat: number; lng: number }[]) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance || points.length < 2) return;

    const bounds = new sdk.LatLngBounds();
    points.forEach((point) => {
      const latLng = new sdk.LatLng(point.lat, point.lng);
      bounds.extend(latLng);
    });
    mapInstance.fitBounds(bounds, { top: 150, right: 40, bottom: 220, left: 40 });
  }, []);

  const handleRecenter = () => {
    const lastPosition = lastPositionRef.current;
    if (lastPosition) {
      const nextCenter = toLatLng(lastPosition.coords.latitude, lastPosition.coords.longitude);
      if (nextCenter && map.current) {
        map.current.setCenter(nextCenter);
      }
      setIsAutoCenterEnabled(true);
      return;
    }
  };

  const clearRunPath = useMemo(() => () => {
    runPathOutlineRef.current?.setMap(null);
    runPathMainRef.current?.setMap(null);
    runPathOutlineRef.current = null;
    runPathMainRef.current = null;
  }, []);

  const clearCoursePath = useMemo(() => () => {
    coursePathOutlineRef.current?.setMap(null);
    coursePathMainRef.current?.setMap(null);
    coursePathOutlineRef.current = null;
    coursePathMainRef.current = null;
  }, []);

  const updatePathLine = (points: GPSPoint[]) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance || points.length < 2) return;

    const path = points
      .map((point) => new sdk.LatLng(point.lat, point.lng));

    if (runPathOutlineRef.current) {
      runPathOutlineRef.current.setPath(path);
    } else {
      runPathOutlineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#ffffff',
        strokeWeight: 8,
        strokeOpacity: 0.9,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    if (runPathMainRef.current) {
      runPathMainRef.current.setPath(path);
    } else {
      runPathMainRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#0ea5e9',
        strokeWeight: 6,
        strokeOpacity: 0.98,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }
  };

  const updateCourseLine = useMemo(() => (points: { lat: number; lng: number }[]) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance || points.length < 2) {
      clearCoursePath();
      return;
    }

    const path = points.map((point) => new sdk.LatLng(point.lat, point.lng));

    if (coursePathOutlineRef.current) {
      coursePathOutlineRef.current.setPath(path);
    } else {
      coursePathOutlineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#22c55e',
        strokeWeight: 8,
        strokeOpacity: 0.45,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    if (coursePathMainRef.current) {
      coursePathMainRef.current.setPath(path);
    } else {
      coursePathMainRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#22c55e',
        strokeWeight: 5,
        strokeOpacity: 0.9,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }
  }, [clearCoursePath]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let isMounted = true;
    let clickListener: object | null = null;
    let dragListener: object | null = null;
    let zoomListener: object | null = null;

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !mapContainer.current) return;

        mapSdkRef.current = sdk;
        map.current = new sdk.Map(mapContainer.current, {
          center: new sdk.LatLng(37.5665, 126.978),
          zoom: 15,
          mapTypeControl: false,
          zoomControl: false,
        });
        mapLoadedRef.current = true;

        const handleMapClick = (event: unknown) => {
          if (isTrackingRef.current) return;
          if (!hasCoord(event)) return;
          updateCurrentMarker(event.coord.lat(), event.coord.lng());
        };

        const handleManualMove = () => {
          if (!isTrackingRef.current || !isAutoCenterRef.current) return;
          setIsAutoCenterEnabled(false);
        };

        clickListener = sdk.Event.addListener(map.current, 'click', handleMapClick);
        dragListener = sdk.Event.addListener(map.current, 'dragstart', handleManualMove);
        zoomListener = sdk.Event.addListener(map.current, 'zoom_start', handleManualMove);

        const initialCoursePoints = courseWaypointsRef.current;
        if (initialCoursePoints.length >= 2) {
          updateCourseLine(initialCoursePoints);
          fitMapToCourse(initialCoursePoints);
        }

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              hasInitialLocationRef.current = true;
              updateCurrentMarker(position.coords.latitude, position.coords.longitude);
              const initial = new sdk.LatLng(position.coords.latitude, position.coords.longitude);
              map.current?.setCenter(initial);
              map.current?.setZoom(15);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        }
      })
      .catch((error) => {
        console.error('[run] map load failed', error);
        toast.error(isEnglish ? 'Failed to load map.' : '지도를 불러오지 못했습니다');
      });

    return () => {
      isMounted = false;
      if (mapSdkRef.current && clickListener) {
        mapSdkRef.current.Event.removeListener(clickListener);
      }
      if (mapSdkRef.current && dragListener) {
        mapSdkRef.current.Event.removeListener(dragListener);
      }
      if (mapSdkRef.current && zoomListener) {
        mapSdkRef.current.Event.removeListener(zoomListener);
      }
      clearRunPath();
      clearCoursePath();
      currentMarker.current?.setMap(null);
      currentMarker.current = null;
      map.current?.destroy();
      map.current = null;
    };
  }, [clearCoursePath, clearRunPath, fitMapToCourse, isEnglish, updateCourseLine, updateCurrentMarker]);

  useEffect(() => {
    if (!mapLoadedRef.current || !courseWaypoints.length) return;
    updateCourseLine(courseWaypoints);
    if (!isTrackingRef.current && !hasPath && !hasInitialLocationRef.current) {
      fitMapToCourse(courseWaypoints);
    }
  }, [courseWaypoints, fitMapToCourse, hasPath, updateCourseLine]);

  const handleNewPoint = (latitude: number, longitude: number, accuracy: number, timestamp: number) => {
    setCurrentAccuracy(accuracy);
    const newPoint: GPSPoint = { lat: latitude, lng: longitude, timestamp, accuracy };

    updateCurrentMarker(latitude, longitude);

    if (lastRecordedAtRef.current && timestamp - lastRecordedAtRef.current < MIN_POINT_INTERVAL_MS) {
      return;
    }

    if (accuracy > MAX_ALLOWED_ACCURACY_METERS) {
      return;
    }

    const previousPoint = pathRef.current[pathRef.current.length - 1];
    if (previousPoint) {
      const elapsedSeconds = Math.max(1, (timestamp - previousPoint.timestamp) / 1000);
      const movementMeters = calculateDistance(previousPoint, newPoint);
      const speed = movementMeters / elapsedSeconds;

      if (movementMeters < MIN_MOVEMENT_METERS) return;
      if (speed > MAX_RUNNING_SPEED_MPS) return;
    }

    lastRecordedAtRef.current = timestamp;

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

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (durationSec: number, distKm: number): string => {
    if (distKm === 0) return "--'--\"";
    const paceMinPerKm = (durationSec / 60) / distKm;
    const min = Math.floor(paceMinPerKm);
    const sec = Math.floor((paceMinPerKm - min) * 60);
    return `${min}'${sec.toString().padStart(2, '0')}\"`;
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error(isEnglish ? 'This browser does not support GPS.' : 'GPS를 지원하지 않는 브라우저입니다');
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
    clearRunPath();

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position;
        const { latitude, longitude, accuracy } = position.coords;
        handleNewPoint(latitude, longitude, accuracy, position.timestamp);
      },
      (err) => {
        toast.error(isEnglish ? `GPS error: ${err.message}` : `GPS 오류: ${err.message}`);
        stopTracking();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

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
              `/run/result?courseId=${courseId}`
              + `&runSessionId=${data.runSessionId}`
              + `&isCollected=${data.isCollected}`
              + `&matchRate=${data.matchRate}`
              + (reason ? `&reason=${reason}` : '')
            );
          },
          onError: (error) => {
            const reason = encodeURIComponent(error.message);
            router.push(`/run/result?courseId=${courseId}&isCollected=false&matchRate=0&reason=${reason}`);
          },
        }
      );
      return;
    }

    if (courseId && pathRef.current.length < 2) {
      const reason = encodeURIComponent(isEnglish ? 'Not enough path data.' : '경로 데이터가 부족합니다');
      router.push(`/run/result?courseId=${courseId}&isCollected=false&matchRate=0&reason=${reason}`);
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
            router.push(`/run/result?runSessionId=${data.runSessionId}&isCollected=false&matchRate=0`);
          },
          onError: (error) => {
            const reason = encodeURIComponent(error.message);
            router.push(`/run/result?isCollected=false&matchRate=0&reason=${reason}`);
          },
        }
      );
      return;
    }

    if (!courseId) {
      const reason = encodeURIComponent(isEnglish ? 'No course information available.' : '코스 정보가 없습니다');
      router.push(`/run/result?isCollected=false&matchRate=0&reason=${reason}`);
    }
  };

  const requestStopTracking = () => {
    if (isTracking && !isPaused) {
      setIsStopDialogOpen(true);
      return;
    }
    stopTracking();
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
      toast.error(isEnglish ? 'This browser does not support GPS.' : 'GPS를 지원하지 않는 브라우저입니다');
      return;
    }

    setIsPaused(false);
    setIsTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position;
        const { latitude, longitude, accuracy } = position.coords;
        handleNewPoint(latitude, longitude, accuracy, position.timestamp);
      },
      (err) => {
        toast.error(isEnglish ? `GPS error: ${err.message}` : `GPS 오류: ${err.message}`);
        stopTracking();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

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
      <div className="adsense-excluded-area h-screen relative" data-adsense-excluded="true">
        <div ref={mapContainer} className="adsense-excluded-area w-full h-full" data-adsense-excluded="true" />

        <div className="absolute top-4 left-4 right-4 rg-soft-panel rg-fade p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{formatDuration(duration)}</div>
              <div className="text-xs text-slate-600">{isEnglish ? 'Time' : '시간'}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{(distance / 1000).toFixed(2)}</div>
              <div className="text-xs text-slate-600">km</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary">{formatPace(duration, distance / 1000)}</div>
              <div className="text-xs text-slate-600">{isEnglish ? 'Pace' : '페이스'}</div>
            </div>
          </div>
          <div className="mt-3 text-center text-xs text-slate-500">
            {isEnglish ? 'Accuracy' : '정확도'} {currentAccuracy ? `±${Math.round(currentAccuracy)}m` : '-'}
          </div>
        </div>

        {course && courseWaypoints.length >= 2 ? (
          <div className="absolute top-36 left-4 right-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs text-emerald-800 shadow-sm backdrop-blur">
            {isEnglish ? 'Target course' : '목표 코스'}: <span className="font-semibold">{course.title}</span> · {(course.totalDistance ?? 0).toFixed(1)}km
          </div>
        ) : null}

        {isTracking && !isAutoCenterEnabled ? (
          <Button
            type="button"
            aria-label={isEnglish ? 'Move to my current location' : '내 현재 위치로 이동'}
            className={`${LOCATION_FAB_BASE_CLASS} ${LOCATION_FAB_TRANSITION_CLASS}`}
            style={{ bottom: getLocationFabBottom(144) }}
            onClick={handleRecenter}
          >
            <LocateFixed className="h-5 w-5" />
          </Button>
        ) : null}
      </div>

      <div className="rg-safe-bottom fixed bottom-0 left-0 right-0 border-t border-white/70 bg-white/85 p-6 backdrop-blur-xl shadow-[0_-14px_30px_-26px_rgba(15,23,42,0.7)]">
        {!isTracking ? (
          <div className="flex items-center gap-3">
            {!isPaused && !hasPath ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rg-touch-icon rg-press h-16 w-16 rounded-2xl border border-white/80 bg-white/90 text-slate-700 shadow-md"
                aria-label={isEnglish ? 'Back to home' : '홈으로 돌아가기'}
                onClick={() => router.replace('/')}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}
            <Button
              size="lg"
              className="rg-touch h-16 flex-1 text-lg rounded-2xl bg-primary hover:bg-primary/90"
              onClick={isPaused && hasPath ? resumeTracking : startTracking}
            >
              <Play className="w-6 h-6 mr-2" />
              {isPaused && hasPath ? (isEnglish ? 'Resume Run' : '러닝 재개') : (isEnglish ? 'Start Run' : '러닝 시작')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-4">
            <Button
              size="lg"
              variant="outline"
              className="rg-touch flex-1 h-16 text-lg rounded-2xl"
              onClick={pauseTracking}
            >
              <Pause className="w-6 h-6 mr-2" />
              {isEnglish ? 'Pause' : '일시정지'}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="rg-touch flex-1 h-16 text-lg rounded-2xl"
              onClick={requestStopTracking}
            >
              <Square className="w-6 h-6 mr-2" />
              {isEnglish ? 'Stop' : '종료'}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
        <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">{isEnglish ? 'Stop this run?' : '러닝을 종료할까요?'}</DialogTitle>
            <DialogDescription className="text-slate-600">
              {isEnglish ? 'Your current record will be saved and you will move to the result screen.' : '현재 기록을 저장하고 결과 화면으로 이동합니다.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setIsStopDialogOpen(false)}
            >
              {isEnglish ? 'Keep Running' : '계속 달리기'}
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => {
                setIsStopDialogOpen(false);
                stopTracking();
              }}
            >
              {isEnglish ? 'Stop and Save' : '종료하고 저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
