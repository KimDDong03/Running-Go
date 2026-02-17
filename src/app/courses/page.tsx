'use client';

import { type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { trpc } from '@/components/providers/TRPCProvider';
import { loadMapSdk, type MapLike, type MapMarkerLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';
import { getCoursePreviewImageUrl } from '@/lib/course-preview-image';
import { createCurrentLocationMarkerElement } from '@/lib/current-location-marker';
import { LOCATION_FAB_BASE_CLASS, LOCATION_FAB_TRANSITION_CLASS, getLocationFabBottom } from '@/lib/map-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { Heart, LocateFixed, MapPin } from 'lucide-react';
import { Difficulty } from '@prisma/client';

const difficultyLabelsKo: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
};

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-green-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  HARD: 'bg-red-500 text-white',
};

const DEFAULT_CENTER = {
  lat: 37.5665,
  lng: 126.978,
};

const INITIAL_PANEL_HEIGHT = 180;
const ONBOARDING_STORAGE_KEY = 'running-go:onboarding:v1';
const LAST_LOCATION_STORAGE_KEY = 'running-go:last-location:v1';

const ONBOARDING_STEPS_KO = [
  {
    title: '러닝고 시작 가이드',
    description: '지도를 움직이며 주변 코스를 찾고, 원하는 코스를 바로 러닝에 연결할 수 있어요.',
  },
  {
    title: '코스 탐색',
    description: '지도에서 마커를 누르거나 아래 코스 목록을 눌러 코스 라인을 확인해보세요.',
  },
  {
    title: '정렬과 위치',
    description: '코스 목록 정렬을 바꾸고, 우하단 위치 버튼으로 현재 위치로 빠르게 이동할 수 있어요.',
  },
  {
    title: '바로 러닝 시작',
    description: '코스를 선택하면 상단의 버튼으로 즉시 러닝을 시작할 수 있어요. 즐겁게 달려보세요!',
  },
] as const;

const ONBOARDING_STEPS_EN = [
  {
    title: 'Running Go Quick Guide',
    description: 'Move the map to find nearby courses and jump straight into a run.',
  },
  {
    title: 'Explore Courses',
    description: 'Tap a marker or a list item below to preview the course path.',
  },
  {
    title: 'Sorting and Location',
    description: 'Change sorting and use the location button to quickly return to your position.',
  },
  {
    title: 'Start Running Fast',
    description: 'Select a course and start your run immediately from the top button.',
  },
] as const;

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

const readStoredLocation = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') {
      return null;
    }
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
};

const storeLocation = (location: { lat: number; lng: number }) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, JSON.stringify(location));
};

