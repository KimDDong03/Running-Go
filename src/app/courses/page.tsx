'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { trpc } from '@/components/providers/TRPCProvider';
import { clientEnv } from '@/lib/env';
import { applyKoreanMapLabels, applyRoadVisualStyle, NAVER_LIKE_MAP_STYLE, NAVER_LIKE_MAP_STYLE_ID } from '@/lib/map-style';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Heart, LocateFixed, MapPin } from 'lucide-react';
import { Difficulty } from '@prisma/client';

const difficultyLabels: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
};

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HARD: 'bg-red-100 text-red-700',
};

const DEFAULT_CENTER = {
  lat: 37.5665,
  lng: 126.978,
};

const INITIAL_PANEL_HEIGHT = 180;

const getPanelSnapHeights = () => {
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  const min = 180;
  const mid = Math.round(viewportHeight * 0.42);
  const max = Math.min(Math.round(viewportHeight * 0.62), 560);

  return { min, mid, max };
};

interface CourseWaypoint {
  lat: number;
  lng: number;
  order: number;
}

type CourseListSort =
  | 'LATEST'
  | 'LIKES_DESC'
  | 'NEAREST'
  | 'COURSE_DISTANCE_ASC'
  | 'COURSE_DISTANCE_DESC';

const parseCourseListSort = (value: string): CourseListSort => {
  if (
    value === 'LIKES_DESC'
    || value === 'NEAREST'
    || value === 'COURSE_DISTANCE_ASC'
    || value === 'COURSE_DISTANCE_DESC'
  ) {
    return value;
  }
  return 'LATEST';
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const calculateDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const earthRadius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRadians(lat1))
      * Math.cos(toRadians(lat2))
      * Math.sin(dLng / 2)
      * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

