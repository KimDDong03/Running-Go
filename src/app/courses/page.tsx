'use client';

import { type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { loadMapSdk, type MapLike, type MapMarkerLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';
import { getCoursePreviewImageUrl } from '@/lib/course-preview-image';
import { createCurrentLocationMarkerElement } from '@/lib/current-location-marker';
import { LOCATION_FAB_BASE_CLASS, LOCATION_FAB_TRANSITION_CLASS, getLocationFabBottom } from '@/lib/map-controls';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { CourseSortSelect } from './_components/CourseSortSelect';
import { MapCourseCard } from './_components/MapCourseCard';
import { Heart, LocateFixed, MapPin } from 'lucide-react';
import { Difficulty } from '@prisma/client';

const difficultyLabelsKo: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
};

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-[#67c93a] text-[#102449]',
  MEDIUM: 'bg-[#ffb020] text-[#102449]',
  HARD: 'bg-[#ff5a36] text-white',
};

const DEFAULT_CENTER = {
  lat: 37.5665,
  lng: 126.978,
};

const BOTTOM_NAV_HEIGHT_PX = 74;
const PANEL_MIN_HEIGHT_PX = 32;
const PANEL_TOP_RESERVED_PX = 148;
const PANEL_SNAP_INDEX = {
  MIN: 0,
  MID: 1,
  MAX: 2,
} as const;
const ONBOARDING_STORAGE_KEY = 'running-go:onboarding:v1';
const FIRST_CREATE_PROMPT_STORAGE_KEY = 'running-go:first-create-prompt:v1';
const LAST_LOCATION_STORAGE_KEY = 'running-go:last-location:v1';
const MAP_VIEWPORT_STORAGE_KEY = 'running-go:map-viewport:v1';

type HeadingMode = 'off' | 'follow' | 'fan';

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

const getPanelSnapHeights = (viewportHeight: number) => {
  const min = PANEL_MIN_HEIGHT_PX;
  const maxCandidate = Math.min(Math.round(viewportHeight * 0.84), viewportHeight - PANEL_TOP_RESERVED_PX);
  const max = Math.max(min + 180, maxCandidate);
  const mid = Math.round((min + max) / 2);

  return { min, mid, max };
};

interface CourseMarkerEntry {
  marker: MapMarkerLike;
  signature: string;
}

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

const getInitialListSort = (): CourseListSort => {
  if (typeof window === 'undefined') {
    return 'NEAREST';
  }

  const sortParam = new URLSearchParams(window.location.search).get('sort');
  return sortParam ? parseCourseListSort(sortParam) : 'NEAREST';
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

const storeMapViewport = (viewport: { lat: number; lng: number; zoom: number }) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MAP_VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
};

export default function CoursesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { status: sessionStatus } = useSession();
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const [viewMode] = useState<'list' | 'map'>('map');
  const [listSort, setListSort] = useState<CourseListSort>(() => getInitialListSort());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocationRef = useRef(userLocation);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const selectedCourseIdRef = useRef<string | null>(null);
  const [panelHeight, setPanelHeight] = useState<number>(PANEL_MIN_HEIGHT_PX);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>(900);
  const [headingMode, setHeadingMode] = useState<HeadingMode>('off');
  const [isNearbyCourseMarkerVisible, setIsNearbyCourseMarkerVisible] = useState(true);
  const [isMarkerButtonVisible, setIsMarkerButtonVisible] = useState(true);
  const [nearbySearch, setNearbySearch] = useState<{ lat: number; lng: number; radiusKm: number }>({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    radiusKm: 5,
  });
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingHintVisible, setIsOnboardingHintVisible] = useState(false);
  const [hasDismissedFirstCreatePrompt, setHasDismissedFirstCreatePrompt] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(FIRST_CREATE_PROMPT_STORAGE_KEY) === '1';
  });
  const [selectionSource, setSelectionSource] = useState<'marker' | 'list' | 'recommended' | null>(null);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, { isLiked: boolean; likeCount: number }>>({});
  const onboardingSteps = isEnglish ? ONBOARDING_STEPS_EN : ONBOARDING_STEPS_KO;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  useEffect(() => {
    selectedCourseIdRef.current = selectedCourseId;
  }, [selectedCourseId]);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const userMarkerRef = useRef<MapMarkerLike | null>(null);
  const userMarkerImageRef = useRef<string | null>(null);
  const courseMarkerMapRef = useRef<Map<string, CourseMarkerEntry>>(new Map());
  const selectedOutlinePolylineRef = useRef<MapPolylineLike | null>(null);
  const selectedMainPolylineRef = useRef<MapPolylineLike | null>(null);
  const selectedPathColorRef = useRef<{ outline: string; main: string } | null>(null);
  const panelDragStateRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const markerReshowOnMoveRef = useRef(false);
  const markerReshowStartViewportRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const headingModeRef = useRef<HeadingMode>('off');
  const headingIndicatorElementRef = useRef<HTMLElement | null>(null);
  const headingListenerAttachedRef = useRef(false);
  const headingListenerRef = useRef<EventListener | null>(null);
  const headingEventSourceRef = useRef<'absolute' | 'relative' | null>(null);
  const currentHeadingRef = useRef<number>(0);
  const displayedHeadingRef = useRef<number>(0);
  const pendingHeadingRef = useRef<number | null>(null);
  const headingVisualRafRef = useRef<number | null>(null);
  const hasTrackedExploreViewedRef = useRef(false);
  const profileImageRef = useRef<string | null>(null);
  const lastListAutoFitCourseIdRef = useRef<string | null>(null);
  const isPanelInteractingRef = useRef(false);
  const panelSectionRef = useRef<HTMLElement | null>(null);
  const panelHeightRef = useRef<number>(PANEL_MIN_HEIGHT_PX);
  const panelHeightRafRef = useRef<number | null>(null);
  const panelPendingHeightRef = useRef<number | null>(null);
  const panelSnapIndexRef = useRef<number>(PANEL_SNAP_INDEX.MIN);
  const panelContentPullStateRef = useRef<{ startY: number; startHeight: number; isDraggingPanel: boolean } | null>(null);
  const panelContentPointerPullStateRef = useRef<{ pointerId: number; startY: number; startHeight: number; isDraggingPanel: boolean } | null>(null);

  const normalizeHeading = useCallback((heading: number) => {
    const normalized = heading % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }, []);

  const resolveHeading = useCallback((event: DeviceOrientationEvent) => {
    const iOSEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof iOSEvent.webkitCompassHeading === 'number' && Number.isFinite(iOSEvent.webkitCompassHeading)) {
      return normalizeHeading(iOSEvent.webkitCompassHeading);
    }
    if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
      return normalizeHeading(360 - event.alpha);
    }
    return null;
  }, [normalizeHeading]);

  const getHeadingDelta = useCallback((from: number, to: number) => {
    const raw = normalizeHeading(to) - normalizeHeading(from);
    if (raw > 180) return raw - 360;
    if (raw < -180) return raw + 360;
    return raw;
  }, [normalizeHeading]);

  const updateHeadingVisual = useCallback((heading: number) => {
    currentHeadingRef.current = normalizeHeading(heading);
    pendingHeadingRef.current = currentHeadingRef.current;

    if (headingVisualRafRef.current !== null) return;

    const animate = () => {
      const targetHeading = pendingHeadingRef.current;
      if (targetHeading === null) {
        headingVisualRafRef.current = null;
        return;
      }

      const current = displayedHeadingRef.current;
      const delta = getHeadingDelta(current, targetHeading);
      let next = current;

      if (Math.abs(delta) < 0.8) {
        next = normalizeHeading(targetHeading);
        pendingHeadingRef.current = null;
      } else {
        next = normalizeHeading(current + delta * 0.22);
      }

      displayedHeadingRef.current = next;
      if (headingIndicatorElementRef.current) {
        headingIndicatorElementRef.current.style.transform = `translate(-50%, -50%) rotate(${next}deg)`;
      }
      if (headingModeRef.current === 'fan') {
        mapRef.current?.setBearing?.(next);
      }

      if (pendingHeadingRef.current !== null) {
        headingVisualRafRef.current = window.requestAnimationFrame(animate);
        return;
      }

      headingVisualRafRef.current = null;
    };

    headingVisualRafRef.current = window.requestAnimationFrame(animate);
  }, [getHeadingDelta, normalizeHeading]);

  const resetHeadingVisual = useCallback((heading: number) => {
    const normalized = normalizeHeading(heading);
    currentHeadingRef.current = normalized;
    displayedHeadingRef.current = normalized;
    pendingHeadingRef.current = null;
    if (headingVisualRafRef.current !== null) {
      window.cancelAnimationFrame(headingVisualRafRef.current);
      headingVisualRafRef.current = null;
    }
    if (headingIndicatorElementRef.current) {
      headingIndicatorElementRef.current.style.transform = `translate(-50%, -50%) rotate(${normalized}deg)`;
    }
  }, [normalizeHeading]);

  const applyHeadingMode = useCallback((mode: HeadingMode) => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    headingModeRef.current = mode;
    setHeadingMode(mode);

    if (mode === 'off' || mode === 'follow') {
      if (headingIndicatorElementRef.current) {
        headingIndicatorElementRef.current.style.opacity = '1';
      }
      mapInstance.setBearing?.(0);
      resetHeadingVisual(currentHeadingRef.current);
      return;
    }

    if (headingIndicatorElementRef.current) {
      headingIndicatorElementRef.current.style.opacity = '1';
    }

    mapInstance.setBearing?.(displayedHeadingRef.current);

    resetHeadingVisual(currentHeadingRef.current);
  }, [resetHeadingVisual]);

  const ensureOrientationListener = useCallback(async () => {
    if (typeof window === 'undefined' || headingListenerAttachedRef.current) {
      return true;
    }

    if (!window.isSecureContext) {
      return false;
    }

    if (typeof DeviceOrientationEvent === 'undefined') {
      return false;
    }

    const requestPermission = (DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }).requestPermission;

    if (requestPermission) {
      try {
        const permission = await requestPermission();
        if (permission !== 'granted') {
          return false;
        }
      } catch {
        return false;
      }
    }

    const onDeviceOrientation: EventListener = (event) => {
      const source = event.type === 'deviceorientationabsolute' ? 'absolute' : 'relative';
      if (headingEventSourceRef.current && headingEventSourceRef.current !== source) {
        if (!(headingEventSourceRef.current === 'relative' && source === 'absolute')) {
          return;
        }
      }

      const heading = resolveHeading(event as DeviceOrientationEvent);
      if (heading === null) return;

      if (headingEventSourceRef.current !== source) {
        headingEventSourceRef.current = source;
      }
      updateHeadingVisual(heading);
    };

    headingListenerRef.current = onDeviceOrientation;
    headingEventSourceRef.current = null;
    window.addEventListener('deviceorientationabsolute', onDeviceOrientation, true);
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    headingListenerAttachedRef.current = true;

    return true;
  }, [resolveHeading, updateHeadingVisual]);

  const syncNearbySearchFromMap = useCallback((mapInstance: MapLike, centerOverride?: { lat: number; lng: number }) => {
    const mapCenter = mapInstance.getCenter();
    const centerLat = centerOverride?.lat ?? mapCenter.lat();
    const centerLng = centerOverride?.lng ?? mapCenter.lng();
    const bounds = mapInstance.getBounds();
    const northEast = bounds.getNE();
    const radiusKmFromViewport = calculateDistanceKm(
      centerLat,
      centerLng,
      northEast.lat(),
      northEast.lng()
    );

    setNearbySearch({
      lat: centerLat,
      lng: centerLng,
      radiusKm: Math.min(20, Math.max(1.5, radiusKmFromViewport)),
    });
  }, []);

  const syncMarkerViewport = useCallback((centerOverride?: { lat: number; lng: number }) => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    syncNearbySearchFromMap(mapInstance, centerOverride);
    const centerLat = centerOverride?.lat ?? mapInstance.getCenter().lat();
    const centerLng = centerOverride?.lng ?? mapInstance.getCenter().lng();
    markerReshowOnMoveRef.current = true;
    markerReshowStartViewportRef.current = {
      lat: centerLat,
      lng: centerLng,
      zoom: mapInstance.getZoom(),
    };
    setIsNearbyCourseMarkerVisible(true);
    setIsMarkerButtonVisible(false);
  }, [syncNearbySearchFromMap]);

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

  const { data: selectedCourse } = trpc.course.byId.useQuery(
    { id: selectedCourseId ?? '' },
    { enabled: Boolean(selectedCourseId) }
  );
  const { data: profileSummary } = trpc.profile.summary.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  });
  const toggleLikeMutation = trpc.like.toggle.useMutation();
  useEffect(() => {
    profileImageRef.current = profileSummary?.user.image ?? null;
  }, [profileSummary?.user.image]);

  const courseByIdMap = useMemo(() => {
    return new Map((courses?.courses ?? []).map((course) => [course.id, course] as const));
  }, [courses?.courses]);

  const likeStateMap = useMemo(() => {
    const map = new Map<string, { isLiked: boolean; likeCount: number }>();
    for (const course of courses?.courses ?? []) {
      map.set(course.id, {
        isLiked: Boolean(course.isLiked),
        likeCount: course.likeCount,
      });
    }
    if (selectedCourse?.id) {
      map.set(selectedCourse.id, {
        isLiked: Boolean(selectedCourse.isLiked),
        likeCount: selectedCourse.likeCount,
      });
    }
    for (const [courseId, state] of Object.entries(likeOverrides)) {
      map.set(courseId, state);
    }
    return map;
  }, [courses?.courses, likeOverrides, selectedCourse]);

  const getLikeState = useCallback((courseId: string, fallbackLikeCount: number) => {
    return likeStateMap.get(courseId) ?? { isLiked: false, likeCount: fallbackLikeCount };
  }, [likeStateMap]);

  const handleToggleLike = useCallback((courseId: string, fallbackLikeCount: number) => {
    if (sessionStatus !== 'authenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    const previous = getLikeState(courseId, fallbackLikeCount);
    const optimisticLikeCount = Math.max(0, previous.likeCount + (previous.isLiked ? -1 : 1));

    setLikeOverrides((current) => ({
      ...current,
      [courseId]: {
        isLiked: !previous.isLiked,
        likeCount: optimisticLikeCount,
      },
    }));

    toggleLikeMutation.mutate(
      { courseId },
      {
        onSuccess: (result) => {
          setLikeOverrides((current) => ({
            ...current,
            [courseId]: {
              isLiked: result.isLiked,
              likeCount: result.likeCount,
            },
          }));
          utils.course.list.setData(courseListInput, (previous) => {
            if (!previous) return previous;
            return {
              ...previous,
              courses: previous.courses.map((course) => (
                course.id === courseId
                  ? { ...course, isLiked: result.isLiked, likeCount: result.likeCount }
                  : course
              )),
            };
          });
          utils.course.byId.setData({ id: courseId }, (previous) => {
            if (!previous) return previous;
            return {
              ...previous,
              isLiked: result.isLiked,
              likeCount: result.likeCount,
            };
          });
          utils.course.nearby.setData(
            { lat: nearbySearch.lat, lng: nearbySearch.lng, radiusKm: nearbySearch.radiusKm, limit: 30 },
            (previous) => {
              if (!previous) return previous;
              return {
                ...previous,
                courses: previous.courses.map((course) => (
                  course.id === courseId
                    ? { ...course, isLiked: result.isLiked }
                    : course
                )),
              };
            }
          );
        },
        onError: (error) => {
          setLikeOverrides((current) => ({
            ...current,
            [courseId]: previous,
          }));
          toast.error(error.data?.code === 'UNAUTHORIZED'
            ? (isEnglish ? 'Sign-in is required.' : '로그인이 필요합니다')
            : (isEnglish ? 'Failed to update like.' : '좋아요를 반영하지 못했습니다'));
        },
      }
    );
  }, [courseListInput, getLikeState, isEnglish, nearbySearch.lat, nearbySearch.lng, nearbySearch.radiusKm, router, sessionStatus, toggleLikeMutation, utils.course.byId, utils.course.list, utils.course.nearby]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current || !userMarkerRef.current) return;

    const markerImage = profileSummary?.user.image ?? null;
    if (userMarkerImageRef.current === markerImage) return;

    const currentPosition = userMarkerRef.current.getPosition?.() ?? mapRef.current.getCenter();
    const markerContent = createCurrentLocationMarkerElement(markerImage, { size: 36 });
    headingIndicatorElementRef.current = markerContent.querySelector('[data-role="heading-indicator"]') as HTMLElement | null;
    userMarkerRef.current.setMap(null);
    userMarkerRef.current = new mapSdkRef.current.Marker({
      map: mapRef.current,
      position: currentPosition,
      icon: {
        content: markerContent,
        size: new mapSdkRef.current.Size(36, 36),
        anchor: new mapSdkRef.current.Point(18, 18),
      },
    });
    userMarkerImageRef.current = markerImage;
    applyHeadingMode(headingModeRef.current);
    void ensureOrientationListener();
  }, [applyHeadingMode, ensureOrientationListener, profileSummary?.user.image, viewMode]);

  const selectedWaypointList = useMemo(() => {
    if (!selectedCourseId) return [] as { lat: number; lng: number }[];
    const fallbackCourseFromList = courses?.courses.find((course) => course.id === selectedCourseId) ?? null;
    const waypointSource = Array.isArray(selectedCourse?.waypoints)
      ? selectedCourse.waypoints
      : Array.isArray(fallbackCourseFromList?.waypoints)
        ? fallbackCourseFromList.waypoints
        : [];

    if (!Array.isArray(waypointSource) || waypointSource.length === 0) {
      return [] as { lat: number; lng: number }[];
    }

    const raw = waypointSource
      .map((point) => {
        if (!point || typeof point !== 'object') return null;

        const lat = (point as { lat?: unknown }).lat;
        const lng = (point as { lng?: unknown }).lng;
        const order = (point as { order?: unknown }).order;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
          return null;
        }

        return { lat, lng, order: typeof order === 'number' ? order : 0 } as CourseWaypoint;
      })
      .filter((point): point is CourseWaypoint => Boolean(point));

    return [...raw]
      .sort((a, b) => a.order - b.order)
      .map((point) => ({ lat: point.lat, lng: point.lng }));
  }, [courses?.courses, selectedCourse, selectedCourseId]);

  const starterCourse = useMemo(() => {
    const items = courses?.courses ?? [];
    if (!items.length) return null;

    const easyCourse = items
      .filter((course) => course.difficulty === 'EASY')
      .sort((a, b) => a.totalDistance - b.totalDistance)[0];

    if (easyCourse) return easyCourse;

    return [...items].sort((a, b) => a.totalDistance - b.totalDistance)[0] ?? null;
  }, [courses?.courses]);

  useEffect(() => {
    if (hasTrackedExploreViewedRef.current) return;
    if (isLoading || isError) return;

    trackEvent('explore_viewed', {
      is_authed: sessionStatus === 'authenticated',
      sort_by: listSort,
      has_user_location: Boolean(userLocation),
      course_count: courses?.courses.length ?? 0,
    });
    hasTrackedExploreViewedRef.current = true;
  }, [courses?.courses.length, isError, isLoading, listSort, sessionStatus, userLocation]);

  useEffect(() => {
    if (!selectedCourseId || !selectedCourse) return;

    trackEvent('course_selected', {
      course_id: selectedCourseId,
      source: selectionSource ?? 'list',
      sort_by: listSort,
      distance_km: Number(selectedCourse.totalDistance.toFixed(1)),
    });
  }, [listSort, selectedCourse, selectedCourseId, selectionSource]);

  const panelSnapHeights = useMemo(() => getPanelSnapHeights(viewportHeight), [viewportHeight]);

  const getPanelHeightFromSnapIndex = useCallback((index: number) => {
    if (index === PANEL_SNAP_INDEX.MID) return panelSnapHeights.mid;
    if (index === PANEL_SNAP_INDEX.MAX) return panelSnapHeights.max;
    return panelSnapHeights.min;
  }, [panelSnapHeights.max, panelSnapHeights.mid, panelSnapHeights.min]);

  const applyPanelHeight = useCallback((height: number, commitState: boolean) => {
    panelHeightRef.current = height;
    if (panelSectionRef.current) {
      panelSectionRef.current.style.height = `${height}px`;
    }
    if (commitState) {
      setPanelHeight(height);
    }
  }, []);

  const snapPanelHeight = useCallback((height: number) => {
    const candidates = [panelSnapHeights.min, panelSnapHeights.mid, panelSnapHeights.max];
    const nearest = candidates.reduce((closest, value) => {
      return Math.abs(value - height) < Math.abs(closest - height) ? value : closest;
    }, candidates[0]);

    const nextIndex = nearest === panelSnapHeights.max
      ? PANEL_SNAP_INDEX.MAX
      : nearest === panelSnapHeights.mid
        ? PANEL_SNAP_INDEX.MID
        : PANEL_SNAP_INDEX.MIN;

    panelSnapIndexRef.current = nextIndex;
    applyPanelHeight(nearest, true);
  }, [applyPanelHeight, panelSnapHeights.max, panelSnapHeights.mid, panelSnapHeights.min]);

  const snapPanelTo = useCallback((index: number) => {
    const safeIndex = Math.max(PANEL_SNAP_INDEX.MIN, Math.min(PANEL_SNAP_INDEX.MAX, index)) as 0 | 1 | 2;
    const nextHeight = getPanelHeightFromSnapIndex(safeIndex);
    panelSnapIndexRef.current = safeIndex;
    applyPanelHeight(nextHeight, true);
  }, [applyPanelHeight, getPanelHeightFromSnapIndex]);

  const collapsePanelToMin = useCallback(() => {
    snapPanelTo(PANEL_SNAP_INDEX.MIN);
  }, [snapPanelTo]);

  const onPanelHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    panelDragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelHeightRef.current,
    };
    setIsPanelDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPanelHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = panelDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const delta = dragState.startY - event.clientY;
    const nextHeight = dragState.startHeight + delta;
    const clamped = Math.max(panelSnapHeights.min, Math.min(panelSnapHeights.max, nextHeight));
    panelPendingHeightRef.current = clamped;
    if (panelHeightRafRef.current !== null) return;
    panelHeightRafRef.current = window.requestAnimationFrame(() => {
      panelHeightRafRef.current = null;
      if (typeof panelPendingHeightRef.current !== 'number') return;
      applyPanelHeight(panelPendingHeightRef.current, false);
    });
  };

  const onPanelHandlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = panelDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    panelDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (panelHeightRafRef.current !== null) {
      window.cancelAnimationFrame(panelHeightRafRef.current);
      panelHeightRafRef.current = null;
      if (typeof panelPendingHeightRef.current === 'number') {
        applyPanelHeight(panelPendingHeightRef.current, false);
      }
    }
    panelPendingHeightRef.current = null;
    setIsPanelDragging(false);
    snapPanelHeight(panelHeightRef.current);
  };

  const setMapInteractiveForPanel = useCallback((isInteracting: boolean) => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;
    mapInstance.setOptions?.({
      draggable: !isInteracting,
      pinchZoom: !isInteracting,
      scrollWheel: !isInteracting,
    });
  }, []);

  const beginPanelInteraction = useCallback(() => {
    if (isPanelInteractingRef.current) return;
    isPanelInteractingRef.current = true;
    setMapInteractiveForPanel(true);
  }, [setMapInteractiveForPanel]);

  const endPanelInteraction = useCallback(() => {
    if (!isPanelInteractingRef.current) return;
    isPanelInteractingRef.current = false;
    setMapInteractiveForPanel(false);
  }, [setMapInteractiveForPanel]);

  const isInteractivePanelTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('button, a, input, select, textarea, [role="button"], [data-rg-interactive="true"]'));
  }, []);

  const onPanelContentPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractivePanelTarget(event.target)) {
      return;
    }

    if (event.pointerType === 'touch') {
      beginPanelInteraction();
      return;
    }

    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    panelContentPointerPullStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panelHeightRef.current,
      isDraggingPanel: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [beginPanelInteraction, isInteractivePanelTarget]);

  const onPanelContentPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = panelContentPointerPullStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - state.startY;
    const content = event.currentTarget;

    if (!state.isDraggingPanel) {
      if (deltaY <= 0) return;
      if (content.scrollTop > 0.5) return;
      state.isDraggingPanel = true;
      state.startHeight = panelHeightRef.current;
      beginPanelInteraction();
      setIsPanelDragging(true);
    }

    event.preventDefault();
    const nextHeight = state.startHeight - deltaY;
    const clamped = Math.max(panelSnapHeights.min, Math.min(panelSnapHeights.max, nextHeight));
    applyPanelHeight(clamped, false);
  }, [applyPanelHeight, beginPanelInteraction, panelSnapHeights.max, panelSnapHeights.min]);

  const onPanelContentPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = panelContentPointerPullStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      if (event.pointerType === 'touch') {
        endPanelInteraction();
      }
      return;
    }

    panelContentPointerPullStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (state.isDraggingPanel) {
      setIsPanelDragging(false);
      snapPanelHeight(panelHeightRef.current);
      endPanelInteraction();
      return;
    }

    endPanelInteraction();
  }, [endPanelInteraction, snapPanelHeight]);

  const onPanelContentTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (isInteractivePanelTarget(event.target)) {
      return;
    }

    beginPanelInteraction();
    panelContentPullStateRef.current = {
      startY: event.touches[0]?.clientY ?? 0,
      startHeight: panelHeightRef.current,
      isDraggingPanel: false,
    };
  }, [beginPanelInteraction, isInteractivePanelTarget]);

  const onPanelContentTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const state = panelContentPullStateRef.current;
    if (!state) return;

    const touch = event.touches[0];
    if (!touch) return;

    const deltaY = touch.clientY - state.startY;
    const content = event.currentTarget;

    if (!state.isDraggingPanel) {
      if (deltaY <= 0) return;
      if (content.scrollTop > 0.5) return;
      state.isDraggingPanel = true;
      state.startHeight = panelHeightRef.current;
      setIsPanelDragging(true);
    }

    event.preventDefault();
    const nextHeight = state.startHeight - deltaY;
    const clamped = Math.max(panelSnapHeights.min, Math.min(panelSnapHeights.max, nextHeight));
    applyPanelHeight(clamped, false);
  }, [applyPanelHeight, panelSnapHeights.max, panelSnapHeights.min]);

  const onPanelContentTouchEnd = useCallback(() => {
    const state = panelContentPullStateRef.current;
    panelContentPullStateRef.current = null;
    if (state?.isDraggingPanel) {
      setIsPanelDragging(false);
      snapPanelHeight(panelHeightRef.current);
    }
    endPanelInteraction();
  }, [endPanelInteraction, snapPanelHeight]);

  useEffect(() => {
    const release = () => {
      endPanelInteraction();
    };

    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);

    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
      setMapInteractiveForPanel(false);
    };
  }, [endPanelInteraction, setMapInteractiveForPanel]);

  useEffect(() => {
    return () => {
      if (panelHeightRafRef.current !== null) {
        window.cancelAnimationFrame(panelHeightRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncViewportHeight = () => {
      setViewportHeight(window.innerHeight);
    };

    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);
    return () => {
      window.removeEventListener('resize', syncViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const focusCourseId = params.get('focusCourseId');
    const sortParam = params.get('sort');
    const showMarkersParam = params.get('showMarkers');

    if (sortParam) {
      params.delete('sort');
    }

    if (showMarkersParam === '1') {
      queueMicrotask(() => {
        setIsNearbyCourseMarkerVisible(true);
        setIsMarkerButtonVisible(false);
      });
      params.delete('showMarkers');
    }

    if (focusCourseId) {
      queueMicrotask(() => {
        setIsNearbyCourseMarkerVisible(true);
        setSelectionSource('list');
        setSelectedCourseId(focusCourseId);
      });
      params.delete('focusCourseId');
    }

    const hasKnownParams = Boolean(sortParam) || showMarkersParam === '1' || Boolean(focusCourseId);
    if (!hasKnownParams) return;

    const queryString = params.toString();
    const nextUrl = queryString
      ? `${window.location.pathname}?${queryString}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    if (viewMode !== 'map' || userLocation) return;

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
  }, [isEnglish, userLocation, viewMode]);

  const toLatLng = useCallback((lat: number, lng: number) => {
    const sdk = mapSdkRef.current;
    if (!sdk) {
      throw new Error(isEnglish ? 'Map SDK is not ready yet.' : '네이버 지도 SDK가 준비되지 않았습니다');
    }
    return new sdk.LatLng(lat, lng);
  }, [isEnglish]);

  const clearCourseMarkers = useCallback(() => {
    courseMarkerMapRef.current.forEach(({ marker }) => {
      marker.setMap(null);
    });
    courseMarkerMapRef.current.clear();
  }, []);

  const clearSelectedPath = useCallback(() => {
    selectedOutlinePolylineRef.current?.setMap(null);
    selectedMainPolylineRef.current?.setMap(null);
    selectedOutlinePolylineRef.current = null;
    selectedMainPolylineRef.current = null;
    selectedPathColorRef.current = null;
  }, []);

  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current || mapRef.current) return;

    let isMounted = true;
    let dragListener: object | null = null;
    let dragEndListener: object | null = null;
    let zoomListener: object | null = null;
    let idleListener: object | null = null;

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !mapContainerRef.current) return;

        mapSdkRef.current = sdk;
        const storedLocation = readStoredLocation();
        const initialCenter = userLocationRef.current ?? storedLocation ?? DEFAULT_CENTER;
        const initialUserLocation = userLocationRef.current ?? storedLocation;
        if (!userLocationRef.current && storedLocation) {
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
            const markerImage = profileImageRef.current;
            const markerContent = createCurrentLocationMarkerElement(markerImage, { size: 36 });
            headingIndicatorElementRef.current = markerContent.querySelector('[data-role="heading-indicator"]') as HTMLElement | null;
            userMarkerRef.current?.setMap(null);
          userMarkerRef.current = new sdk.Marker({
            map: mapInstance,
            position: new sdk.LatLng(initialUserLocation.lat, initialUserLocation.lng),
            icon: {
              content: markerContent,
              size: new sdk.Size(36, 36),
              anchor: new sdk.Point(18, 18),
            },
          });
          userMarkerImageRef.current = markerImage;
          applyHeadingMode(headingModeRef.current);
          void ensureOrientationListener();
        }

        const handleMapDragStart = () => {
          collapsePanelToMin();
          setIsMarkerButtonVisible(true);
          if (markerReshowOnMoveRef.current) {
            markerReshowOnMoveRef.current = false;
            markerReshowStartViewportRef.current = null;
          }
          if (headingModeRef.current !== 'off') {
            headingModeRef.current = 'off';
            setHeadingMode('off');
          }
        };

        const handleMapDragEnd = () => {
          mapInstance.setBearing?.(0);
        };

        const handleMapZoomChanged = () => {
          setIsMarkerButtonVisible(true);
          if (markerReshowOnMoveRef.current) {
            markerReshowOnMoveRef.current = false;
            markerReshowStartViewportRef.current = null;
          }
          if (headingModeRef.current !== 'off') {
            applyHeadingMode('off');
          }
        };

        const handleMapIdle = () => {
          const center = mapInstance.getCenter();
          storeMapViewport({
            lat: center.lat(),
            lng: center.lng(),
            zoom: mapInstance.getZoom(),
          });

          if (markerReshowOnMoveRef.current && markerReshowStartViewportRef.current) {
            const startViewport = markerReshowStartViewportRef.current;
            const movedDistanceKm = calculateDistanceKm(
              startViewport.lat,
              startViewport.lng,
              center.lat(),
              center.lng()
            );
            const zoomDelta = Math.abs(mapInstance.getZoom() - startViewport.zoom);

            if (movedDistanceKm >= 0.05 || zoomDelta >= 0.2) {
              setIsMarkerButtonVisible(true);
              markerReshowOnMoveRef.current = false;
              markerReshowStartViewportRef.current = null;
            }
          }
        };

        dragListener = sdk.Event.addListener(mapInstance, 'dragstart', handleMapDragStart);
        dragEndListener = sdk.Event.addListener(mapInstance, 'dragend', handleMapDragEnd);
        zoomListener = sdk.Event.addListener(mapInstance, 'zoom_changed', handleMapZoomChanged);
        idleListener = sdk.Event.addListener(mapInstance, 'idle', handleMapIdle);
        handleMapIdle();
      })
      .catch(() => {
        setLocationError(isEnglish ? 'Failed to load map. Please try again shortly.' : '지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요');
      });

    return () => {
      isMounted = false;
      if (mapSdkRef.current && dragListener) {
        mapSdkRef.current.Event.removeListener(dragListener);
      }
      if (mapSdkRef.current && dragEndListener) {
        mapSdkRef.current.Event.removeListener(dragEndListener);
      }
      if (mapSdkRef.current && zoomListener) {
        mapSdkRef.current.Event.removeListener(zoomListener);
      }
      if (mapSdkRef.current && idleListener) {
        mapSdkRef.current.Event.removeListener(idleListener);
      }
      if (typeof window !== 'undefined' && headingListenerAttachedRef.current && headingListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute', headingListenerRef.current, true);
        window.removeEventListener('deviceorientation', headingListenerRef.current, true);
      }
      if (headingVisualRafRef.current !== null) {
        window.cancelAnimationFrame(headingVisualRafRef.current);
        headingVisualRafRef.current = null;
      }
      pendingHeadingRef.current = null;
      headingListenerAttachedRef.current = false;
      headingListenerRef.current = null;
      headingEventSourceRef.current = null;
      headingIndicatorElementRef.current = null;
      headingModeRef.current = 'off';
      setHeadingMode('off');
      clearCourseMarkers();
      clearSelectedPath();
      markerReshowOnMoveRef.current = false;
      markerReshowStartViewportRef.current = null;
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [applyHeadingMode, clearCourseMarkers, clearSelectedPath, collapsePanelToMin, ensureOrientationListener, isEnglish, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current || !userLocation) return;

    const center = toLatLng(userLocation.lat, userLocation.lng);
    const markerImage = profileImageRef.current;

    if (!selectedCourseIdRef.current) {
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(14);
    }

    if (!userMarkerRef.current || userMarkerImageRef.current !== markerImage) {
      const markerContent = createCurrentLocationMarkerElement(markerImage, { size: 36 });
      headingIndicatorElementRef.current = markerContent.querySelector('[data-role="heading-indicator"]') as HTMLElement | null;
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = new mapSdkRef.current.Marker({
        map: mapRef.current,
        position: center,
        icon: {
          content: markerContent,
          size: new mapSdkRef.current.Size(36, 36),
          anchor: new mapSdkRef.current.Point(18, 18),
        },
      });
      userMarkerImageRef.current = markerImage;
      applyHeadingMode(headingModeRef.current);
      void ensureOrientationListener();
      return;
    }

    userMarkerRef.current.setPosition(center);
  }, [applyHeadingMode, ensureOrientationListener, toLatLng, userLocation, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current) return;

    const sdk = mapSdkRef.current;
    const mapInstance = mapRef.current;
    const markerMap = courseMarkerMapRef.current;

    if (!isNearbyCourseMarkerVisible) {
      clearCourseMarkers();
      return;
    }

    const markerCourses = [...(nearbyCourses?.courses ?? [])];
    const selectedCourseFromList = selectedCourseId ? courseByIdMap.get(selectedCourseId) : undefined;
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
        isLiked: selectedCourseFromList.isLiked,
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
        isLiked: selectedCourse.isLiked,
      });
    }

    const desiredCourseIds = new Set(markerCourses.map((course) => course.id));

    markerMap.forEach((entry, courseId) => {
      if (desiredCourseIds.has(courseId)) return;
      entry.marker.setMap(null);
      markerMap.delete(courseId);
    });

    markerCourses.forEach((course) => {
      const courseIsLiked = getLikeState(course.id, 0).isLiked;
      const styleToken = selectedCourseId === course.id
        ? (courseIsLiked ? 'selected-liked' : 'selected')
        : (courseIsLiked ? 'liked' : 'default');
      const signature = `${styleToken}:${course.centerLat.toFixed(6)}:${course.centerLng.toFixed(6)}`;
      const existingEntry = markerMap.get(course.id);
      if (existingEntry && existingEntry.signature === signature) {
        existingEntry.marker.setPosition(toLatLng(course.centerLat, course.centerLng));
        return;
      }

      existingEntry?.marker.setMap(null);

      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = [
        'h-9 w-9 rounded-full border-2 border-white text-white shadow-lg',
        'flex items-center justify-center text-sm',
        selectedCourseId === course.id
          ? (courseIsLiked ? 'bg-[#ff5a36]' : 'bg-[#0f5fd7]')
          : (courseIsLiked ? 'bg-[#ffb020] text-[#102449]' : 'bg-[#67c93a] text-[#102449]'),
      ].join(' ');
      markerButton.textContent = courseIsLiked ? '❤️' : '🏃';
      markerButton.title = course.title;
      markerButton.onclick = () => {
        setSelectionSource('marker');
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
      markerMap.set(course.id, { marker, signature });
    });
  }, [courseByIdMap, getLikeState, isNearbyCourseMarkerVisible, nearbyCourses, selectedCourse, selectedCourseId, viewMode, clearCourseMarkers, toLatLng]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !mapSdkRef.current) return;

    const sdk = mapSdkRef.current;
    const mapInstance = mapRef.current;
    const selectedCourseForPath = selectedCourse
      ?? (selectedCourseId ? courseByIdMap.get(selectedCourseId) : undefined)
      ?? null;
    const selectedPathColors = selectedCourseForPath
      && getLikeState(selectedCourseForPath.id, selectedCourseForPath.likeCount).isLiked
      ? { outline: '#ffb020', main: '#ff5a36' }
      : { outline: '#0f5fd7', main: '#1d8fff' };
    if (!selectedCourseId || !selectedCourseForPath || selectedWaypointList.length < 2) {
      clearSelectedPath();
      return;
    }

    const path = selectedWaypointList.map((point) => toLatLng(point.lat, point.lng));
    const previousColors = selectedPathColorRef.current;
    const colorChanged = !previousColors
      || previousColors.outline !== selectedPathColors.outline
      || previousColors.main !== selectedPathColors.main;

    if (!selectedOutlinePolylineRef.current || !selectedMainPolylineRef.current || colorChanged) {
      clearSelectedPath();
      selectedOutlinePolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: selectedPathColors.outline,
        strokeWeight: 8,
        strokeOpacity: 0.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });

      selectedMainPolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: selectedPathColors.main,
        strokeWeight: 6,
        strokeOpacity: 0.98,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
      selectedPathColorRef.current = selectedPathColors;
      return;
    }

    selectedOutlinePolylineRef.current.setPath(path);
    selectedMainPolylineRef.current.setPath(path);
  }, [courseByIdMap, getLikeState, selectedCourse, selectedCourseId, selectedWaypointList, viewMode, clearSelectedPath, toLatLng]);

  useEffect(() => {
    if (viewMode !== 'map' || selectionSource !== 'list') return;
    if (!mapRef.current || !mapSdkRef.current) return;
    if (!selectedCourseId || selectedWaypointList.length < 2) return;
    if (lastListAutoFitCourseIdRef.current === selectedCourseId) return;

    const sdk = mapSdkRef.current;
    const mapInstance = mapRef.current;
    const bounds = new sdk.LatLngBounds();
    selectedWaypointList.forEach((point) => {
      bounds.extend(new sdk.LatLng(point.lat, point.lng));
    });

    mapInstance.fitBounds(bounds, {
      top: 56,
      right: 40,
      left: 40,
      bottom: 140,
    });
    lastListAutoFitCourseIdRef.current = selectedCourseId;
  }, [selectedCourseId, selectedWaypointList, selectionSource, viewMode]);

  useEffect(() => {
    if (!selectedCourseId || selectionSource !== 'list') {
      lastListAutoFitCourseIdRef.current = null;
    }
  }, [selectedCourseId, selectionSource]);

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

  const mapPanelCourses = useMemo(() => {
    return (courses?.courses ?? []).map((course) => {
      const raw = Array.isArray(course.waypoints)
        ? (course.waypoints as { lat: number; lng: number }[])
        : [];
      const sampled = raw.length <= maxPathPoints
        ? raw
        : (() => {
          const step = Math.ceil(raw.length / maxPathPoints);
          const next: { lat: number; lng: number }[] = [];
          for (let i = 0; i < raw.length; i += step) {
            next.push(raw[i]);
          }
          if (next[next.length - 1] !== raw[raw.length - 1]) {
            next.push(raw[raw.length - 1]);
          }
          return next;
        })();
      return {
        ...course,
        previewUrl: getCoursePreviewImageUrl(sampled, { lat: course.centerLat, lng: course.centerLng }, { width: 240, height: 160 }),
      };
    });
  }, [courses?.courses, maxPathPoints]);
  const locationButtonTransitionClass = LOCATION_FAB_TRANSITION_CLASS;
  const locationButtonBottom = panelHeight + BOTTOM_NAV_HEIGHT_PX + (selectedCourse ? 148 : 12);
  const canRenderMapPanelAd = !isLoading
    && !isError
    && !isOnboardingOpen
    && (courses?.courses.length ?? 0) >= 6;
  const locationButtonModeClass = headingMode === 'off'
    ? '!border-white/80 !bg-white/95 !text-slate-700'
    : headingMode === 'follow'
      ? '!border-[#1d8fff]/60 !bg-[#0f5fd7] !text-white shadow-[0_10px_20px_-14px_rgba(15,95,215,0.8)]'
      : '!border-[#67c93a]/70 !bg-[#67c93a] !text-[#102449] shadow-[0_10px_20px_-14px_rgba(103,201,58,0.72)] ring-2 ring-[#67c93a]/30';
  const locationButtonAriaLabel = headingMode === 'off'
    ? (isEnglish ? 'Move to current location (tracking off)' : '내 현재 위치로 이동 (추적 꺼짐)')
    : headingMode === 'follow'
      ? (isEnglish ? 'Move to current location (tracking on)' : '내 현재 위치로 이동 (추적 켜짐)')
      : (isEnglish ? 'Move to current location (tracking + heading fan on)' : '내 현재 위치로 이동 (추적 + 방향 부채꼴 켜짐)');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--rg-home-fab-bottom', `${locationButtonBottom}px`);
    return () => {
      document.documentElement.style.removeProperty('--rg-home-fab-bottom');
    };
  }, [locationButtonBottom]);
  const selectedCourseLikeState = selectedCourse
    ? getLikeState(selectedCourse.id, selectedCourse.likeCount)
    : null;

  const getDistanceLabel = (courseLat: number, courseLng: number) => {
    if (locationError) return isEnglish ? 'Need location permission' : '위치 권한 필요';
    if (!userLocation) return isEnglish ? 'Checking distance' : '거리 확인 중';

    const distanceKm = calculateDistanceKm(userLocation.lat, userLocation.lng, courseLat, courseLng);
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    }

    return `${distanceKm.toFixed(1)}km`;
  };

  const focusMapOnCourse = useCallback((lat: number, lng: number) => {
    const mapInstance = mapRef.current;
    const sdk = mapSdkRef.current;
    if (!mapInstance || !sdk) return;
    const target = new sdk.LatLng(lat, lng);
    if (mapInstance.panTo) {
      mapInstance.panTo(target, { duration: 420 });
      return;
    }
    mapInstance.setCenter(target);
  }, []);

  const handleMapListCourseSelect = useCallback((courseId: string, centerLat: number, centerLng: number) => {
    setIsNearbyCourseMarkerVisible(true);
    setSelectionSource('list');
    lastListAutoFitCourseIdRef.current = null;
    focusMapOnCourse(centerLat, centerLng);
    syncMarkerViewport({ lat: centerLat, lng: centerLng });
    setSelectedCourseId(courseId);
    panelContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    collapsePanelToMin();
  }, [collapsePanelToMin, focusMapOnCourse, syncMarkerViewport]);

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

    const moveAndApplyNextMode = async (lat: number, lng: number, mode: HeadingMode) => {
      moveMap(lat, lng);

      const orientationReady = await ensureOrientationListener();
      if (!orientationReady && mode === 'fan') {
        toast.error(isEnglish
          ? 'Direction sensor is unavailable on this device.'
          : '이 기기에서는 방향 센서를 사용할 수 없습니다');
        applyHeadingMode('follow');
        return;
      }

      applyHeadingMode(mode);
    };

    const nextMode: HeadingMode = headingModeRef.current === 'off'
      ? 'follow'
      : headingModeRef.current === 'follow'
        ? 'fan'
        : 'off';

    if (userLocation) {
      void moveAndApplyNextMode(userLocation.lat, userLocation.lng, nextMode);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError(isEnglish ? 'Unable to get current location. Showing default location.' : '현재 위치를 가져올 수 없어 기본 위치를 표시합니다');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void moveAndApplyNextMode(position.coords.latitude, position.coords.longitude, nextMode);
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
    setIsOnboardingHintVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    }
  };

  const closeFirstCreatePrompt = useCallback(() => {
    setHasDismissedFirstCreatePrompt(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FIRST_CREATE_PROMPT_STORAGE_KEY, '1');
    }
  }, []);

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
    queueMicrotask(() => {
      setOnboardingStepIndex(0);
      setIsOnboardingHintVisible(true);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStatus !== 'authenticated') return;
    if ((profileSummary?.stats.createdCourses ?? 0) > 0) {
      window.localStorage.setItem(FIRST_CREATE_PROMPT_STORAGE_KEY, '1');
    }
  }, [profileSummary?.stats.createdCourses, sessionStatus]);

  const onboardingStep = onboardingSteps[onboardingStepIndex];
  const isLastOnboardingStep = onboardingStepIndex === onboardingSteps.length - 1;
  const shouldShowFirstCreatePrompt = sessionStatus === 'authenticated'
    && (profileSummary?.stats.createdCourses ?? 0) === 0
    && !hasDismissedFirstCreatePrompt;
  const panelScrollableContent = (
    <div
      ref={panelContentRef}
      className="h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-[max(env(safe-area-inset-bottom),12px)] [-webkit-overflow-scrolling:touch]"
      style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-y',
      }}
      onPointerDown={onPanelContentPointerDown}
      onPointerMove={onPanelContentPointerMove}
      onPointerUp={onPanelContentPointerEnd}
      onPointerCancel={onPanelContentPointerEnd}
      onTouchStart={onPanelContentTouchStart}
      onTouchMove={onPanelContentTouchMove}
      onTouchEnd={onPanelContentTouchEnd}
      onTouchCancel={onPanelContentTouchEnd}
    >
      <div className="mb-3 space-y-2">
        {shouldShowFirstCreatePrompt ? (
          <div className="rounded-2xl border border-[#ffb020]/40 bg-[#fff7e6] px-3 py-3 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold text-[#9a4d00]">
              {isEnglish ? 'First creator mission' : '첫 제작 미션'}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#7b3f00]">
              {isEnglish
                ? 'Try drawing your first course. It only takes a minute and unlocks your creator progress.'
                : '첫 코스를 직접 그려보세요. 1분이면 시작할 수 있고, 제작자 진행도가 바로 쌓입니다.'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-3 text-[11px]"
                onClick={() => {
                  closeFirstCreatePrompt();
                  trackEvent('first_create_prompt_clicked', { locale });
                  router.push('/create');
                }}
              >
                {isEnglish ? 'Create now' : '지금 만들기'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-[#ffd48a] bg-white/80 px-3 text-[11px] text-[#9a4d00]"
                onClick={closeFirstCreatePrompt}
              >
                {isEnglish ? 'Later' : '나중에'}
              </Button>
            </div>
          </div>
        ) : null}

        {starterCourse ? (
          <button
            type="button"
            className="w-full rounded-2xl border border-[#1d8fff]/20 bg-[#1d8fff]/8 px-3 py-2 text-left"
            onClick={() => {
              setIsNearbyCourseMarkerVisible(true);
              setSelectionSource('recommended');
              setSelectedCourseId(starterCourse.id);
              focusMapOnCourse(starterCourse.centerLat, starterCourse.centerLng);
              snapPanelTo(PANEL_SNAP_INDEX.MID);
            }}
          >
            <p className="text-[11px] font-semibold text-[#0f5fd7]">
              {isEnglish ? 'Recommended first collect' : '첫 수집 추천 코스'}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-slate-900">{starterCourse.title}</p>
            <p className="mt-1 text-[11px] text-slate-600">
              {starterCourse.totalDistance.toFixed(1)}km · {difficultyLabel(starterCourse.difficulty)}
            </p>
          </button>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{isEnglish ? 'Course List' : '코스 목록'}</p>
            <p className="truncate text-xs text-slate-500">{courses?.courses.length ?? 0}{isEnglish ? ' courses' : '개 코스'}</p>
          </div>
        </div>
        <CourseSortSelect
          value={listSort}
          isEnglish={isEnglish}
          className="rg-touch h-11 w-full rounded-full border border-white/70 bg-white/90 px-3 text-xs text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
          onChange={setListSort}
        />
        {canRenderMapPanelAd ? (
          <AdSlot className="pointer-events-none touch-none rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
        ) : null}
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
          {mapPanelCourses.map((course, index) => (
            <div key={course.id} className="space-y-3">
              <MapCourseCard
                id={course.id}
                title={course.title}
                totalDistance={course.totalDistance}
                estimatedTime={course.estimatedTime}
                likeCount={getLikeState(course.id, course.likeCount).likeCount}
                centerLat={course.centerLat}
                centerLng={course.centerLng}
                previewUrl={course.previewUrl}
                difficulty={course.difficulty}
                isSelected={selectedCourseId === course.id}
                isEnglish={isEnglish}
                difficultyText={difficultyLabel(course.difficulty)}
                distanceText={getDistanceLabel(course.centerLat, course.centerLng)}
                isLiked={getLikeState(course.id, course.likeCount).isLiked}
                onSelect={handleMapListCourseSelect}
                onToggleLike={handleToggleLike}
              />
              {index === 5 && canRenderMapPanelAd ? (
                <AdSlot className="pointer-events-none touch-none rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );

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

      <main className="rg-page-main min-h-0 flex-1 overflow-hidden p-0">
        {viewMode === 'map' ? (
          <div className="relative h-full w-full overflow-hidden bg-white/80">
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
              aria-label={locationButtonAriaLabel}
              className={`${LOCATION_FAB_BASE_CLASS} !z-[29] ${locationButtonModeClass} ${locationButtonTransitionClass}`}
              style={{ bottom: getLocationFabBottom(locationButtonBottom) }}
              onClick={moveToCurrentLocation}
            >
              <LocateFixed className="h-5 w-5" />
            </button>

            {isMarkerButtonVisible ? (
            <div className="fixed left-1/2 z-[85] -translate-x-1/2" style={{ top: 'max(env(safe-area-inset-top), 0.75rem)' }}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rg-touch h-9 rounded-full border-white/80 bg-white/95 px-3 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
                onClick={() => syncMarkerViewport()}
              >
                <MapPin className="mr-1 h-3.5 w-3.5" />
                {isEnglish ? 'Show Here Markers' : '현지도에서 마커보기'}
              </Button>
            </div>
            ) : null}

            {isOnboardingHintVisible ? (
              <div className="fixed left-3 right-3 z-[86] top-[calc(max(env(safe-area-inset-top),0.75rem)+2.75rem)] rounded-2xl border border-[#1d8fff]/20 bg-white/95 px-3 py-2 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-700">
                    {isEnglish
                      ? 'Tap a nearby course, then start your first run.'
                      : '가까운 코스를 눌러 첫 러닝을 바로 시작해보세요.'}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-2 text-[11px]"
                      onClick={() => setIsOnboardingOpen(true)}
                    >
                      {isEnglish ? 'Guide' : '가이드'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-2 text-[11px] text-slate-500"
                      onClick={closeOnboarding}
                    >
                      {isEnglish ? 'Close' : '닫기'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedCourse && (
              <div
                className="absolute left-3 right-3 z-20"
                style={{ bottom: `calc(${panelHeight + 12}px + ${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}
              >
                <div className="mb-2 rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.6)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-900">{selectedCourse.title}</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-100/90"
                      onClick={() => handleToggleLike(selectedCourse.id, selectedCourse.likeCount)}
                      aria-label={isEnglish ? 'Toggle like' : '좋아요 토글'}
                    >
                      <Heart className={`h-3.5 w-3.5 ${selectedCourseLikeState?.isLiked ? 'fill-[#ff5a36] text-[#ff5a36]' : ''}`} />
                      <span>{selectedCourseLikeState?.likeCount ?? selectedCourse.likeCount}</span>
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-slate-100/80 px-2 py-1">
                      {isEnglish ? 'From me' : '내 위치'} {getDistanceLabel(selectedCourse.centerLat, selectedCourse.centerLng)}
                    </span>
                    <span className="rounded-full bg-slate-100/80 px-2 py-1">
                      {selectedCourse.totalDistance.toFixed(1)}km
                    </span>
                    <Badge className={`${difficultyColors[selectedCourse.difficulty]} rounded-full text-[10px]`}>
                      {difficultyLabel(selectedCourse.difficulty)}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="rg-touch w-full h-12 rounded-2xl"
                  onClick={() => {
                    trackEvent('run_start_clicked', {
                      course_id: selectedCourse.id,
                      source: 'home_map',
                      is_authed: sessionStatus === 'authenticated',
                    });
                    if (sessionStatus !== 'authenticated') {
                      router.push(`/login?callbackUrl=${encodeURIComponent(`/run?courseId=${selectedCourse.id}`)}`);
                      return;
                    }
                    router.push(`/run?courseId=${selectedCourse.id}`);
                  }}
                >
                  {isEnglish ? 'Start Run With This Course' : '이 코스로 러닝 시작'}
                </Button>
              </div>
            )}

            <section
              ref={panelSectionRef}
              className="fixed inset-x-0 z-30 !bottom-[calc(74px+env(safe-area-inset-bottom))] flex flex-col rounded-t-3xl border-t border-white/70 bg-white/95 backdrop-blur-md shadow-[0_-16px_34px_-24px_rgba(15,23,42,0.55)]"
              style={{
                height: panelHeight,
                maxHeight: '90dvh',
                transition: isPanelDragging ? 'none' : 'height 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                willChange: 'height',
              }}
            >
              <button
                type="button"
                aria-label={isEnglish ? 'Adjust list panel height' : '목록 패널 높이 조절'}
                className="touch-none flex w-full items-center justify-center py-3"
                onPointerDown={onPanelHandlePointerDown}
                onPointerMove={onPanelHandlePointerMove}
                onPointerUp={onPanelHandlePointerEnd}
                onPointerCancel={onPanelHandlePointerEnd}
              >
                <span className="h-2 w-14 rounded-full bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300" />
              </button>
              <div className="min-h-0 flex-1 overflow-hidden">
                {panelScrollableContent}
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
              <Button className="rg-touch rg-press mt-4 rounded-full shadow-md shadow-[#1d8fff]/35">{isEnglish ? 'Create First Course' : '첫 코스 만들기'}</Button>
              </Link>
            </div>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <CourseSortSelect
                value={listSort}
                isEnglish={isEnglish}
                className="rg-touch h-11 rounded-full border border-white/70 bg-white/90 px-3 text-sm text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
                onChange={setListSort}
              />
            </div>
            {listSort === 'NEAREST' && locationError && (
              <p className="text-sm text-slate-500">{locationError}</p>
            )}
            <div className="rg-stagger space-y-4">
              {courses.courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`}>
                <Card className={`rg-interactive-card rounded-[26px] border bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)] overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5 ${
                  getLikeState(course.id, course.likeCount).isLiked ? 'border-[#ffb020]/40 ring-1 ring-[#ffb020]/25' : 'border-white/70'
                }`}>
                  <div className="relative h-40 bg-gradient-to-br from-[#e5f3ff] via-white to-[#f2fbe8] flex items-center justify-center">
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
                      <span
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100/90"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleToggleLike(course.id, course.likeCount);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            handleToggleLike(course.id, course.likeCount);
                          }
                        }}
                        aria-label={isEnglish ? 'Toggle like' : '좋아요 토글'}
                      >
                        <Heart className={`w-4 h-4 ${getLikeState(course.id, course.likeCount).isLiked ? 'fill-[#ff5a36] text-[#ff5a36]' : ''}`} />
                        <span>{getLikeState(course.id, course.likeCount).likeCount}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <Badge className={`${difficultyColors[course.difficulty]} rounded-full`}>
                        {difficultyLabel(course.difficulty)}
                      </Badge>
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
