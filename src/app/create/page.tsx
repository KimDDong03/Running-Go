'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronLeft, ChevronUp, LocateFixed, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadMapSdk, type MapLike, type MapMarkerLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';
import { createCurrentLocationMarkerElement } from '@/lib/current-location-marker';
import { LOCATION_FAB_BASE_CLASS, LOCATION_FAB_TRANSITION_CLASS, getLocationFabBottom } from '@/lib/map-controls';
import { trackEvent } from '@/lib/analytics';

interface Waypoint {
  lat: number;
  lng: number;
  order: number;
}

const MAX_WAYPOINT_COUNT = 30;
const MAX_PERSIST_WAYPOINT_COUNT = 220;
const CREATE_MARKER_HELP_STORAGE_KEY = 'running-go:create-marker-help:v1';
const MAP_VIEWPORT_STORAGE_KEY = 'running-go:map-viewport:v1';
const DRAW_POINT_SAMPLE_COUNT = 16;
const DRAW_POINT_MIN_DISTANCE_M = 12;

const readStoredMapViewport = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(MAP_VIEWPORT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; zoom?: number };
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number' || typeof parsed.zoom !== 'number') {
      return null;
    }
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      zoom: parsed.zoom,
    };
  } catch {
    return null;
  }
};

const hasCoord = (value: unknown): value is { coord: { lat: () => number; lng: () => number } } => {
  if (!value || typeof value !== 'object') return false;
  if (!('coord' in value)) return false;
  const coord = (value as { coord?: unknown }).coord;
  if (!coord || typeof coord !== 'object') return false;
  return typeof (coord as { lat?: unknown }).lat === 'function' && typeof (coord as { lng?: unknown }).lng === 'function';
};