export default function CoursesPage() {
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const [viewMode] = useState<'list' | 'map'>('map');
  const [listSort, setListSort] = useState<CourseListSort>('LATEST');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState<number>(INITIAL_PANEL_HEIGHT);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [isNearbyCourseMarkerVisible, setIsNearbyCourseMarkerVisible] = useState(false);
  const [nearbySearch, setNearbySearch] = useState<{ lat: number; lng: number; radiusKm: number }>({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    radiusKm: 5,
  });
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const onboardingSteps = isEnglish ? ONBOARDING_STEPS_EN : ONBOARDING_STEPS_KO;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const userMarkerRef = useRef<MapMarkerLike | null>(null);
  const userMarkerImageRef = useRef<string | null>(null);
  const courseMarkersRef = useRef<MapMarkerLike[]>([]);
  const selectedOutlinePolylineRef = useRef<MapPolylineLike | null>(null);
  const selectedMainPolylineRef = useRef<MapPolylineLike | null>(null);
  const panelDragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const panelScrollDragStateRef = useRef<{ startY: number; startHeight: number; lastHeight: number; isDragging: boolean } | null>(null);
  const nearbySearchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastNearbyViewportRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

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
  const maxPathPoints = 60;
  const difficultyLabel = (difficulty: Difficulty) => {
    if (!isEnglish) return difficultyLabelsKo[difficulty];
    if (difficulty === 'EASY') return 'Easy';
    if (difficulty === 'MEDIUM') return 'Medium';
    return 'Hard';
  };

  const { data: nearbyCourses, isLoading: isNearbyLoading, isError: isNearbyError, refetch: refetchNearby } = trpc.course.nearby.useQuery(
    { lat: nearbySearch.lat, lng: nearbySearch.lng, radiusKm: nearbySearch.radiusKm, limit: 30 },
    { enabled: viewMode === 'map' }
  );

  const { data: selectedCourse, isLoading: isSelectedCourseLoading } = trpc.course.byId.useQuery(
    { id: selectedCourseId ?? '' },
    { enabled: Boolean(selectedCourseId) }
  );
  const { data: profileSummary } = trpc.profile.summary.useQuery();

  const selectedWaypointList = useMemo(() => {
    if (!selectedCourseId) return [] as { lat: number; lng: number }[];
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
  }, [selectedCourse, selectedCourseId]);

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

  const onPanelContentTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;

    panelScrollDragStateRef.current = {
      startY: event.touches[0].clientY,
      startHeight: panelHeight,
      lastHeight: panelHeight,
      isDragging: false,
    };
  };

  const onPanelContentTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const dragState = panelScrollDragStateRef.current;
    if (!dragState || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const delta = dragState.startY - touch.clientY;

    const isContentAtTop = event.currentTarget.scrollTop <= 0;
    if (!dragState.isDragging && !isContentAtTop) {
      return;
    }

    if (delta >= -6) {
      return;
    }

    event.preventDefault();

    const { min, max } = getPanelSnapHeights();
    const nextHeight = dragState.startHeight + delta;
    const clampedHeight = Math.max(min, Math.min(max, nextHeight));

    dragState.isDragging = true;
    dragState.lastHeight = clampedHeight;
    setIsPanelDragging(true);
    setPanelHeight(clampedHeight);
  };

  const onPanelContentTouchEnd = () => {
    const dragState = panelScrollDragStateRef.current;
    panelScrollDragStateRef.current = null;

    if (!dragState || !dragState.isDragging) {
      setIsPanelDragging(false);
      return;
    }

    setIsPanelDragging(false);
    snapPanelHeight(dragState.lastHeight);
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
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const focusCourseId = params.get('focusCourseId');
    if (!focusCourseId) return;

    setIsNearbyCourseMarkerVisible(true);
    setSelectedCourseId(focusCourseId);

    params.delete('focusCourseId');
    const queryString = params.toString();
    const nextUrl = queryString
      ? `${window.location.pathname}?${queryString}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    if ((viewMode !== 'map' && listSort !== 'NEAREST') || userLocation) return;

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        setLocationError(isEnglish ? 'Unable to get current location. Showing default location.' : '현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
        setUserLocation(DEFAULT_CENTER);
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationError(null);
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        storeLocation(nextLocation);
      },
      () => {
        const storedLocation = readStoredLocation();
        if (storedLocation) {
          setLocationError(isEnglish ? 'Unable to get current location. Showing last known location.' : '현재 위치를 가져올 수 없어 마지막 위치를 표시합니다');
          setUserLocation(storedLocation);
          return;
        }
        setLocationError(isEnglish ? 'Unable to get current location. Showing default location.' : '현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
        setUserLocation(DEFAULT_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }, [isEnglish, listSort, userLocation, viewMode]);

  const toLatLng = (lat: number, lng: number) => {
    const sdk = mapSdkRef.current;
    if (!sdk) {
      throw new Error(isEnglish ? 'Map SDK is not ready yet.' : '네이버 지도 SDK가 준비되지 않았습니다');
    }
    return new sdk.LatLng(lat, lng);
  };

  const clearCourseMarkers = () => {
    courseMarkersRef.current.forEach((marker) => marker.setMap(null));
    courseMarkersRef.current = [];
  };

  const clearSelectedPath = () => {
    selectedOutlinePolylineRef.current?.setMap(null);
    selectedMainPolylineRef.current?.setMap(null);
    selectedOutlinePolylineRef.current = null;
    selectedMainPolylineRef.current = null;
  };

  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current || mapRef.current) return;

    let isMounted = true;
    let dragListener: object | null = null;
    let idleListener: object | null = null;

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !mapContainerRef.current) return;

        mapSdkRef.current = sdk;
        const storedLocation = readStoredLocation();
        const initialCenter = userLocation ?? storedLocation ?? DEFAULT_CENTER;
        const initialUserLocation = userLocation ?? storedLocation;
        if (!userLocation && storedLocation) {
          setUserLocation(storedLocation);
        }
        const mapInstance = new sdk.Map(mapContainerRef.current, {
          center: new sdk.LatLng(initialCenter.lat, initialCenter.lng),
          zoom: 13,
          mapTypeControl: false,
          zoomControl: false,
        });

        mapRef.current = mapInstance;

        if (initialUserLocation) {
          const markerImage = profileSummary?.user.image ?? null;
          userMarkerRef.current?.setMap(null);
          userMarkerRef.current = new sdk.Marker({
            map: mapInstance,
            position: new sdk.LatLng(initialUserLocation.lat, initialUserLocation.lng),
            icon: {
              content: createCurrentLocationMarkerElement(markerImage, { size: 36 }),
              size: new sdk.Size(36, 36),
              anchor: new sdk.Point(18, 18),
            },
          });
          userMarkerImageRef.current = markerImage;
        }

        const syncNearbySearchWithViewport = (force = false) => {
          const center = mapInstance.getCenter();
          const bounds = mapInstance.getBounds();
          const northEast = bounds.getNE();
          const radiusKmFromViewport = calculateDistanceKm(
            center.lat(),
            center.lng(),
            northEast.lat(),
            northEast.lng()
          );

          const nextZoom = mapInstance.getZoom();
          const previousViewport = lastNearbyViewportRef.current;

          if (!force && previousViewport) {
            const movedDistanceKm = calculateDistanceKm(
              previousViewport.lat,
              previousViewport.lng,
              center.lat(),
              center.lng()
            );
            const zoomDelta = Math.abs(nextZoom - previousViewport.zoom);

            if (movedDistanceKm < 0.3 && zoomDelta < 0.8) {
              return;
            }
          }

          lastNearbyViewportRef.current = {
            lat: center.lat(),
            lng: center.lng(),
            zoom: nextZoom,
          };

          setNearbySearch({
            lat: center.lat(),
            lng: center.lng(),
            radiusKm: Math.min(20, Math.max(1.5, radiusKmFromViewport)),
          });
        };

        const scheduleNearbySearchSync = (force = false) => {
          if (nearbySearchDebounceRef.current) {
            clearTimeout(nearbySearchDebounceRef.current);
            nearbySearchDebounceRef.current = null;
          }

          if (force) {
            syncNearbySearchWithViewport(true);
            return;
          }

          nearbySearchDebounceRef.current = setTimeout(() => {
            syncNearbySearchWithViewport(false);
          }, 500);
        };

        const handleMapDragStart = () => {
          if (panelDragStateRef.current) return;
          collapsePanelToMin();
        };

        dragListener = sdk.Event.addListener(mapInstance, 'dragstart', handleMapDragStart);
        idleListener = sdk.Event.addListener(mapInstance, 'idle', () => scheduleNearbySearchSync(false));
        scheduleNearbySearchSync(true);
      })
      .catch(() => {
        setLocationError(isEnglish ? 'Failed to load map. Please try again shortly.' : '지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요');
      });

    return () => {
      isMounted = false;
      if (mapSdkRef.current && dragListener) {
        mapSdkRef.current.Event.removeListener(dragListener);
      }
      if (mapSdkRef.current && idleListener) {
        mapSdkRef.current.Event.removeListener(idleListener);
      }
      if (nearbySearchDebounceRef.current) {
        clearTimeout(nearbySearchDebounceRef.current);
        nearbySearchDebounceRef.current = null;
      }
      clearCourseMarkers();
      clearSelectedPath();
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [isEnglish, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current || !userLocation) return;

    const center = toLatLng(userLocation.lat, userLocation.lng);
    const markerImage = profileSummary?.user.image ?? null;
    mapRef.current.setCenter(center);
    mapRef.current.setZoom(14);

    if (!userMarkerRef.current || userMarkerImageRef.current !== markerImage) {
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = new mapSdkRef.current.Marker({
        map: mapRef.current,
        position: center,
        icon: {
          content: createCurrentLocationMarkerElement(markerImage, { size: 36 }),
          size: new mapSdkRef.current.Size(36, 36),
          anchor: new mapSdkRef.current.Point(18, 18),
        },
      });
      userMarkerImageRef.current = markerImage;
      return;
    }

    userMarkerRef.current.setPosition(center);
  }, [profileSummary?.user.image, userLocation, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current) return;

    const sdk = mapSdkRef.current;
    const mapInstance = mapRef.current;
    clearCourseMarkers();

    if (!isNearbyCourseMarkerVisible) {
      return;
    }

    const markerCourses = [...(nearbyCourses?.courses ?? [])];
    const selectedCourseFromList = courses?.courses.find((course) => course.id === selectedCourseId);
    if (selectedCourseFromList && !markerCourses.some((course) => course.id === selectedCourseFromList.id)) {
      markerCourses.push({
        id: selectedCourseFromList.id,
        title: selectedCourseFromList.title,
        centerLat: selectedCourseFromList.centerLat,
        centerLng: selectedCourseFromList.centerLng,
        totalDistance: selectedCourseFromList.totalDistance,
        estimatedTime: selectedCourseFromList.estimatedTime,
        difficulty: selectedCourseFromList.difficulty,
        distanceFromUserKm: 0,
      });
    }

    if (selectedCourse && !markerCourses.some((course) => course.id === selectedCourse.id)) {
      markerCourses.push({
        id: selectedCourse.id,
        title: selectedCourse.title,
        centerLat: selectedCourse.centerLat,
        centerLng: selectedCourse.centerLng,
        totalDistance: selectedCourse.totalDistance,
        estimatedTime: selectedCourse.estimatedTime,
        difficulty: selectedCourse.difficulty,
        distanceFromUserKm: 0,
      });
    }

    markerCourses.forEach((course) => {
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
        setSelectedCourseId((current) => (current === course.id ? null : course.id));
      };

      const marker = new sdk.Marker({
        map: mapInstance,
        position: toLatLng(course.centerLat, course.centerLng),
        icon: {
          content: markerButton,
          size: new sdk.Size(36, 36),
          anchor: new sdk.Point(18, 36),
        },
      });

      courseMarkersRef.current.push(marker);
    });
  }, [courses?.courses, isNearbyCourseMarkerVisible, nearbyCourses, selectedCourse, selectedCourseId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current) return;

    const sdk = mapSdkRef.current;
    const mapInstance = mapRef.current;
    if (!selectedCourseId || !selectedCourse || selectedWaypointList.length < 2) {
      clearSelectedPath();
      return;
    }

    const path = selectedWaypointList.map((point) => toLatLng(point.lat, point.lng));

    if (selectedOutlinePolylineRef.current) {
      selectedOutlinePolylineRef.current.setPath(path);
    } else {
      selectedOutlinePolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#ffffff',
        strokeWeight: 8,
        strokeOpacity: 0.78,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    if (selectedMainPolylineRef.current) {
      selectedMainPolylineRef.current.setPath(path);
    } else {
      selectedMainPolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#22c55e',
        strokeWeight: 6,
        strokeOpacity: 0.98,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    const bounds = new sdk.LatLngBounds();
    path.forEach((coordinate) => bounds.extend(coordinate));
    mapInstance.fitBounds(bounds, { top: 70, right: 70, bottom: 70, left: 70 });
  }, [selectedCourse, selectedCourseId, selectedWaypointList, viewMode]);

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

  const getPreviewImageUrl = (points: { lat: number; lng: number }[], center: { lat: number; lng: number }) => {
    return getCoursePreviewImageUrl(samplePath(points), center, { width: 640, height: 360 });
  };

  const getCompactPreviewImageUrl = (points: { lat: number; lng: number }[], center: { lat: number; lng: number }) => {
    return getCoursePreviewImageUrl(samplePath(points), center, { width: 240, height: 160 });
  };
  const panelTransitionClass = isPanelDragging ? '' : 'transition-[height] duration-200 ease-out';
  const locationButtonTransitionClass = isPanelDragging ? '' : LOCATION_FAB_TRANSITION_CLASS;
  const locationButtonBottom = panelHeight + (selectedCourse ? 72 : 12);

  const getDistanceLabel = (courseLat: number, courseLng: number) => {
    if (locationError) return isEnglish ? 'Need location permission' : '위치 권한 필요';
    if (!userLocation) return isEnglish ? 'Checking distance' : '거리 확인 중';

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
      const nextLocation = { lat, lng };
      setUserLocation(nextLocation);
      storeLocation(nextLocation);
      mapInstance.setCenter(toLatLng(lat, lng));
      mapInstance.setZoom(14);
      collapsePanelToMin();
    };

    if (userLocation) {
      moveMap(userLocation.lat, userLocation.lng);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError(isEnglish ? 'Unable to get current location. Showing default location.' : '현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        moveMap(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationError(isEnglish ? 'Unable to get current location. Showing default location.' : '현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

  const closeOnboarding = () => {
    setIsOnboardingOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    }
  };

  const handleOnboardingNext = () => {
    if (onboardingStepIndex >= onboardingSteps.length - 1) {
      closeOnboarding();
      return;
    }
    setOnboardingStepIndex((prev) => prev + 1);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasSeenOnboarding = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    if (hasSeenOnboarding) return;
    setOnboardingStepIndex(0);
    setIsOnboardingOpen(true);
  }, []);

  const onboardingStep = onboardingSteps[onboardingStepIndex];
  const isLastOnboardingStep = onboardingStepIndex === onboardingSteps.length - 1;

  return (
    <div className="h-[100dvh] overscroll-none overflow-hidden flex flex-col">
      <Dialog
        open={isOnboardingOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeOnboarding();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-[calc(100%-2rem)] rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_24px_48px_-30px_rgba(15,23,42,0.65)] sm:max-w-md"
        >
          <DialogHeader className="space-y-2 text-left">
            <p className="text-xs font-medium text-slate-500">
              {onboardingStepIndex + 1} / {onboardingSteps.length}
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
              {onboardingStep.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              {onboardingStep.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex-row items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rg-touch h-10 rounded-full px-4 text-slate-500"
              onClick={closeOnboarding}
            >
              {isEnglish ? 'Skip' : '건너뛰기'}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="rg-touch h-10 rounded-full border-white/70 bg-white"
                onClick={() => setOnboardingStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={onboardingStepIndex === 0}
              >
                {isEnglish ? 'Back' : '이전'}
              </Button>
              <Button
                type="button"
                className="rg-touch h-10 rounded-full px-5"
                onClick={handleOnboardingNext}
              >
                {isLastOnboardingStep ? (isEnglish ? 'Start' : '시작하기') : (isEnglish ? 'Next' : '다음')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="rg-page-header shrink-0 px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center justify-center">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">{isEnglish ? 'Home' : '홈'}</h1>
        </div>
      </header>

      <main className="rg-page-main min-h-0 flex-1 overflow-hidden p-4">
        {viewMode === 'map' ? (
          <div className="relative min-h-[260px] h-full overflow-hidden rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)] sm:min-h-[320px]">
            <div
              ref={mapContainerRef}
              className="adsense-excluded-area h-full w-full"
              data-adsense-excluded="true"
            />

            {isNearbyCourseMarkerVisible && isNearbyLoading && (
              <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-600">
                {isEnglish ? 'Loading nearby courses...' : '주변 코스를 불러오는 중...'}
              </div>
            )}

            <button
              type="button"
              aria-label={isEnglish ? 'Move to current location' : '내 현재 위치로 이동'}
              className={`${LOCATION_FAB_BASE_CLASS} ${locationButtonTransitionClass}`}
              style={{ bottom: getLocationFabBottom(locationButtonBottom) }}
              onClick={moveToCurrentLocation}
            >
              <LocateFixed className="h-5 w-5" />
            </button>

            {selectedCourse && (
              <div className="absolute left-3 right-3 z-20" style={{ bottom: panelHeight + 12 }}>
                <Link href={`/run?courseId=${selectedCourse.id}`}>
                  <Button size="lg" className="rg-touch w-full h-12 rounded-2xl">{isEnglish ? 'Start Run With This Course' : '이 코스로 러닝 시작'}</Button>
                </Link>
              </div>
            )}

            <section
              className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl border-t border-white/70 bg-white/95 backdrop-blur-md shadow-[0_-16px_34px_-24px_rgba(15,23,42,0.55)] ${panelTransitionClass}`}
              style={{ height: panelHeight }}
            >
              <button
                type="button"
                aria-label={isEnglish ? 'Adjust list panel height' : '목록 패널 높이 조절'}
                className="rg-touch shrink-0 touch-none flex w-full items-center justify-center py-3"
                onPointerDown={onPanelHandlePointerDown}
                onPointerMove={onPanelHandlePointerMove}
                onPointerUp={onPanelHandlePointerEnd}
                onPointerCancel={onPanelHandlePointerEnd}
              >
                <span className="h-2 w-14 rounded-full bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300" />
              </button>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),12px)] touch-pan-y [-webkit-overflow-scrolling:touch]"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehaviorY: 'contain',
                  touchAction: 'pan-y',
                }}
              >
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{isEnglish ? 'Course List' : '코스 목록'}</p>
                      <p className="truncate text-xs text-slate-500">{courses?.courses.length ?? 0}{isEnglish ? ' courses' : '개 코스'}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isNearbyCourseMarkerVisible ? 'default' : 'outline'}
                      className="rg-touch h-9 shrink-0 rounded-full px-3"
                      onClick={() => {
                        setIsNearbyCourseMarkerVisible((prev) => !prev);
                      }}
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      {isNearbyCourseMarkerVisible ? (isEnglish ? 'Hide Markers' : '마커 숨기기') : (isEnglish ? 'Show Markers' : '마커 보기')}
                    </Button>
                  </div>
                  <select
                    value={listSort}
                    onChange={(event) => setListSort(parseCourseListSort(event.target.value))}
                    className="rg-touch h-11 w-full rounded-full border border-white/70 bg-white/90 px-3 text-xs text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
                  >
                    <option value="LATEST">{isEnglish ? 'Latest' : '최신순'}</option>
                    <option value="LIKES_DESC">{isEnglish ? 'Most Liked' : '좋아요 많은순'}</option>
                    <option value="NEAREST">{isEnglish ? 'Nearest (My Location)' : '가까운순(내 위치)'}</option>
                    <option value="COURSE_DISTANCE_ASC">{isEnglish ? 'Shortest Distance' : '코스 짧은순'}</option>
                    <option value="COURSE_DISTANCE_DESC">{isEnglish ? 'Longest Distance' : '코스 긴순'}</option>
                  </select>
                  <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
                </div>

                {locationError && listSort === 'NEAREST' && (
                  <p className="mb-2 text-xs text-slate-500">{locationError}</p>
                )}

                {isNearbyError && (
                  <div className="mb-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {isEnglish ? 'Failed to load nearby courses.' : '주변 코스를 불러오지 못했습니다.'}
                    <button
                      type="button"
                      className="ml-2 font-semibold underline underline-offset-2"
                      onClick={() => refetchNearby()}
                    >
                      {isEnglish ? 'Retry' : '다시 시도'}
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
                    title={isEnglish ? 'Failed to load courses' : '코스를 불러오지 못했습니다'}
                    message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
                    actionLabel={isEnglish ? 'Retry' : '다시 시도'}
                    onAction={() => refetch()}
                  />
                ) : !courses?.courses || courses.courses.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">{isEnglish ? 'No courses available.' : '등록된 코스가 없습니다'}</div>
                ) : (
                  <div className="rg-stagger space-y-3 pb-2">
                    {courses.courses.map((course, index) => (
                      <div key={course.id} className="space-y-3">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            setIsNearbyCourseMarkerVisible(true);
                            setSelectedCourseId((current) => (current === course.id ? null : course.id));
                          }}
                        >
                          <Card className={`rg-interactive-card rounded-2xl border bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden ${selectedCourseId === course.id ? 'rg-selected border-sky-300 ring-2 ring-sky-200/70' : 'border-white/70'}`}>
                            <CardContent className="p-3">
                              <div className="flex gap-3">
                                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
                                  <Image
                                    src={(() => {
                                      const raw = Array.isArray(course.waypoints)
                                        ? (course.waypoints as { lat: number; lng: number }[])
                                        : [];
                                      return getCompactPreviewImageUrl(raw, { lat: course.centerLat, lng: course.centerLng });
                                    })()}
                                    alt={isEnglish ? `${course.title} map` : `${course.title} 지도`}
                                    fill
                                    sizes="120px"
                                    quality={70}
                                    unoptimized
                                    className="object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="truncate text-sm font-semibold text-slate-900">{course.title}</h3>
                                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span>{course.totalDistance.toFixed(1)}km</span>
                                    <span>•</span>
                                    <span>{course.estimatedTime}{isEnglish ? ' min' : '분'}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">{isEnglish ? 'From my location' : '내 위치에서'} {getDistanceLabel(course.centerLat, course.centerLng)}</p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <Badge className={`${difficultyColors[course.difficulty]} rounded-full text-[11px]`}>
                                      {difficultyLabel(course.difficulty)}
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
                        {index === 5 ? (
                          <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
                        ) : null}
                      </div>
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
            title={isEnglish ? 'Failed to load courses' : '코스를 불러오지 못했습니다'}
            message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
            actionLabel={isEnglish ? 'Retry' : '다시 시도'}
            onAction={() => refetch()}
          />
        ) : !courses?.courses || courses.courses.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500">{isEnglish ? 'No courses available.' : '등록된 코스가 없습니다'}</p>
              <Link href="/create">
              <Button className="rg-touch rg-press mt-4 rounded-full shadow-md shadow-sky-200/70">{isEnglish ? 'Create First Course' : '첫 코스 만들기'}</Button>
              </Link>
            </div>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <select
                value={listSort}
                onChange={(event) => setListSort(parseCourseListSort(event.target.value))}
                className="rg-touch h-11 rounded-full border border-white/70 bg-white/90 px-3 text-sm text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
              >
                <option value="LATEST">{isEnglish ? 'Latest' : '최신순'}</option>
                <option value="LIKES_DESC">{isEnglish ? 'Most Liked' : '좋아요 많은순'}</option>
                <option value="NEAREST">{isEnglish ? 'Nearest (My Location)' : '가까운순(내 위치)'}</option>
                <option value="COURSE_DISTANCE_ASC">{isEnglish ? 'Shortest Distance' : '코스 짧은순'}</option>
                <option value="COURSE_DISTANCE_DESC">{isEnglish ? 'Longest Distance' : '코스 긴순'}</option>
              </select>
            </div>
            {listSort === 'NEAREST' && locationError && (
              <p className="text-sm text-slate-500">{locationError}</p>
            )}
            <div className="rg-stagger space-y-4">
              {courses.courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`}>
                <Card className="rg-interactive-card rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)] overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5">
                  <div className="relative h-40 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60 flex items-center justify-center">
                    <Image
                      src={(() => {
                        const raw = Array.isArray(course.waypoints)
                          ? (course.waypoints as { lat: number; lng: number }[])
                          : [];
                        return getPreviewImageUrl(raw, { lat: course.centerLat, lng: course.centerLng });
                      })()}
                      alt={isEnglish ? `${course.title} map` : `${course.title} 지도`}
                      fill
                      sizes="100vw"
                      quality={70}
                      unoptimized
                      className="object-cover"
                    />
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
                          <span>{course.estimatedTime}{isEnglish ? ' min' : '분'}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{isEnglish ? 'From my location' : '내 위치에서'} {getDistanceLabel(course.centerLat, course.centerLng)}</p>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Heart className="w-4 h-4" />
                        <span>{course.likeCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Badge className={`${difficultyColors[course.difficulty]} rounded-full`}>
                        {difficultyLabel(course.difficulty)}
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
            </div>
          </>
        )}
      </main>
    </div>
  );
}
