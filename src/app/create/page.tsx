'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
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
import { ChevronLeft, LocateFixed, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyKoreanMapLabels, applyRoadVisualStyle, NAVER_LIKE_MAP_STYLE } from '@/lib/map-style';
import { createCurrentLocationMarkerElement } from '@/lib/current-location-marker';
import { LOCATION_FAB_BASE_CLASS, LOCATION_FAB_TRANSITION_CLASS, getLocationFabBottom } from '@/lib/map-controls';

interface Waypoint {
  lat: number;
  lng: number;
  order: number;
}

const ALLOWED_DRAW_CLASSES = new Set([
  'path',
  'pedestrian',
  'footway',
  'sidewalk',
  'crossing',
  'steps',
  'living_street',
  'cycleway',
  'unclassified',
  'residential',
  'service',
  'track',
  'street',
  'road',
  'minor',
  'tertiary',
  'secondary',
  'primary',
]);

const ROAD_LAYER_INCLUDE_KEYWORDS = [
  'road',
  'street',
  'path',
  'walk',
  'sidewalk',
  'pedestrian',
  'footway',
  'cycleway',
  'living',
  'residential',
  'service',
  'track',
  'tertiary',
  'secondary',
  'primary',
];

const ROAD_LAYER_EXCLUDE_KEYWORDS = [
  'rail',
  'transit',
  'ferry',
  'aeroway',
  'runway',
  'motorway',
  'trunk',
  'water',
  'building',
  'landuse',
  'boundary',
  'admin',
];

const isRoadFeature = (feature: maplibregl.MapGeoJSONFeature) => {
  const layerType = feature.layer?.type;
  if (layerType !== 'line') {
    return false;
  }

  const layerId = typeof feature.layer?.id === 'string' ? feature.layer.id.toLowerCase() : '';
  if (ROAD_LAYER_EXCLUDE_KEYWORDS.some((keyword) => layerId.includes(keyword))) {
    return false;
  }

  const clazz = typeof feature.properties?.class === 'string'
    ? feature.properties.class.toLowerCase()
    : undefined;

  if (clazz && ALLOWED_DRAW_CLASSES.has(clazz)) {
    return true;
  }

  const sourceLayer = typeof feature.sourceLayer === 'string' ? feature.sourceLayer.toLowerCase() : '';
  if (sourceLayer.includes('road')) {
    return true;
  }

  return ROAD_LAYER_INCLUDE_KEYWORDS.some((keyword) => layerId.includes(keyword));
};

const isRoadPoint = (mapInstance: maplibregl.Map, point: maplibregl.PointLike) => {
  const features = mapInstance.queryRenderedFeatures(point);
  if (features.length === 0) {
    return true;
  }
  return features.some((feature) => isRoadFeature(feature));
};