export default function CreateCoursePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const map = useRef<MapLike | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const routeCoordinatesRef = useRef<[number, number][]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [segments, setSegments] = useState<{ coords: [number, number][]; distanceKm: number }[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'click' | 'draw'>('click');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMarkerHelpVisible, setIsMarkerHelpVisible] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  const waypointMarkersRef = useRef<{ marker: MapMarkerLike; dragStartListener: object | null; dragEndListener: object | null }[]>([]);
  const mapClickListenerRef = useRef<object | null>(null);
  const routeOutlinePolylineRef = useRef<MapPolylineLike | null>(null);
  const routeMainPolylineRef = useRef<MapPolylineLike | null>(null);
  const drawOutlinePolylineRef = useRef<MapPolylineLike | null>(null);
  const drawMainPolylineRef = useRef<MapPolylineLike | null>(null);

  const waypointsRef = useRef<Waypoint[]>([]);
  const isRoutingRef = useRef(false);
  const inputModeRef = useRef<'click' | 'draw'>('click');
  const isDrawingRef = useRef(false);
  const drawPointsRef = useRef<{ lat: number; lng: number }[]>([]);
  const addWaypointRef = useRef<(lat: number, lng: number) => void>(() => undefined);
  const segmentsRef = useRef<{ coords: [number, number][]; distanceKm: number }[]>([]);
  const mapLoadedRef = useRef(false);
  const currentLocationMarkerRef = useRef<MapMarkerLike | null>(null);
  const currentLocationMarkerImageRef = useRef<string | null>(null);
  const lastDirectionsWarningRef = useRef(0);
  const isAppliedRouteEditableRef = useRef(false);
  const suppressMarkerClickRef = useRef(false);
  const mapDrawListenersRef = useRef<object[]>([]);
  const hasTrackedWaypointGoalRef = useRef(false);
  const previousInputModeRef = useRef<'click' | 'draw'>('click');
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { locale } = useLocale();
  const { data: profileSummary } = trpc.profile.summary.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  });
  const isEnglish = locale === 'en';

  const setAppliedRouteEditable = useCallback((value: boolean) => {
    isAppliedRouteEditableRef.current = value;
  }, []);

  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    isRoutingRef.current = isRouting;
  }, [isRouting]);

  useEffect(() => {
    inputModeRef.current = inputMode;
    if (inputMode !== 'draw') {
      isDrawingRef.current = false;
      setIsDrawing(false);
      map.current?.setOptions?.({ draggable: true });
    }
  }, [inputMode]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.innerWidth < 768) {
      setIsPanelExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (inputMode === 'draw') {
      setIsPanelExpanded(false);
    }
  }, [inputMode]);

  const dismissMarkerHelp = useCallback(() => {
    setIsMarkerHelpVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CREATE_MARKER_HELP_STORAGE_KEY, '1');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const hasSeenHelp = window.localStorage.getItem(CREATE_MARKER_HELP_STORAGE_KEY) === '1';
    setIsMarkerHelpVisible(!hasSeenHelp);
  }, []);

  useEffect(() => {
    trackEvent('create_viewed', { locale });
  }, [locale]);

  useEffect(() => {
    const previousMode = previousInputModeRef.current;
    if (previousMode !== inputMode) {
      trackEvent('create_mode_changed', { from: previousMode, to: inputMode });
      previousInputModeRef.current = inputMode;
    }
  }, [inputMode]);

  useEffect(() => {
    if (waypoints.length >= 5 && !hasTrackedWaypointGoalRef.current) {
      hasTrackedWaypointGoalRef.current = true;
      trackEvent('create_waypoint_goal_reached', { waypoint_count: waypoints.length });
    }
    if (waypoints.length < 5) {
      hasTrackedWaypointGoalRef.current = false;
    }
  }, [waypoints.length]);

  const showDirectionsUnavailableWarning = useCallback((message?: string) => {
    const now = Date.now();
    if (now - lastDirectionsWarningRef.current < 1200) {
      return;
    }
    lastDirectionsWarningRef.current = now;
    toast.error(message ?? (isEnglish
      ? 'Unable to compute an auto route. Please try a different point.'
      : '자동 경로를 계산하지 못했습니다. 다른 지점을 선택해 다시 시도해주세요'));
  }, [isEnglish]);

  const distanceMeters = useCallback((p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
    const R = 6371e3;
    const phi1 = p1.lat * Math.PI / 180;
    const phi2 = p2.lat * Math.PI / 180;
    const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
    const deltaLambda = (p2.lng - p1.lng) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }, []);

  const fetchMatchedRoute = useCallback(async (
    points: { lat: number; lng: number }[],
    options?: { silent?: boolean }
  ) => {
    if (points.length < 2) {
      return null;
    }

    try {
      const response = await fetch('/api/routing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile: 'walking', points }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: unknown } | null;
        const errorMessage = typeof errorData?.error === 'string' ? errorData.error : null;
        if (!options?.silent) {
          toast.error(errorMessage ?? (isEnglish ? 'Unable to load an auto route.' : '자동 경로를 가져오지 못했습니다'));
        }
        return null;
      }

      const data = await response.json() as {
        coordinates?: [number, number][];
        distanceKm?: number;
      };
      if (!Array.isArray(data.coordinates) || data.coordinates.length < 2) {
        if (!options?.silent) {
          toast.error(isEnglish ? 'No usable route was found.' : '사용 가능한 경로가 없습니다');
        }
        return null;
      }

      return {
        coordinates: data.coordinates,
        distanceKm: typeof data.distanceKm === 'number' ? data.distanceKm : 0,
      };
    } catch {
      if (!options?.silent) {
        toast.error(isEnglish ? 'Unable to load an auto route.' : '자동 경로를 가져오지 못했습니다');
      }
      return null;
    }
  }, [isEnglish]);

  const sampleRoutePoints = useCallback((coordinates: [number, number][], count: number) => {
    if (coordinates.length === 0 || count <= 0) {
      return [] as { lat: number; lng: number }[];
    }

    const distances: number[] = [0];
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const prev = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
      const next = { lat: coordinates[i][1], lng: coordinates[i][0] };
      total += distanceMeters(prev, next);
      distances.push(total);
    }

    if (total === 0) {
      return [{ lat: coordinates[0][1], lng: coordinates[0][0] }];
    }

    const samples: { lat: number; lng: number }[] = [];
    for (let i = 0; i < count; i++) {
      const target = (total * i) / (count - 1);
      let idx = distances.findIndex((d) => d >= target);
      if (idx === -1) idx = distances.length - 1;
      if (idx === 0) {
        samples.push({ lat: coordinates[0][1], lng: coordinates[0][0] });
        continue;
      }

      const prevDist = distances[idx - 1];
      const nextDist = distances[idx];
      const ratio = nextDist === prevDist ? 0 : (target - prevDist) / (nextDist - prevDist);
      const prevCoord = coordinates[idx - 1];
      const nextCoord = coordinates[idx];
      const lng = prevCoord[0] + (nextCoord[0] - prevCoord[0]) * ratio;
      const lat = prevCoord[1] + (nextCoord[1] - prevCoord[1]) * ratio;
      samples.push({ lat, lng });
    }

    return samples;
  }, [distanceMeters]);

  const buildDenseWaypoints = useCallback((coordinates: [number, number][]) => {
    if (coordinates.length === 0) {
      return [] as Waypoint[];
    }

    const distances: number[] = [0];
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const prev = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
      const next = { lat: coordinates[i][1], lng: coordinates[i][0] };
      total += distanceMeters(prev, next);
      distances.push(total);
    }

    const targetCount = Math.min(MAX_WAYPOINT_COUNT, Math.max(5, Math.floor(total / 45) + 1));
    const sampled = sampleRoutePoints(coordinates, targetCount);
    return sampled.map((point, index) => ({
      lat: point.lat,
      lng: point.lng,
      order: index,
    }));
  }, [distanceMeters, sampleRoutePoints]);

  const buildPersistWaypoints = useCallback((coordinates: [number, number][]) => {
    if (coordinates.length === 0) {
      return [] as Waypoint[];
    }

    const distances: number[] = [0];
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const prev = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
      const next = { lat: coordinates[i][1], lng: coordinates[i][0] };
      total += distanceMeters(prev, next);
      distances.push(total);
    }

    const targetCount = Math.min(MAX_PERSIST_WAYPOINT_COUNT, Math.max(8, Math.floor(total / 18) + 1));
    const sampled = sampleRoutePoints(coordinates, targetCount);
    return sampled.map((point, index) => ({
      lat: point.lat,
      lng: point.lng,
      order: index,
    }));
  }, [distanceMeters, sampleRoutePoints]);

  const calculatePolylineDistanceKm = useCallback((coordinates: [number, number][]) => {
    if (coordinates.length < 2) {
      return 0;
    }

    let totalMeters = 0;
    for (let i = 1; i < coordinates.length; i++) {
      totalMeters += distanceMeters(
        { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] },
        { lat: coordinates[i][1], lng: coordinates[i][0] }
      );
    }

    return totalMeters / 1000;
  }, [distanceMeters]);

  const clearWaypointMarkers = useCallback(() => {
    const sdk = mapSdkRef.current;
    waypointMarkersRef.current.forEach(({ marker, dragStartListener, dragEndListener }) => {
      if (sdk && dragStartListener) {
        sdk.Event.removeListener(dragStartListener);
      }
      if (sdk && dragEndListener) {
        sdk.Event.removeListener(dragEndListener);
      }
      marker.setMap(null);
    });
    waypointMarkersRef.current = [];
  }, []);

  const clearRouteLine = useCallback(() => {
    routeOutlinePolylineRef.current?.setMap(null);
    routeMainPolylineRef.current?.setMap(null);
    routeOutlinePolylineRef.current = null;
    routeMainPolylineRef.current = null;
  }, []);

  const updateRouteLine = useCallback((coordinates: [number, number][]) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance) return;

    if (coordinates.length < 2) {
      clearRouteLine();
      return;
    }

    const path = coordinates.map(([lng, lat]) => new sdk.LatLng(lat, lng));

    if (routeOutlinePolylineRef.current) {
      routeOutlinePolylineRef.current.setPath(path);
    } else {
      routeOutlinePolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#15803d',
        strokeWeight: 8,
        strokeOpacity: 0.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    if (routeMainPolylineRef.current) {
      routeMainPolylineRef.current.setPath(path);
    } else {
      routeMainPolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#15803d',
        strokeWeight: 6,
        strokeOpacity: 0.98,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }
  }, [clearRouteLine]);

  const clearDrawLine = useCallback(() => {
    drawOutlinePolylineRef.current?.setMap(null);
    drawMainPolylineRef.current?.setMap(null);
    drawOutlinePolylineRef.current = null;
    drawMainPolylineRef.current = null;
  }, []);

  useEffect(() => {
    if (inputMode === 'draw') {
      return;
    }
    drawPointsRef.current = [];
    clearDrawLine();
  }, [clearDrawLine, inputMode]);

  const updateDrawLine = useCallback((points: { lat: number; lng: number }[]) => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance) return;

    if (points.length < 2) {
      clearDrawLine();
      return;
    }

    const path = points.map((point) => new sdk.LatLng(point.lat, point.lng));

    if (drawOutlinePolylineRef.current) {
      drawOutlinePolylineRef.current.setPath(path);
    } else {
      drawOutlinePolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#15803d',
        strokeWeight: 7,
        strokeOpacity: 0.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }

    if (drawMainPolylineRef.current) {
      drawMainPolylineRef.current.setPath(path);
    } else {
      drawMainPolylineRef.current = new sdk.Polyline({
        map: mapInstance,
        path,
        strokeColor: '#15803d',
        strokeWeight: 5,
        strokeOpacity: 0.95,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        clickable: false,
      });
    }
  }, [clearDrawLine]);

  const sampleDrawPoints = useCallback((points: { lat: number; lng: number }[]) => {
    if (points.length <= DRAW_POINT_SAMPLE_COUNT) {
      return points;
    }
    const source = points.map((point) => [point.lng, point.lat] as [number, number]);
    const sampled = sampleRoutePoints(source, DRAW_POINT_SAMPLE_COUNT);
    return sampled;
  }, [sampleRoutePoints]);

  const renderWaypointMarkers = useCallback((points: Waypoint[], markerMode: 'manual' | 'applied') => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!sdk || !mapInstance) return;

    clearWaypointMarkers();

    const rebuildRouteFromWaypoints = async (nextWaypoints: Waypoint[]) => {
      setWaypoints(nextWaypoints);

      if (nextWaypoints.length < 2) {
        setSegments([]);
        setTotalDistance(0);
        routeCoordinatesRef.current = nextWaypoints.map((waypoint) => [waypoint.lng, waypoint.lat]);
        updateRouteLine(routeCoordinatesRef.current);
        return;
      }

      setIsRouting(true);
      try {
        const matched = await fetchMatchedRoute(
          nextWaypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
          { silent: true }
        );

        if (matched) {
          routeCoordinatesRef.current = matched.coordinates;
          setSegments([{ coords: matched.coordinates, distanceKm: matched.distanceKm }]);
          setTotalDistance(matched.distanceKm);
          updateRouteLine(matched.coordinates);
          return;
        }

        showDirectionsUnavailableWarning();
      } finally {
        setIsRouting(false);
      }
    };

    points.forEach((point, index) => {
      const markerButton = document.createElement('button');
      markerButton.type = 'button';
      markerButton.className = [
        'h-6 w-6 rounded-full border-2 border-white',
        'bg-sky-500 shadow-md text-white text-[10px] font-semibold',
        'flex items-center justify-center',
      ].join(' ');
      markerButton.textContent = String(index + 1);
      markerButton.title = markerMode === 'applied'
        ? (isEnglish ? 'Click to remove this waypoint and rebuild route' : '클릭하면 이 경유지를 제외하고 경로를 다시 만듭니다')
        : (isEnglish ? 'Click to remove this waypoint' : '클릭하면 이 경유지를 삭제합니다');

      markerButton.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        dismissMarkerHelp();

        if (suppressMarkerClickRef.current) {
          suppressMarkerClickRef.current = false;
          return;
        }

        if (markerMode === 'applied' && !isAppliedRouteEditableRef.current) {
          return;
        }

        if (isRoutingRef.current) {
          return;
        }

        const prev = waypointsRef.current;
        if (index < 0 || index >= prev.length) {
          return;
        }

        const nextWaypoints = prev
          .filter((_, waypointIndex) => waypointIndex !== index)
          .map((waypoint, waypointIndex) => ({ ...waypoint, order: waypointIndex }));

        await rebuildRouteFromWaypoints(nextWaypoints);
        renderWaypointMarkers(nextWaypoints, markerMode);
        trackEvent('marker_removed', {
          marker_mode: markerMode,
          remaining_waypoints: nextWaypoints.length,
        });
      };

      const marker = new sdk.Marker({
        map: mapInstance,
        position: new sdk.LatLng(point.lat, point.lng),
        draggable: true,
        icon: {
          content: markerButton,
          size: new sdk.Size(24, 24),
          anchor: new sdk.Point(12, 12),
        },
      });

      let dragStart: { lat: number; lng: number } | null = null;
      const dragStartListener = sdk.Event.addListener(marker, 'dragstart', () => {
        const start = marker.getPosition?.();
        if (!start) return;
        dragStart = { lat: start.lat(), lng: start.lng() };
      });

      const dragEndListener = sdk.Event.addListener(marker, 'dragend', async () => {
        const current = marker.getPosition?.();
        if (!current) return;
        const movedPoint = { lat: current.lat(), lng: current.lng() };

        if (dragStart && distanceMeters(dragStart, movedPoint) < 3) {
          return;
        }

        suppressMarkerClickRef.current = true;

        if (isRoutingRef.current) {
          if (dragStart) {
            marker.setPosition(new sdk.LatLng(dragStart.lat, dragStart.lng));
          }
          return;
        }

        const prev = waypointsRef.current;
        if (index < 0 || index >= prev.length) {
          if (dragStart) {
            marker.setPosition(new sdk.LatLng(dragStart.lat, dragStart.lng));
          }
          return;
        }

        const nextWaypoints = prev
          .map((waypoint, waypointIndex) => (
            waypointIndex === index
              ? { ...waypoint, lat: movedPoint.lat, lng: movedPoint.lng }
              : waypoint
          ))
          .map((waypoint, waypointIndex) => ({ ...waypoint, order: waypointIndex }));

        await rebuildRouteFromWaypoints(nextWaypoints);
        renderWaypointMarkers(nextWaypoints, markerMode);
      });

      waypointMarkersRef.current.push({ marker, dragStartListener, dragEndListener });
    });
  }, [clearWaypointMarkers, dismissMarkerHelp, distanceMeters, fetchMatchedRoute, isEnglish, showDirectionsUnavailableWarning, updateRouteLine]);

  const applyDrawRoute = useCallback(async () => {
    if (isRoutingRef.current) {
      return;
    }

    const rawPoints = drawPointsRef.current;
    if (rawPoints.length < 2) {
      toast.warning(isEnglish ? 'Draw a line first.' : '라인을 먼저 그려주세요');
      return;
    }

    const sampledPoints = sampleDrawPoints(rawPoints);
    setIsRouting(true);
    isRoutingRef.current = true;

    try {
      const matched = await fetchMatchedRoute(sampledPoints, { silent: true });
      if (!matched) {
        showDirectionsUnavailableWarning();
        return;
      }

      const denseWaypoints = buildDenseWaypoints(matched.coordinates);
      const nextWaypoints = denseWaypoints.length
        ? denseWaypoints
        : matched.coordinates.map(([lng, lat], index) => ({ lat, lng, order: index }));

      setAppliedRouteEditable(true);
      setWaypoints(nextWaypoints);
      setSegments([{ coords: matched.coordinates, distanceKm: matched.distanceKm }]);
      setTotalDistance(matched.distanceKm || calculatePolylineDistanceKm(matched.coordinates));
      routeCoordinatesRef.current = matched.coordinates;
      updateRouteLine(matched.coordinates);
      renderWaypointMarkers(nextWaypoints, 'applied');
      trackEvent('draw_route_applied', {
        waypoint_count: nextWaypoints.length,
        distance_km: Number((matched.distanceKm || calculatePolylineDistanceKm(matched.coordinates)).toFixed(2)),
      });

      drawPointsRef.current = [];
      clearDrawLine();
      setIsDrawing(false);
    } finally {
      setIsRouting(false);
      isRoutingRef.current = false;
    }
  }, [
    buildDenseWaypoints,
    calculatePolylineDistanceKm,
    clearDrawLine,
    fetchMatchedRoute,
    isEnglish,
    renderWaypointMarkers,
    sampleDrawPoints,
    setAppliedRouteEditable,
    showDirectionsUnavailableWarning,
    updateRouteLine,
  ]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return;
    }

    if (!mapContainer.current || map.current) {
      return;
    }

    let isMounted = true;

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !mapContainer.current) return;

        mapSdkRef.current = sdk;
        const storedViewport = readStoredMapViewport();
        const mapInstance = new sdk.Map(mapContainer.current, {
          center: storedViewport
            ? new sdk.LatLng(storedViewport.lat, storedViewport.lng)
            : new sdk.LatLng(37.5665, 126.978),
          zoom: storedViewport ? storedViewport.zoom : 14,
          mapTypeControl: false,
          zoomControl: false,
        });

        map.current = mapInstance;
        mapLoadedRef.current = true;

        mapClickListenerRef.current = sdk.Event.addListener(mapInstance, 'click', (event: unknown) => {
          if (isRoutingRef.current) return;
          if (inputModeRef.current !== 'click') return;
          if (!hasCoord(event)) return;
          void addWaypointRef.current(event.coord.lat(), event.coord.lng());
        });

        const appendDrawPoint = (lat: number, lng: number) => {
          const nextPoint = { lat, lng };
          const prevPoints = drawPointsRef.current;
          if (prevPoints.length === 0) {
            drawPointsRef.current = [nextPoint];
            updateDrawLine(drawPointsRef.current);
            return;
          }

          const last = prevPoints[prevPoints.length - 1];
          if (distanceMeters(last, nextPoint) < DRAW_POINT_MIN_DISTANCE_M) {
            return;
          }

          const next = [...prevPoints, nextPoint];
          drawPointsRef.current = next;
          updateDrawLine(next);
        };

        const startDraw = (event: unknown) => {
          if (inputModeRef.current !== 'draw' || isRoutingRef.current) return;
          if (!hasCoord(event)) return;
          isDrawingRef.current = true;
          setIsDrawing(true);
          mapInstance.setOptions?.({ draggable: false });
          drawPointsRef.current = [{ lat: event.coord.lat(), lng: event.coord.lng() }];
          updateDrawLine(drawPointsRef.current);
        };

        const moveDraw = (event: unknown) => {
          if (!isDrawingRef.current || !hasCoord(event)) return;
          appendDrawPoint(event.coord.lat(), event.coord.lng());
        };

        const endDraw = () => {
          if (!isDrawingRef.current) return;
          isDrawingRef.current = false;
          setIsDrawing(false);
          mapInstance.setOptions?.({ draggable: true });
        };

        mapDrawListenersRef.current = [
          sdk.Event.addListener(mapInstance, 'mousedown', startDraw),
          sdk.Event.addListener(mapInstance, 'mousemove', moveDraw),
          sdk.Event.addListener(mapInstance, 'mouseup', endDraw),
          sdk.Event.addListener(mapInstance, 'touchstart', startDraw),
          sdk.Event.addListener(mapInstance, 'touchmove', moveDraw),
          sdk.Event.addListener(mapInstance, 'touchend', endDraw),
        ];

        if (!storedViewport && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!isMounted) return;
              const center = new sdk.LatLng(position.coords.latitude, position.coords.longitude);
              const markerImage = profileSummary?.user.image ?? null;
              mapInstance.setCenter(center);
              mapInstance.setZoom(14);

              if (!currentLocationMarkerRef.current || currentLocationMarkerImageRef.current !== markerImage) {
                currentLocationMarkerRef.current?.setMap(null);
                currentLocationMarkerRef.current = new sdk.Marker({
                  map: mapInstance,
                  position: center,
                  icon: {
                    content: createCurrentLocationMarkerElement(markerImage, { size: 36 }),
                    size: new sdk.Size(36, 36),
                    anchor: new sdk.Point(18, 18),
                  },
                });
                currentLocationMarkerImageRef.current = markerImage;
              } else {
                currentLocationMarkerRef.current.setPosition(center);
              }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        }

        if (routeCoordinatesRef.current.length >= 2) {
          updateRouteLine(routeCoordinatesRef.current);
        }
      })
      .catch(() => {
        toast.error(isEnglish ? 'Failed to load map.' : '지도를 불러오지 못했습니다');
      });

    return () => {
      isMounted = false;
      const sdk = mapSdkRef.current;
      if (sdk && mapClickListenerRef.current) {
        sdk.Event.removeListener(mapClickListenerRef.current);
        mapClickListenerRef.current = null;
      }
      if (sdk && mapDrawListenersRef.current.length) {
        mapDrawListenersRef.current.forEach((listener) => {
          sdk.Event.removeListener(listener);
        });
        mapDrawListenersRef.current = [];
      }
      clearWaypointMarkers();
      clearRouteLine();
      clearDrawLine();
      currentLocationMarkerRef.current?.setMap(null);
      currentLocationMarkerRef.current = null;
      map.current?.destroy();
      map.current = null;
      mapLoadedRef.current = false;
    };
  }, [clearDrawLine, clearRouteLine, clearWaypointMarkers, distanceMeters, isEnglish, profileSummary?.user.image, sessionStatus, updateDrawLine, updateRouteLine]);

  const buildRouteCoordinates = useCallback((points: Waypoint[], pathSegments: { coords: [number, number][] }[]) => {
    if (points.length === 0) {
      return [];
    }
    if (points.length === 1) {
      const singleCoordinate: [number, number] = [points[0].lng, points[0].lat];
      return [singleCoordinate];
    }

    const combined: [number, number][] = [[points[0].lng, points[0].lat]];
    pathSegments.forEach((segment) => {
      const coords = segment.coords.length > 1 ? segment.coords.slice(1) : segment.coords;
      combined.push(...coords);
    });
    return combined;
  }, []);

  // Add waypoint
  const addWaypoint = useCallback(async (lat: number, lng: number) => {
    if (isRoutingRef.current) {
      return;
    }

    const prev = waypointsRef.current;
    if (prev.length >= MAX_WAYPOINT_COUNT) {
      toast.warning(isEnglish
        ? `You can add up to ${MAX_WAYPOINT_COUNT} waypoints.`
        : `최대 ${MAX_WAYPOINT_COUNT}개의 경유지만 추가할 수 있습니다`);
      return;
    }

    const newWaypoint: Waypoint = { lat, lng, order: prev.length };

    if (prev.length === 0) {
      setAppliedRouteEditable(false);
      setWaypoints([newWaypoint]);
      setSegments([]);
      setTotalDistance(0);
      const nextCoordinates: [number, number][] = [[lng, lat]];
      routeCoordinatesRef.current = nextCoordinates;
      if (mapLoadedRef.current) {
        updateRouteLine(nextCoordinates);
      }
      renderWaypointMarkers([newWaypoint], 'manual');
      trackEvent('marker_added', {
        input_mode: inputModeRef.current,
        waypoint_count: 1,
      });
      return;
    }

    const candidate = { lat, lng };

    setAppliedRouteEditable(false);
    setIsRouting(true);
    isRoutingRef.current = true;

    try {
      const last = prev[prev.length - 1];
      const matched = await fetchMatchedRoute(
        [
          { lat: last.lat, lng: last.lng },
          { lat: candidate.lat, lng: candidate.lng },
        ],
        { silent: true }
      );

      if (!matched) {
        showDirectionsUnavailableWarning();
        return;
      }

      const nextSegments: { coords: [number, number][]; distanceKm: number }[] = [
        ...segmentsRef.current,
        {
          coords: matched.coordinates,
          distanceKm: matched.distanceKm,
        },
      ];

      const nextWaypoints = [...prev, newWaypoint];
      const nextCoordinates = buildRouteCoordinates(nextWaypoints, nextSegments);

      setWaypoints(nextWaypoints);
      setSegments(nextSegments);
      setTotalDistance(nextSegments.reduce((sum, segment) => sum + segment.distanceKm, 0));
      routeCoordinatesRef.current = nextCoordinates;

      if (mapLoadedRef.current) {
        updateRouteLine(nextCoordinates);
      }

      renderWaypointMarkers(nextWaypoints, 'manual');
      trackEvent('marker_added', {
        input_mode: inputModeRef.current,
        waypoint_count: nextWaypoints.length,
      });
    } finally {
      setIsRouting(false);
      isRoutingRef.current = false;
    }
  }, [buildRouteCoordinates, fetchMatchedRoute, isEnglish, renderWaypointMarkers, setAppliedRouteEditable, showDirectionsUnavailableWarning, updateRouteLine]);

  useEffect(() => {
    addWaypointRef.current = addWaypoint;
  }, [addWaypoint]);

  const undoLastWaypoint = () => {
    if (isRoutingRef.current) {
      return;
    }


    const prev = waypointsRef.current;
    if (prev.length === 0) {
      return;
    }

    const nextWaypoints = prev.slice(0, -1);
    setWaypoints(nextWaypoints);

    setAppliedRouteEditable(false);

    if (segmentsRef.current.length > 0) {
      const lastSegment = segmentsRef.current[segmentsRef.current.length - 1];
      const nextSegments = segmentsRef.current.slice(0, -1);
      setSegments(nextSegments);
      setTotalDistance((d) => Math.max(0, d - lastSegment.distanceKm));
      const nextCoordinates = buildRouteCoordinates(nextWaypoints, nextSegments);
      routeCoordinatesRef.current = nextCoordinates;
      if (mapLoadedRef.current) {
        updateRouteLine(nextCoordinates);
      }
    } else {
      setTotalDistance(0);
      setSegments([]);
      routeCoordinatesRef.current = nextWaypoints.length
        ? [[nextWaypoints[0].lng, nextWaypoints[0].lat]]
        : [];
      if (mapLoadedRef.current) {
        updateRouteLine(routeCoordinatesRef.current);
      }
    }

    renderWaypointMarkers(nextWaypoints, 'manual');
  };

  // Clear all waypoints
  const clearWaypoints = () => {
    setWaypoints([]);
    setAppliedRouteEditable(false);
    setTotalDistance(0);
    routeCoordinatesRef.current = [];
    drawPointsRef.current = [];
    setIsRouting(false);
    setIsDrawing(false);
    setSegments([]);
    
    // Remove markers
    clearWaypointMarkers();

    // Remove line
    clearRouteLine();
    clearDrawLine();
  };

  const moveToCurrentLocation = () => {
    const sdk = mapSdkRef.current;
    const mapInstance = map.current;
    if (!navigator.geolocation) {
      toast.error(isEnglish ? 'Unable to access current location.' : '현재 위치를 가져올 수 없습니다');
      return;
    }

    if (!sdk || !mapInstance) {
      toast.error(isEnglish ? 'Map is still loading.' : '지도를 불러오는 중입니다');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = new sdk.LatLng(position.coords.latitude, position.coords.longitude);
        const markerImage = profileSummary?.user.image ?? null;

        mapInstance.setCenter(center);
        mapInstance.setZoom(16);

        if (!currentLocationMarkerRef.current || currentLocationMarkerImageRef.current !== markerImage) {
          currentLocationMarkerRef.current?.setMap(null);
          currentLocationMarkerRef.current = new sdk.Marker({
            map: mapInstance,
            position: center,
            icon: {
              content: createCurrentLocationMarkerElement(markerImage, { size: 36 }),
              size: new sdk.Size(36, 36),
              anchor: new sdk.Point(18, 18),
            },
          });
          currentLocationMarkerImageRef.current = markerImage;
        } else {
          currentLocationMarkerRef.current.setPosition(center);
        }

        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast.error(isEnglish
          ? 'Allow location permission to move to your current position.'
          : '위치 권한을 허용하면 현재 위치로 이동할 수 있어요');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };
  const isValid = waypoints.length >= 5 && waypoints.length <= 30;

  const proceedToDetails = useCallback(() => {
    const routeCoordinates = routeCoordinatesRef.current;
    const persistedWaypoints = routeCoordinates.length >= 2
      ? buildPersistWaypoints(routeCoordinates)
      : waypoints;
    const payload = {
      waypoints: persistedWaypoints.length ? persistedWaypoints : waypoints,
      totalDistance,
    };
    sessionStorage.setItem('courseDraft', JSON.stringify(payload));
    trackEvent('course_save_initiated', {
      waypoint_count: payload.waypoints.length,
      distance_km: Number(totalDistance.toFixed(2)),
      input_mode: inputMode,
    });
    router.push('/create/details');
  }, [buildPersistWaypoints, inputMode, router, totalDistance, waypoints]);

  if (sessionStatus === 'loading') {
    return (
      <div className="rg-page flex items-center justify-center p-6">
        <p className="text-slate-500">{isEnglish ? 'Checking login status...' : '로그인 상태를 확인하는 중...'}</p>
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="rg-page flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
          <CardContent className="p-6 text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">{isEnglish ? 'Sign in to create a course' : '로그인 후 코스를 만들 수 있어요'}</h1>
          <p className="text-sm text-slate-600">{isEnglish ? 'Only signed-in users can create courses so creator ownership stays accurate.' : '코스 작성자를 정확히 관리하기 위해 로그인 사용자만 코스를 제작할 수 있습니다.'}</p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/">
            <Button variant="outline" className="rg-touch rounded-full">{isEnglish ? 'Home' : '홈으로'}</Button>
              </Link>
              <Link href="/login">
            <Button className="rg-touch rounded-full">{isEnglish ? 'Sign in' : '로그인'}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="rg-page-header px-4 py-4 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rg-touch-icon rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">{isEnglish ? 'Create Course' : '코스 제작'}</h1>
            <span className="text-xs text-slate-500">{isEnglish ? 'Step 1/2' : '1/2 단계'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rg-touch-icon rg-press rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
            onClick={undoLastWaypoint}
            disabled={waypoints.length === 0 || isRouting}
            aria-label={isEnglish ? 'Go back' : '이전 단계로 되돌리기'}
            title={isEnglish ? 'Back' : '이전'}
          >
            <Undo2 className="w-5 h-5" />
          </Button>
          <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rg-touch-icon rg-press rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
                disabled={waypoints.length === 0 || isRouting}
            aria-label={isEnglish ? 'Reset current route' : '현재 경로 초기화'}
            title={isEnglish ? 'Reset' : '초기화'}
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
              <DialogHeader>
              <DialogTitle className="text-slate-900">{isEnglish ? 'Reset route?' : '경로를 초기화할까요?'}</DialogTitle>
                <DialogDescription className="text-slate-600">
                {isEnglish
                  ? 'All added markers and route paths will be removed. This action cannot be undone.'
                  : '현재 추가한 마커와 동선이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setIsClearDialogOpen(false)}
                >
                {isEnglish ? 'Cancel' : '취소'}
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  onClick={() => {
                    clearWaypoints();
                    setIsClearDialogOpen(false);
                  }}
                >
                {isEnglish ? 'Reset' : '초기화'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Map */}
      <div className="adsense-excluded-area flex-1 relative" data-adsense-excluded="true">
        <div ref={mapContainer} className="adsense-excluded-area w-full h-full" data-adsense-excluded="true" />

        <Button
          type="button"
          variant="ghost"
          aria-label={isEnglish ? 'Move to my current location' : '내 현재 위치로 이동'}
          className={`${LOCATION_FAB_BASE_CLASS} ${LOCATION_FAB_TRANSITION_CLASS}`}
          style={{ bottom: getLocationFabBottom(24) }}
          onClick={moveToCurrentLocation}
          disabled={isLocating}
        >
          <LocateFixed className="h-5 w-5" />
        </Button>
        
        {/* Instructions */}
          <div className="pointer-events-none absolute top-4 left-4 right-4 rg-soft-panel p-4">
            <p className="text-sm text-slate-600 text-center">
              {isRouting
                ? (isEnglish ? 'Calculating walking route...' : '보행 경로를 계산 중입니다')
                : inputMode === 'draw'
                  ? isDrawing
                    ? (isEnglish ? 'Drawing line...' : '라인을 그리는 중입니다')
                    : (isEnglish ? 'Draw a line, then tap Apply Route.' : '라인을 그린 뒤 경로 적용 버튼을 눌러주세요')
                  : (isEnglish ? 'Tap map to add points or apply a preset.' : '지도를 터치하거나 프리셋을 적용하세요')}
            </p>
          </div>

          {isMarkerHelpVisible && waypoints.length > 0 && (
            <div className="absolute top-20 left-4 right-4 rounded-2xl border border-amber-200/80 bg-amber-50/95 px-4 py-3 text-xs text-amber-900 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="leading-5">
                  {isEnglish
                    ? 'Tip: tap any marker to remove it and rebuild the route.'
                    : '팁: 마커를 탭하면 해당 지점을 삭제하고 경로를 다시 계산합니다.'}
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800"
                  onClick={dismissMarkerHelp}
                >
                  {isEnglish ? 'Got it' : '알겠어요'}
                </button>
              </div>
            </div>
          )}
      </div>

      {/* Bottom Panel */}
      <Card className="m-4 rounded-3xl shadow-xl">
        <CardContent className={`${isPanelExpanded ? 'p-6' : 'p-4'} space-y-4`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              {isEnglish ? 'Controls' : '컨트롤'}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2 text-xs text-slate-600"
              onClick={() => setIsPanelExpanded((prev) => !prev)}
            >
              {isPanelExpanded
                ? (isEnglish ? 'Collapse' : '접기')
                : (isEnglish ? 'Expand' : '펼치기')}
              {isPanelExpanded ? <ChevronDown className="ml-1 h-3.5 w-3.5" /> : <ChevronUp className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={inputMode === 'click' ? 'default' : 'outline'}
              className="rounded-2xl"
              onClick={() => {
                setInputMode('click');
              }}
            >
              {isEnglish ? 'Click Mode' : '클릭 추가'}
            </Button>
            <Button
              type="button"
              variant={inputMode === 'draw' ? 'default' : 'outline'}
              className="rounded-2xl"
              onClick={() => {
                setInputMode('draw');
              }}
            >
              {isEnglish ? 'Draw Mode' : '라인 드로잉'}
            </Button>
          </div>

          {inputMode === 'draw' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  drawPointsRef.current = [];
                  clearDrawLine();
                  setIsDrawing(false);
                }}
              >
                {isEnglish ? 'Clear Drawing' : '드로잉 초기화'}
              </Button>
              <Button
                type="button"
                className="rounded-2xl"
                disabled={isRouting || drawPointsRef.current.length < 2}
                onClick={() => {
                  void applyDrawRoute();
                }}
              >
                {isEnglish ? 'Apply Route' : '경로로 적용'}
              </Button>
            </div>
          )}

          {isPanelExpanded && (
            <>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-slate-600">Waypoint</p>
                  <p className="text-2xl font-bold text-primary">
                    {waypoints.length}<span className="text-sm text-slate-400">/{MAX_WAYPOINT_COUNT}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600">{isEnglish ? 'Estimated Distance' : '예상 거리'}</p>
                  <p className="text-2xl font-bold text-primary">
                    {totalDistance.toFixed(2)}<span className="text-sm text-slate-400">km</span>
                  </p>
                </div>
              </div>

              {waypoints.length < 5 && (
                <p className="text-sm text-orange-500 text-center">
                  {isEnglish ? 'At least 5 waypoints are required.' : '최소 5개의 waypoint가 필요합니다'}
                </p>
              )}

              <Button
                size="lg"
                className="rg-touch w-full h-14 text-lg rounded-2xl"
                disabled={!isValid}
                onClick={proceedToDetails}
              >
                {isEnglish ? 'Next Step →' : '다음 단계로 →'}
              </Button>
            </>
          )}

          {!isPanelExpanded && (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                <span>
                  Waypoint {waypoints.length}/{MAX_WAYPOINT_COUNT}
                </span>
                <span>{totalDistance.toFixed(2)}km</span>
              </div>
              <Button
                size="sm"
                className="rg-touch w-full rounded-xl"
                disabled={!isValid}
                onClick={proceedToDetails}
              >
                {isEnglish ? 'Next Step' : '다음 단계'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