export default function CoursesPage() {
  const [viewMode] = useState<'list' | 'map'>('map');
  const [listSort, setListSort] = useState<CourseListSort>('LATEST');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState<number>(INITIAL_PANEL_HEIGHT);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const courseMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const panelDragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const courseListInput = useMemo(() => {
    if (listSort === 'NEAREST' && userLocation) {
      return {
        limit: 20,
        sortBy: listSort,
        location: userLocation,
      };
    }

    return {
      limit: 20,
      sortBy: listSort,
    };
  }, [listSort, userLocation]);

  const { data: courses, isLoading, isError, refetch } = trpc.course.list.useQuery(
    courseListInput,
    { enabled: listSort !== 'NEAREST' || Boolean(userLocation) }
  );
  const mapboxToken = clientEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const maxPathPoints = 60;

  const { data: nearbyCourses, isLoading: isNearbyLoading, isError: isNearbyError, refetch: refetchNearby } = trpc.course.nearby.useQuery(
    userLocation
      ? { lat: userLocation.lat, lng: userLocation.lng, radiusKm: 5, limit: 30 }
      : { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, radiusKm: 5, limit: 30 },
    { enabled: viewMode === 'map' && Boolean(userLocation) }
  );

  const { data: selectedCourse, isLoading: isSelectedCourseLoading } = trpc.course.byId.useQuery(
    { id: selectedCourseId ?? '' },
    { enabled: Boolean(selectedCourseId) }
  );

  const selectedWaypointList = useMemo(() => {
    if (!selectedCourse || !Array.isArray(selectedCourse.waypoints)) return [] as { lat: number; lng: number }[];
    const raw = selectedCourse.waypoints
      .map((point) => {
        if (!point || typeof point !== 'object') return null;

        const lat = (point as { lat?: unknown }).lat;
        const lng = (point as { lng?: unknown }).lng;
        const order = (point as { order?: unknown }).order;

        if (typeof lat !== 'number' || typeof lng !== 'number' || typeof order !== 'number') {
          return null;
        }

        return { lat, lng, order } as CourseWaypoint;
      })
      .filter((point): point is CourseWaypoint => Boolean(point));

    return [...raw]
      .sort((a, b) => a.order - b.order)
      .map((point) => ({ lat: point.lat, lng: point.lng }));
  }, [selectedCourse]);

  const snapPanelHeight = (height: number) => {
    const { min, mid, max } = getPanelSnapHeights();
    const candidates = [min, mid, max];
    const nearest = candidates.reduce((closest, value) => {
      return Math.abs(value - height) < Math.abs(closest - height) ? value : closest;
    }, candidates[0]);
    setPanelHeight(nearest);
  };

  const onPanelHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    panelDragStateRef.current = { startY: event.clientY, startHeight: panelHeight };
    setIsPanelDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPanelHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!panelDragStateRef.current) return;

    const { min, max } = getPanelSnapHeights();
    const delta = panelDragStateRef.current.startY - event.clientY;
    const nextHeight = panelDragStateRef.current.startHeight + delta;
    const clampedHeight = Math.max(min, Math.min(max, nextHeight));
    setPanelHeight(clampedHeight);
  };

  const onPanelHandlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!panelDragStateRef.current) return;

    const { min, max } = getPanelSnapHeights();
    const delta = panelDragStateRef.current.startY - event.clientY;
    const nextHeight = panelDragStateRef.current.startHeight + delta;
    const clampedHeight = Math.max(min, Math.min(max, nextHeight));

    panelDragStateRef.current = null;
    setIsPanelDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    snapPanelHeight(clampedHeight);
  };

  const collapsePanelToMin = () => {
    const { min } = getPanelSnapHeights();
    setPanelHeight((prev) => (prev > min ? min : prev));
  };

  useEffect(() => {
    const syncPanelHeightWithViewport = () => {
      const { min, max } = getPanelSnapHeights();
      setPanelHeight((prev) => {
        return Math.max(min, Math.min(max, prev));
      });
    };

    syncPanelHeightWithViewport();
    window.addEventListener('resize', syncPanelHeightWithViewport);
    return () => {
      window.removeEventListener('resize', syncPanelHeightWithViewport);
    };
  }, []);

  useEffect(() => {
    if ((viewMode !== 'map' && listSort !== 'NEAREST') || userLocation) return;

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        setLocationError('현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
        setUserLocation(DEFAULT_CENTER);
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationError(null);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setLocationError('현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
        setUserLocation(DEFAULT_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }, [listSort, userLocation, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const mapInstance = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: NAVER_LIKE_MAP_STYLE,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13,
    });

    mapRef.current = mapInstance;

    const handleMapDragStart = () => {
      if (panelDragStateRef.current) return;
      collapsePanelToMin();
    };

    const handleMapStyleData = () => {
      applyKoreanMapLabels(mapInstance);
      applyRoadVisualStyle(mapInstance);
    };

    mapInstance.on('dragstart', handleMapDragStart);
    mapInstance.on('load', handleMapStyleData);

    return () => {
      mapInstance.off('dragstart', handleMapDragStart);
      mapInstance.off('load', handleMapStyleData);
      courseMarkersRef.current.forEach((marker) => marker.remove());
      courseMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapInstance.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !userLocation) return;

    const center: [number, number] = [userLocation.lng, userLocation.lat];
    mapRef.current.setCenter(center);
    mapRef.current.setZoom(14);

    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapboxgl.Marker({ color: '#2563eb' })
        .setLngLat(center)
        .addTo(mapRef.current);
      return;
    }

    userMarkerRef.current.setLngLat(center);
  }, [userLocation, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current) return;

    courseMarkersRef.current.forEach((marker) => marker.remove());
    courseMarkersRef.current = [];

    nearbyCourses?.courses.forEach((course) => {
      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = [
        'h-9 w-9 rounded-full border-2 border-white text-white shadow-lg',
        'flex items-center justify-center text-sm',
        selectedCourseId === course.id ? 'bg-sky-600' : 'bg-emerald-500',
      ].join(' ');
      markerButton.textContent = '🏃';
      markerButton.title = course.title;
      markerButton.onclick = () => {
        setSelectedCourseId(course.id);
      };

      const marker = new mapboxgl.Marker({ element: markerButton, anchor: 'bottom' })
        .setLngLat([course.centerLng, course.centerLat])
        .addTo(mapRef.current!);

      courseMarkersRef.current.push(marker);
    });
  }, [nearbyCourses, selectedCourseId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current) return;

    const mapInstance = mapRef.current;
    const sourceId = 'selected-course-path';
    const layerId = 'selected-course-path';

    const clearSelectedPath = () => {
      if (mapInstance.getLayer(layerId)) {
        mapInstance.removeLayer(layerId);
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    };

    if (!selectedCourse || selectedWaypointList.length < 2 || !mapInstance.isStyleLoaded()) {
      clearSelectedPath();
      return;
    }

    const coordinates: [number, number][] = selectedWaypointList.map((point) => [point.lng, point.lat]);

    const pathData = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates,
      },
    };

    if (mapInstance.getSource(sourceId)) {
      (mapInstance.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(pathData);
    } else {
      mapInstance.addSource(sourceId, {
        type: 'geojson',
        data: pathData,
      });

      mapInstance.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#22c55e',
          'line-width': 5,
        },
      });
    }

    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach((coordinate) => bounds.extend(coordinate));
    mapInstance.fitBounds(bounds, { padding: 70, duration: 500, maxZoom: 15 });
  }, [selectedCourse, selectedWaypointList, viewMode]);

  const getMapImageUrl = (lat: number, lng: number) => {
    const width = 640;
    const height = 360;
    const zoom = 13;
    return `https://api.mapbox.com/styles/v1/${NAVER_LIKE_MAP_STYLE_ID}/static/${lng},${lat},${zoom},0/${width}x${height}?access_token=${mapboxToken}`;
  };

  const encodePolyline = (points: { lat: number; lng: number }[]) => {
    let result = '';
    let prevLat = 0;
    let prevLng = 0;

    points.forEach((point) => {
      const lat = Math.round(point.lat * 1e5);
      const lng = Math.round(point.lng * 1e5);
      const dLat = lat - prevLat;
      const dLng = lng - prevLng;
      prevLat = lat;
      prevLng = lng;

      [dLat, dLng].forEach((value) => {
        let shifted = value << 1;
        if (value < 0) shifted = ~shifted;
        let chunk = shifted;
        while (chunk >= 0x20) {
          result += String.fromCharCode((0x20 | (chunk & 0x1f)) + 63);
          chunk >>= 5;
        }
        result += String.fromCharCode(chunk + 63);
      });
    });

    return result;
  };

  const samplePath = (points: { lat: number; lng: number }[]) => {
    if (points.length <= maxPathPoints) return points;
    const step = Math.ceil(points.length / maxPathPoints);
    const sampled: { lat: number; lng: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      sampled.push(points[i]);
    }
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }
    return sampled;
  };

  const getMapPathImageUrl = (points: { lat: number; lng: number }[]) => {
    const width = 640;
    const height = 360;
    const path = encodePolyline(samplePath(points));
    const overlay = `path-4+0ea5e9(${encodeURIComponent(path)})`;
    return `https://api.mapbox.com/styles/v1/${NAVER_LIKE_MAP_STYLE_ID}/static/${overlay}/auto/${width}x${height}?padding=60&access_token=${mapboxToken}`;
  };

  const canUseMap = Boolean(mapboxToken);
  const panelTransitionClass = isPanelDragging ? '' : 'transition-[height] duration-200 ease-out';
  const locationButtonTransitionClass = isPanelDragging ? '' : 'transition-[bottom] duration-200 ease-out';
  const locationButtonBottom = panelHeight + (selectedCourse ? 72 : 12);

  const getDistanceLabel = (courseLat: number, courseLng: number) => {
    if (locationError) return '위치 권한 필요';
    if (!userLocation) return '거리 확인 중';

    const distanceKm = calculateDistanceKm(userLocation.lat, userLocation.lng, courseLat, courseLng);
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    }

    return `${distanceKm.toFixed(1)}km`;
  };

  const moveToCurrentLocation = () => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    const moveMap = (lat: number, lng: number) => {
      setLocationError(null);
      setUserLocation({ lat, lng });
      mapInstance.easeTo({
        center: [lng, lat],
        zoom: 14,
        duration: 500,
      });
      collapsePanelToMin();
    };

    if (userLocation) {
      moveMap(userLocation.lat, userLocation.lng);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        moveMap(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationError('현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] pb-20">
      <header className="bg-white/75 backdrop-blur border-b border-white/60 px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ChevronLeft className="w-6 h-6" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">코스 탐색</h1>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {viewMode === 'map' ? (
          <div className="relative h-[calc(100vh-8.25rem)] overflow-hidden rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <div ref={mapContainerRef} className="h-full w-full" />

            {isNearbyLoading && (
              <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600">
                주변 코스를 불러오는 중...
              </div>
            )}

            <button
              type="button"
              aria-label="내 현재 위치로 이동"
              className={`absolute right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/95 text-slate-700 shadow-md ${locationButtonTransitionClass}`}
              style={{ bottom: `calc(${locationButtonBottom}px + env(safe-area-inset-bottom))` }}
              onClick={moveToCurrentLocation}
            >
              <LocateFixed className="h-5 w-5" />
            </button>

            {selectedCourseId && isSelectedCourseLoading && (
              <div className="absolute top-14 right-3 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600">
                코스 모양 불러오는 중...
              </div>
            )}

            {selectedCourse && (
              <div className="absolute left-3 right-3 z-20" style={{ bottom: panelHeight + 12 }}>
                <Link href={`/run?courseId=${selectedCourse.id}`}>
                  <Button size="lg" className="w-full h-12 rounded-2xl">이 코스로 러닝 시작</Button>
                </Link>
              </div>
            )}

            <section
              className={`absolute inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-white/70 bg-white/95 backdrop-blur-md shadow-[0_-16px_34px_-24px_rgba(15,23,42,0.55)] ${panelTransitionClass}`}
              style={{ height: panelHeight }}
            >
              <button
                type="button"
                aria-label="목록 패널 높이 조절"
                className="flex w-full items-center justify-center py-3 touch-none"
                onPointerDown={onPanelHandlePointerDown}
                onPointerMove={onPanelHandlePointerMove}
                onPointerUp={onPanelHandlePointerEnd}
                onPointerCancel={onPanelHandlePointerEnd}
              >
                <span className="h-1.5 w-12 rounded-full bg-slate-300" />
              </button>

              <div className="h-[calc(100%-44px)] overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">주변 코스 목록</p>
                    <p className="text-xs text-slate-500">{courses?.courses.length ?? 0}개 코스</p>
                  </div>
                  <select
                    value={listSort}
                    onChange={(event) => setListSort(parseCourseListSort(event.target.value))}
                    className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-700"
                  >
                    <option value="LATEST">최신순</option>
                    <option value="LIKES_DESC">좋아요 많은순</option>
                    <option value="NEAREST">가까운순(내 위치)</option>
                    <option value="COURSE_DISTANCE_ASC">코스 짧은순</option>
                    <option value="COURSE_DISTANCE_DESC">코스 긴순</option>
                  </select>
                </div>

                {locationError && listSort === 'NEAREST' && (
                  <p className="mb-2 text-xs text-slate-500">{locationError}</p>
                )}

                {isNearbyError && (
                  <div className="mb-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    주변 코스를 불러오지 못했습니다.
                    <button
                      type="button"
                      className="ml-2 font-semibold underline underline-offset-2"
                      onClick={() => refetchNearby()}
                    >
                      다시 시도
                    </button>
                  </div>
                )}

                {isLoading ? (
                  <div className="space-y-3 pt-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Card key={index} className="rounded-2xl border border-white/70 bg-white/80">
                        <CardContent className="p-3">
                          <Skeleton className="h-20 w-full rounded-xl" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : isError ? (
                  <ErrorState
                    title="코스를 불러오지 못했습니다"
                    message="잠시 후 다시 시도해주세요"
                    actionLabel="다시 시도"
                    onAction={() => refetch()}
                  />
                ) : !courses?.courses || courses.courses.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">등록된 코스가 없습니다</div>
                ) : (
                  <div className="space-y-3 pb-2">
                    {courses.courses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedCourseId(course.id)}
                      >
                        <Card className={`rounded-2xl border bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden ${selectedCourseId === course.id ? 'border-sky-300 ring-2 ring-sky-200/70' : 'border-white/70'}`}>
                          <CardContent className="p-3">
                            <div className="flex gap-3">
                              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
                                {canUseMap ? (
                                  <Image
                                    src={(() => {
                                      const raw = Array.isArray(course.waypoints)
                                        ? (course.waypoints as { lat: number; lng: number }[])
                                        : [];
                                      return raw.length >= 2
                                        ? getMapPathImageUrl(raw)
                                        : getMapImageUrl(course.centerLat, course.centerLng);
                                    })()}
                                    alt={`${course.title} 지도`}
                                    fill
                                    sizes="120px"
                                    quality={70}
                                    unoptimized
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-3xl">🏃‍♂️</div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-semibold text-slate-900">{course.title}</h3>
                                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{course.totalDistance.toFixed(1)}km</span>
                                  <span>•</span>
                                  <span>{course.estimatedTime}분</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">내 위치에서 {getDistanceLabel(course.centerLat, course.centerLng)}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <Badge className={`${difficultyColors[course.difficulty]} rounded-full text-[11px]`}>
                                    {difficultyLabels[course.difficulty]}
                                  </Badge>
                                  <div className="flex items-center gap-1 text-xs text-slate-600">
                                    <Heart className="h-3.5 w-3.5" />
                                    <span>{course.likeCount}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-3xl border border-white/70 bg-white/80 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.55)]">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : isError ? (
          <ErrorState
            title="코스를 불러오지 못했습니다"
            message="잠시 후 다시 시도해주세요"
            actionLabel="다시 시도"
            onAction={() => refetch()}
          />
        ) : !courses?.courses || courses.courses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500">등록된 코스가 없습니다</p>
            <Link href="/create">
              <Button className="mt-4 rounded-full shadow-md shadow-sky-200/70">첫 코스 만들기</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <select
                value={listSort}
                onChange={(event) => setListSort(parseCourseListSort(event.target.value))}
                className="h-10 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="LATEST">최신순</option>
                <option value="LIKES_DESC">좋아요 많은순</option>
                <option value="NEAREST">가까운순(내 위치)</option>
                <option value="COURSE_DISTANCE_ASC">코스 짧은순</option>
                <option value="COURSE_DISTANCE_DESC">코스 긴순</option>
              </select>
            </div>
            {listSort === 'NEAREST' && locationError && (
              <p className="text-sm text-slate-500">{locationError}</p>
            )}
            {courses.courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`}>
                <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)] overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5">
                  <div className="relative h-40 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60 flex items-center justify-center">
                    {canUseMap ? (
                      <Image
                        src={(() => {
                          const raw = Array.isArray(course.waypoints)
                            ? (course.waypoints as { lat: number; lng: number }[])
                            : [];
                          return raw.length >= 2
                            ? getMapPathImageUrl(raw)
                            : getMapImageUrl(course.centerLat, course.centerLng);
                        })()}
                        alt={`${course.title} 지도`}
                        fill
                        sizes="100vw"
                        quality={70}
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-6xl">🏃‍♂️</span>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-slate-900 line-clamp-1">
                          {course.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
                          <MapPin className="w-4 h-4" />
                          <span>{course.totalDistance.toFixed(1)}km</span>
                          <span>•</span>
                          <span>{course.estimatedTime}분</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">내 위치에서 {getDistanceLabel(course.centerLat, course.centerLng)}</p>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Heart className="w-4 h-4" />
                        <span>{course.likeCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Badge className={`${difficultyColors[course.difficulty]} rounded-full`}>
                        {difficultyLabels[course.difficulty]}
                      </Badge>
                      {course.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="rounded-full">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