export default function CreateCoursePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const routeCoordinatesRef = useRef<[number, number][]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [segments, setSegments] = useState<{ coords: [number, number][]; distanceKm: number }[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const waypointsRef = useRef<Waypoint[]>([]);
  const isRoutingRef = useRef(false);
  const addWaypointRef = useRef<(lat: number, lng: number) => void>(() => undefined);
  const segmentsRef = useRef<{ coords: [number, number][]; distanceKm: number }[]>([]);
  const mapLoadedRef = useRef(false);
  const drawnRef = useRef<{ lat: number; lng: number }[]>([]);
  const handleDrawRef = useRef<(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => void>(() => undefined);
  const isDrawingRef = useRef(false);
  const lastDrawRef = useRef<{ time: number; lat: number; lng: number } | null>(null);
  const drawRenderRef = useRef<{ rafId: number | null; coords: [number, number][] } | null>(null);
  const drawModeRef = useRef(false);
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const currentLocationMarkerImageRef = useRef<string | null>(null);
  const lastRoadWarningRef = useRef(0);
  const isAppliedRouteEditableRef = useRef(false);
  const suppressMarkerClickRef = useRef(false);
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { data: profileSummary } = trpc.profile.summary.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  });

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
    drawnRef.current = drawnPoints;
  }, [drawnPoints]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  const showRoadOnlyWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastRoadWarningRef.current < 1200) {
      return;
    }
    lastRoadWarningRef.current = now;
    toast.info('도로 위에서만 코스를 만들 수 있어요');
  }, []);

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

  const fetchMatchedRoute = useCallback(async (points: { lat: number; lng: number }[]) => {
    if (points.length < 2) {
      return null;
    }

    const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = new URL(`https://router.project-osrm.org/route/v1/foot/${coordinates}`);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');

    const response = await fetch(url.toString());
    if (!response.ok) {
      toast.error('OSM 보행 경로를 가져오지 못했습니다');
      return null;
    }

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) {
      toast.error('보행 경로가 없습니다');
      return null;
    }

    return {
      coordinates: route.geometry.coordinates as [number, number][],
      distanceKm: route.distance / 1000,
    };
  }, []);

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

    const targetCount = Math.min(400, Math.max(5, Math.floor(total / 8) + 1));
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
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }, []);

  const reduceDrawnPoints = useCallback((points: { lat: number; lng: number }[]) => {
    if (points.length <= 2) return points;
    const reduced: { lat: number; lng: number }[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = reduced[reduced.length - 1];
      const next = points[i];
      if (distanceMeters(prev, next) >= 8) {
        reduced.push(next);
      }
      if (reduced.length >= 60) break;
    }
    if (reduced[reduced.length - 1] !== points[points.length - 1]) {
      reduced.push(points[points.length - 1]);
    }
    return reduced;
  }, [distanceMeters]);

  const clearRouteLine = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (map.current.getLayer('route-main')) {
      map.current.removeLayer('route-main');
    }
    if (map.current.getLayer('route-outline')) {
      map.current.removeLayer('route-outline');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }
  }, []);

  // Update route line on map
  const updateRouteLine = useCallback((coordinates: [number, number][]) => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (coordinates.length < 2) {
      clearRouteLine();
      return;
    }

    const sourceId = 'route';

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    } else {
      map.current.addSource(sourceId, {
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
        id: 'route-outline',
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 8,
          'line-opacity': 0.9,
        },
      });

      map.current.addLayer({
        id: 'route-main',
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 6,
          'line-opacity': 0.98,
        },
      });
    }
  }, [clearRouteLine]);

  const renderWaypointMarkers = useCallback((points: Waypoint[], markerMode: 'manual' | 'applied') => {
    if (!map.current) return;

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
        const matched = await fetchMatchedRoute(nextWaypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })));
        if (matched) {
          routeCoordinatesRef.current = matched.coordinates;
          setSegments([{ coords: matched.coordinates, distanceKm: matched.distanceKm }]);
          setTotalDistance(matched.distanceKm);
          updateRouteLine(matched.coordinates);
          return;
        }

        const fallbackCoordinates = nextWaypoints.map((waypoint) => [waypoint.lng, waypoint.lat]) as [number, number][];
        const fallbackDistanceKm = calculatePolylineDistanceKm(fallbackCoordinates);
        routeCoordinatesRef.current = fallbackCoordinates;
        setSegments([{ coords: fallbackCoordinates, distanceKm: fallbackDistanceKm }]);
        setTotalDistance(fallbackDistanceKm);
        updateRouteLine(fallbackCoordinates);
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
        ? '클릭하면 이 경유지를 제외하고 경로를 다시 만듭니다'
        : '클릭하면 이 경유지를 삭제합니다';

      markerButton.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();

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
      };

      const marker = new maplibregl.Marker({ element: markerButton, anchor: 'center', draggable: true })
        .setLngLat([point.lng, point.lat])
        .addTo(map.current!);

      let dragStart: { lat: number; lng: number } | null = null;
      marker.on('dragstart', () => {
        const start = marker.getLngLat();
        dragStart = { lat: start.lat, lng: start.lng };
      });

      marker.on('dragend', async () => {
        const current = marker.getLngLat();
        const movedPoint = { lat: current.lat, lng: current.lng };
        if (dragStart && distanceMeters(dragStart, movedPoint) < 3) {
          return;
        }

        suppressMarkerClickRef.current = true;

        if (isRoutingRef.current) {
          return;
        }

        const prev = waypointsRef.current;
        if (index < 0 || index >= prev.length) {
          return;
        }

        const nextWaypoints = prev.map((waypoint, waypointIndex) => (
          waypointIndex === index
            ? { ...waypoint, lat: movedPoint.lat, lng: movedPoint.lng }
            : waypoint
        )).map((waypoint, waypointIndex) => ({ ...waypoint, order: waypointIndex }));

        await rebuildRouteFromWaypoints(nextWaypoints);
        renderWaypointMarkers(nextWaypoints, markerMode);
      });

      markersRef.current.push(marker);
    });
  }, [calculatePolylineDistanceKm, clearWaypointMarkers, distanceMeters, fetchMatchedRoute, updateRouteLine]);

  useEffect(() => {
    handleDrawRef.current = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (!drawMode || isRoutingRef.current || !isDrawingRef.current) return;
      if (e.originalEvent?.preventDefault) {
        e.originalEvent.preventDefault();
      }
      const mapInstance = map.current;
      if (!mapInstance) return;

      if (!isRoadPoint(mapInstance, e.point)) {
        return;
      }
      const { lng, lat } = e.lngLat;
      const now = Date.now();
      const last = lastDrawRef.current;
      if (last) {
        if (now - last.time < 80) return;
        if (distanceMeters({ lat: last.lat, lng: last.lng }, { lat, lng }) < 5) return;
      }
      lastDrawRef.current = { time: now, lat, lng };
      const next = [...drawnRef.current, { lat, lng }];
      drawnRef.current = next;
      setDrawnPoints(next);
      if (mapLoadedRef.current) {
        const coords = next.map((p) => [p.lng, p.lat]) as [number, number][];
        if (!drawRenderRef.current) {
          drawRenderRef.current = { rafId: null, coords };
        } else {
          drawRenderRef.current.coords = coords;
        }

        if (!drawRenderRef.current.rafId) {
          drawRenderRef.current.rafId = requestAnimationFrame(() => {
            const pending = drawRenderRef.current;
            if (pending) {
              updateRouteLine(pending.coords);
              pending.rafId = null;
            }
          });
        }
      }
    };
  }, [drawMode, distanceMeters, updateRouteLine]);

  // Initialize map
  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return;
    }

    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: NAVER_LIKE_MAP_STYLE,
      center: [126.978, 37.5665], // Seoul
      zoom: 14,
    });

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (drawModeRef.current) {
        return;
      }

      const mapInstance = map.current;
      if (!mapInstance) {
        return;
      }

      if (!isRoadPoint(mapInstance, e.point)) {
        showRoadOnlyWarning();
        return;
      }

      const { lng, lat } = e.lngLat;
      addWaypointRef.current(lat, lng);
    };

    const applyMapStyle = () => {
      const mapInstance = map.current;
      if (!mapInstance) return;
      applyKoreanMapLabels(mapInstance);
      applyRoadVisualStyle(mapInstance);
    };

    map.current.on('load', () => {
      mapLoadedRef.current = true;
      const mapInstance = map.current;
      applyMapStyle();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const center = [position.coords.longitude, position.coords.latitude] as [number, number];
            const markerImage = profileSummary?.user.image ?? null;
            mapInstance?.setCenter(center);
            if (mapInstance) {
              if (!currentLocationMarkerRef.current || currentLocationMarkerImageRef.current !== markerImage) {
                currentLocationMarkerRef.current?.remove();
                currentLocationMarkerRef.current = new maplibregl.Marker({ element: createCurrentLocationMarkerElement(markerImage), anchor: 'center' })
                  .setLngLat(center)
                  .addTo(mapInstance);
                currentLocationMarkerImageRef.current = markerImage;
              } else {
                currentLocationMarkerRef.current.setLngLat(center);
              }
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
      map.current?.on('click', handleClick);
      if (routeCoordinatesRef.current.length >= 2) {
        updateRouteLine(routeCoordinatesRef.current);
      }
    });

    return () => {
      map.current?.off('click', handleClick);
      map.current?.remove();
    };
  }, [profileSummary?.user.image, sessionStatus, showRoadOnlyWarning, updateRouteLine]);

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
    if (prev.length >= 30) {
      toast.warning('최대 30개의 경유지만 추가할 수 있습니다');
      return;
    }

    const newWaypoint: Waypoint = { lat, lng, order: prev.length };

    if (prev.length === 0) {
      setAppliedRouteEditable(false);
      setWaypoints([newWaypoint]);
      setSegments([]);
      const nextCoordinates: [number, number][] = [[lng, lat]];
      routeCoordinatesRef.current = nextCoordinates;
      if (mapLoadedRef.current) {
        updateRouteLine(nextCoordinates);
      }
      renderWaypointMarkers([newWaypoint], 'manual');
      return;
    }

    setAppliedRouteEditable(false);
    setWaypoints([...prev, newWaypoint]);
    setIsRouting(true);
    isRoutingRef.current = true;

    try {
      const lastCoordinate: [number, number] = [prev[prev.length - 1].lng, prev[prev.length - 1].lat];
      const newCoordinate: [number, number] = [newWaypoint.lng, newWaypoint.lat];
      const matched = await fetchMatchedRoute([
        { lat: prev[prev.length - 1].lat, lng: prev[prev.length - 1].lng },
        { lat: newWaypoint.lat, lng: newWaypoint.lng },
      ]);

      const segmentCoordinates = matched?.coordinates?.length
        ? matched.coordinates
        : [lastCoordinate, newCoordinate];
      const segmentDistanceKm = matched?.distanceKm
        ?? (distanceMeters(prev[prev.length - 1], newWaypoint) / 1000);

      const nextSegments: { coords: [number, number][]; distanceKm: number }[] = [
        ...segmentsRef.current,
        {
          coords: segmentCoordinates,
          distanceKm: segmentDistanceKm,
        },
      ];
      setSegments(nextSegments);
      setTotalDistance((d) => d + segmentDistanceKm);

      const nextWaypoints = [...prev, newWaypoint];
      const nextCoordinates = buildRouteCoordinates(nextWaypoints, nextSegments);
      routeCoordinatesRef.current = nextCoordinates;
      if (mapLoadedRef.current) {
        updateRouteLine(nextCoordinates);
      }

      renderWaypointMarkers(nextWaypoints, 'manual');
    } finally {
      setIsRouting(false);
      isRoutingRef.current = false;
    }
  }, [buildRouteCoordinates, distanceMeters, fetchMatchedRoute, renderWaypointMarkers, updateRouteLine]);

  useEffect(() => {
    addWaypointRef.current = addWaypoint;
  }, [addWaypoint]);

  useEffect(() => {
    if (!map.current) return;
    const handleMouseDown = () => {
      if (!drawMode || isRoutingRef.current) return;
      isDrawingRef.current = true;
      map.current?.dragPan.disable();
    };

    const handleMouseUp = () => {
      isDrawingRef.current = false;
      map.current?.dragPan.enable();
      if (mapLoadedRef.current && drawnRef.current.length >= 2) {
        updateRouteLine(drawnRef.current.map((point) => [point.lng, point.lat]));
      }
    };

    const handleTouchStart = () => {
      if (!drawMode || isRoutingRef.current) return;
      isDrawingRef.current = true;
      map.current?.dragPan.disable();
    };

    const handleTouchEnd = () => {
      isDrawingRef.current = false;
      map.current?.dragPan.enable();
      if (mapLoadedRef.current && drawnRef.current.length >= 2) {
        updateRouteLine(drawnRef.current.map((point) => [point.lng, point.lat]));
      }
    };

    if (drawMode) {
      map.current.on('mousedown', handleMouseDown);
      map.current.on('mouseup', handleMouseUp);
      map.current.on('mouseleave', handleMouseUp);
      map.current.on('mousemove', handleDrawRef.current);
      map.current.on('touchstart', handleTouchStart);
      map.current.on('touchend', handleTouchEnd);
      map.current.on('touchcancel', handleTouchEnd);
      map.current.on('touchmove', handleDrawRef.current);
    } else {
      map.current.off('mousedown', handleMouseDown);
      map.current.off('mouseup', handleMouseUp);
      map.current.off('mouseleave', handleMouseUp);
      map.current.off('mousemove', handleDrawRef.current);
      map.current.off('touchstart', handleTouchStart);
      map.current.off('touchend', handleTouchEnd);
      map.current.off('touchcancel', handleTouchEnd);
      map.current.off('touchmove', handleDrawRef.current);
      isDrawingRef.current = false;
      map.current.dragPan.enable();
    }

    return () => {
      if (drawRenderRef.current?.rafId) {
        cancelAnimationFrame(drawRenderRef.current.rafId);
      }
      drawRenderRef.current = null;
      map.current?.off('mousedown', handleMouseDown);
      map.current?.off('mouseup', handleMouseUp);
      map.current?.off('mouseleave', handleMouseUp);
      map.current?.off('mousemove', handleDrawRef.current);
      map.current?.off('touchstart', handleTouchStart);
      map.current?.off('touchend', handleTouchEnd);
      map.current?.off('touchcancel', handleTouchEnd);
      map.current?.off('touchmove', handleDrawRef.current);
    };
  }, [drawMode, updateRouteLine]);

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
    setIsRouting(false);
    setSegments([]);
    setDrawnPoints([]);
    drawnRef.current = [];
    
    // Remove markers
    clearWaypointMarkers();

    // Remove line
    clearRouteLine();
  };

  const moveToCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('현재 위치를 가져올 수 없습니다');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center: [number, number] = [position.coords.longitude, position.coords.latitude];
        const markerImage = profileSummary?.user.image ?? null;
        map.current?.easeTo({ center, zoom: 16, duration: 500 });

        if (map.current) {
          if (!currentLocationMarkerRef.current || currentLocationMarkerImageRef.current !== markerImage) {
            currentLocationMarkerRef.current?.remove();
            currentLocationMarkerRef.current = new maplibregl.Marker({ element: createCurrentLocationMarkerElement(markerImage), anchor: 'center' })
              .setLngLat(center)
              .addTo(map.current);
            currentLocationMarkerImageRef.current = markerImage;
          } else {
            currentLocationMarkerRef.current.setLngLat(center);
          }
        }

        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast.error('위치 권한을 허용하면 현재 위치로 이동할 수 있어요');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };


  const applyDrawnPath = async () => {
    const points = [...drawnRef.current];
    if (isRoutingRef.current || points.length < 2) {
      return;
    }

    setIsRouting(true);
    isRoutingRef.current = true;

    try {
      const reducedPoints = reduceDrawnPoints(points);
      const existingWaypoints = waypointsRef.current;
      const isAppendMode = existingWaypoints.length > 0;
      const routeCoordinates = (isAppendMode
        ? [
          [existingWaypoints[existingWaypoints.length - 1].lng, existingWaypoints[existingWaypoints.length - 1].lat] as [number, number],
          ...reducedPoints.map((point) => [point.lng, point.lat] as [number, number]),
        ]
        : reducedPoints.map((point) => [point.lng, point.lat] as [number, number])
      );
      const routeDistanceKm = calculatePolylineDistanceKm(routeCoordinates);
      const sampleCount = Math.min(30, Math.max(10, Math.ceil(routeCoordinates.length / 40)));
      const sampled = sampleRoutePoints(routeCoordinates, sampleCount);

      if (!isAppendMode) {
        const nextWaypoints = sampled.map((point, index) => ({
          lat: point.lat,
          lng: point.lng,
          order: index,
        }));

        clearWaypoints();
        setWaypoints(nextWaypoints);
        setSegments([{ coords: routeCoordinates, distanceKm: routeDistanceKm }]);
        setTotalDistance(routeDistanceKm);
        setAppliedRouteEditable(false);
        routeCoordinatesRef.current = routeCoordinates;
        if (mapLoadedRef.current) {
          updateRouteLine(routeCoordinates);
        }

        renderWaypointMarkers(nextWaypoints, 'manual');
      } else {
        const appendedSampled = sampled.slice(1);
        const rawAppendedPoints = appendedSampled.length > 0
          ? appendedSampled
          : [{ lat: routeCoordinates[routeCoordinates.length - 1][1], lng: routeCoordinates[routeCoordinates.length - 1][0] }];

        const compactAppendedPoints = rawAppendedPoints.reduce<{ lat: number; lng: number }[]>((acc, point) => {
          const prevPoint = acc.length > 0 ? acc[acc.length - 1] : existingWaypoints[existingWaypoints.length - 1];
          if (!prevPoint) {
            acc.push(point);
            return acc;
          }

          if (distanceMeters(prevPoint, point) < 8) {
            return acc;
          }

          acc.push(point);
          return acc;
        }, []);

        if (compactAppendedPoints.length === 0) {
          toast.error('기존 경로와 거의 겹쳐서 새 waypoint가 추가되지 않았어요');
          return;
        }

        const appendedWaypoints = compactAppendedPoints.map((point, index) => ({
          lat: point.lat,
          lng: point.lng,
          order: existingWaypoints.length + index,
        }));

        const nextWaypoints = [...existingWaypoints, ...appendedWaypoints];
        const nextSegments = [...segmentsRef.current, { coords: routeCoordinates, distanceKm: routeDistanceKm }];
        const nextCoordinates = buildRouteCoordinates(nextWaypoints, nextSegments);

        setWaypoints(nextWaypoints);
        setSegments(nextSegments);
        setTotalDistance((distance) => distance + routeDistanceKm);
        setAppliedRouteEditable(false);
        routeCoordinatesRef.current = nextCoordinates;
        if (mapLoadedRef.current) {
          updateRouteLine(nextCoordinates);
        }

        renderWaypointMarkers(nextWaypoints, 'manual');
      }
    } finally {
      setIsRouting(false);
      isRoutingRef.current = false;
      setDrawMode(false);
      setDrawnPoints([]);
      drawnRef.current = [];
      isDrawingRef.current = false;
      map.current?.dragPan.enable();
    }
  };

  const isValid = waypoints.length >= 5 && waypoints.length <= 30;

  if (sessionStatus === 'loading') {
    return (
      <div className="rg-page flex items-center justify-center p-6">
        <p className="text-slate-500">로그인 상태를 확인하는 중...</p>
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="rg-page flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
          <CardContent className="p-6 text-center space-y-4">
            <h1 className="text-xl font-semibold text-slate-900">로그인 후 코스를 만들 수 있어요</h1>
            <p className="text-sm text-slate-600">코스 작성자를 정확히 관리하기 위해 로그인 사용자만 코스를 제작할 수 있습니다.</p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/">
                <Button variant="outline" className="rg-touch rounded-full">홈으로</Button>
              </Link>
              <Link href="/login">
                <Button className="rg-touch rounded-full">로그인</Button>
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
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">코스 제작</h1>
          <span className="text-xs text-slate-500">1/2 단계</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rg-touch-icon rg-press rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
            onClick={undoLastWaypoint}
            disabled={waypoints.length === 0 || isRouting}
            aria-label="이전 단계로 되돌리기"
            title="이전"
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
                aria-label="현재 경로 초기화"
                title="초기화"
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
              <DialogHeader>
                <DialogTitle className="text-slate-900">경로를 초기화할까요?</DialogTitle>
                <DialogDescription className="text-slate-600">
                  현재 추가한 마커와 동선이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setIsClearDialogOpen(false)}
                >
                  취소
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-full"
                  onClick={() => {
                    clearWaypoints();
                    setIsClearDialogOpen(false);
                  }}
                >
                  초기화
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        <Button
          type="button"
          variant="ghost"
          aria-label="내 현재 위치로 이동"
          className={`${LOCATION_FAB_BASE_CLASS} ${LOCATION_FAB_TRANSITION_CLASS}`}
          style={{ bottom: getLocationFabBottom(24) }}
          onClick={moveToCurrentLocation}
          disabled={isLocating}
        >
          <LocateFixed className="h-5 w-5" />
        </Button>
        
        {/* Instructions */}
        <div className="absolute top-4 left-4 right-4 rg-soft-panel p-4">
            <p className="text-sm text-slate-600 text-center">
              {isRouting
                ? '보행 경로를 계산 중입니다'
                : drawMode
                ? '지도를 드래그해서 선을 그린 뒤 드로잉 적용을 눌러주세요'
                : '지도를 터치하거나 프리셋을 적용하세요'}
            </p>
          </div>
      </div>

      {/* Bottom Panel */}
      <Card className="m-4 rounded-3xl shadow-xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-600">Waypoint</p>
              <p className="text-2xl font-bold text-primary">
                {waypoints.length}<span className="text-sm text-slate-400">/30</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">예상 거리</p>
              <p className="text-2xl font-bold text-primary">
                {totalDistance.toFixed(2)}<span className="text-sm text-slate-400">km</span>
              </p>
            </div>
          </div>

          {waypoints.length < 5 && (
            <p className="text-sm text-orange-500 text-center">
              최소 5개의 waypoint가 필요합니다
            </p>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="lg"
                className="rg-touch h-12 rounded-2xl"
                variant={drawMode ? 'default' : 'outline'}
                onClick={() => {
                  if (isRouting) return;
                  setDrawMode((prev) => !prev);
                  setDrawnPoints([]);
                  drawnRef.current = [];
                }}
                disabled={isRouting}
              >
                라인 드로잉
              </Button>
              <Button
                size="lg"
                className="rg-touch h-12 rounded-2xl"
                variant="outline"
                onClick={applyDrawnPath}
                disabled={isRouting || !drawMode || drawnPoints.length < 2}
              >
                드로잉 적용
              </Button>
              <Button
                size="lg"
                className="rg-touch h-12 rounded-2xl"
                variant="outline"
                onClick={() => {
                  setDrawnPoints([]);
                  drawnRef.current = [];
                  if (mapLoadedRef.current) {
                    if (routeCoordinatesRef.current.length >= 2) {
                      updateRouteLine(routeCoordinatesRef.current);
                    } else {
                      clearRouteLine();
                    }
                  }
                }}
                disabled={isRouting || !drawMode || drawnPoints.length === 0}
              >
                드로잉 지우기
              </Button>
            </div>
            {drawMode ? (
              <p className="text-xs text-slate-500">드로잉 포인트 {drawnPoints.length}개</p>
            ) : null}
          </div>

          <Button
            size="lg"
            className="rg-touch w-full h-14 text-lg rounded-2xl"
            disabled={!isValid}
            onClick={() => {
              const routeCoordinates = routeCoordinatesRef.current;
              const denseWaypoints = routeCoordinates.length >= 2
                ? buildDenseWaypoints(routeCoordinates)
                : waypoints;
              const payload = {
                waypoints: denseWaypoints.length ? denseWaypoints : waypoints,
                totalDistance,
              };
              sessionStorage.setItem('courseDraft', JSON.stringify(payload));
              router.push('/create/details');
            }}
          >
            다음 단계로 →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
