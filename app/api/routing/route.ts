import { NextResponse } from 'next/server';
import { routeWithProvider, type RoutingPoint, type RoutingProfile } from '@/lib/routing/providers';

const isValidPoint = (value: unknown): value is RoutingPoint => {
  if (!value || typeof value !== 'object') return false;
  const lat = (value as { lat?: unknown }).lat;
  const lng = (value as { lng?: unknown }).lng;
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
};

const normalizeProfile = (value: unknown): RoutingProfile => {
  if (value === 'walking') return 'walking';
  return 'driving';
};

const distanceMeters = (a: RoutingPoint, b: RoutingPoint) => {
  const R = 6371e3;
  const phi1 = a.lat * Math.PI / 180;
  const phi2 = b.lat * Math.PI / 180;
  const deltaPhi = (b.lat - a.lat) * Math.PI / 180;
  const deltaLambda = (b.lng - a.lng) * Math.PI / 180;
  const c = 2 * Math.atan2(
    Math.sqrt(
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
      + Math.cos(phi1) * Math.cos(phi2)
      * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
    ),
    Math.sqrt(
      1 - (
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
        + Math.cos(phi1) * Math.cos(phi2)
        * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
      )
    )
  );
  return R * c;
};

const buildFallbackRoute = (points: RoutingPoint[]) => {
  const coordinates = points.map((point) => [point.lng, point.lat] as [number, number]);
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    totalMeters += distanceMeters(points[i - 1], points[i]);
  }

  return {
    coordinates,
    distanceKm: totalMeters / 1000,
    fallback: true,
  };
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽지 못했습니다' }, { status: 400 });
  }

  const profile = normalizeProfile((payload as { profile?: unknown }).profile);
  const pointsInput = (payload as { points?: unknown }).points;
  if (!Array.isArray(pointsInput)) {
    return NextResponse.json({ error: 'points 배열이 필요합니다' }, { status: 400 });
  }

  const points = pointsInput.filter(isValidPoint);
  if (points.length < 2) {
    return NextResponse.json({ error: '최소 2개 이상의 좌표가 필요합니다' }, { status: 400 });
  }

  try {
    const result = await routeWithProvider(profile, points);
    if (!result) {
      return NextResponse.json({
        ...buildFallbackRoute(points),
        error: '경로를 찾지 못해 직선 경로로 대체했습니다',
        profile,
      });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      ...buildFallbackRoute(points),
      error: '경로 서버 호출에 실패해 직선 경로로 대체했습니다',
      profile,
    });
  }
}
