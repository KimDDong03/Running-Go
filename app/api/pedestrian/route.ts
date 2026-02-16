import { NextResponse } from 'next/server';

type Point = {
  lat: number;
  lng: number;
};

const isValidPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false;
  const lat = (value as { lat?: unknown }).lat;
  const lng = (value as { lng?: unknown }).lng;
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽지 못했습니다' }, { status: 400 });
  }

  const pointsInput = (payload as { points?: unknown }).points;
  if (!Array.isArray(pointsInput)) {
    return NextResponse.json({ error: 'points 배열이 필요합니다' }, { status: 400 });
  }

  const points = pointsInput.filter(isValidPoint);
  if (points.length < 2) {
    return NextResponse.json({ error: '최소 2개 이상의 좌표가 필요합니다' }, { status: 400 });
  }

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/foot/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('continue_straight', 'false');

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: '보행 경로 서버 호출에 실패했습니다' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: '보행 경로 서버 응답이 비정상입니다' }, { status: 502 });
  }

  const data = await upstream.json() as {
    code?: string;
    routes?: Array<{
      distance?: number;
      geometry?: {
        coordinates?: [number, number][];
      };
    }>;
  };

  if (data.code !== 'Ok') {
    return NextResponse.json({ error: '보행 경로를 찾을 수 없습니다' }, { status: 404 });
  }

  const route = data.routes?.[0];
  const routeCoordinates = route?.geometry?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return NextResponse.json({ error: '보행 경로 좌표가 충분하지 않습니다' }, { status: 404 });
  }

  const routeDistance = route?.distance;
  const distanceKm = typeof routeDistance === 'number' && Number.isFinite(routeDistance)
    ? routeDistance / 1000
    : 0;

  return NextResponse.json({
    coordinates: routeCoordinates,
    distanceKm,
  });
}
