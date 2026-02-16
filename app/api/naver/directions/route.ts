import { NextResponse } from 'next/server';

type Point = {
  lat: number;
  lng: number;
};

const distanceMeters = (a: Point, b: Point) => {
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

const buildFallbackRoute = (points: Point[]) => {
  const coordinates = points.map((point) => [point.lng, point.lat] as [number, number]);
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    totalMeters += distanceMeters(points[i - 1], points[i]);
  }
  return {
    coordinates,
    distanceKm: totalMeters / 1000,
  };
};

const isValidPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false;
  const lat = (value as { lat?: unknown }).lat;
  const lng = (value as { lng?: unknown }).lng;
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
};

const parseCoordinates = (path: unknown): [number, number][] => {
  if (!Array.isArray(path)) return [];
  return path
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = point[0];
      const lat = point[1];
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      return [lng, lat] as [number, number];
    })
    .filter((point): point is [number, number] => Boolean(point));
};

const toShortText = (value: unknown, maxLength = 240) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
};

const extractUpstreamErrorDetail = (bodyText: string) => {
  const normalized = toShortText(bodyText);
  if (!normalized) return 'empty-body';

  try {
    const parsed = JSON.parse(bodyText) as {
      message?: unknown;
      errorMessage?: unknown;
      error?: unknown;
      code?: unknown;
      status?: unknown;
    };

    const message = toShortText(parsed.message)
      ?? toShortText(parsed.errorMessage)
      ?? toShortText(parsed.error)
      ?? normalized;
    const code = toShortText(parsed.code);
    const status = toShortText(parsed.status);

    const meta = [code ? `code=${code}` : null, status ? `status=${status}` : null]
      .filter((part): part is string => Boolean(part))
      .join(', ');

    return meta ? `${message} (${meta})` : message;
  } catch {
    return normalized;
  }
};

export async function POST(request: Request) {
  const keyId = process.env.NAVER_MAPS_API_KEY_ID;
  const key = process.env.NAVER_MAPS_API_KEY;

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

  if (!keyId || !key) {
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '네이버 Directions 키가 설정되지 않았습니다',
    });
  }

  const start = points[0];
  const goal = points[points.length - 1];
  const waypointPoints = points.slice(1, -1);
  const useDirection15 = waypointPoints.length > 5;
  const endpoint = useDirection15
    ? 'https://maps.apigw.ntruss.com/map-direction-15/v1/driving'
    : 'https://maps.apigw.ntruss.com/map-direction/v1/driving';

  const url = new URL(endpoint);
  url.searchParams.set('start', `${start.lng},${start.lat}`);
  url.searchParams.set('goal', `${goal.lng},${goal.lat}`);
  url.searchParams.set('option', 'traoptimal');
  url.searchParams.set('lang', 'ko');

  if (waypointPoints.length > 0) {
    const waypoints = waypointPoints.map((point) => `${point.lng},${point.lat}`).join('|');
    url.searchParams.set('waypoints', waypoints);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-ncp-apigw-api-key-id': keyId,
        'x-ncp-apigw-api-key': key,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[naver-directions] upstream fetch failed', {
      message: error instanceof Error ? error.message : String(error),
      endpoint,
      pointCount: points.length,
    });
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '네이버 Directions 호출에 실패했습니다',
    });
  }

  if (!upstreamResponse.ok) {
    const upstreamBodyText = await upstreamResponse.text();
    const detail = extractUpstreamErrorDetail(upstreamBodyText);
    console.error('[naver-directions] upstream non-ok response', {
      status: upstreamResponse.status,
      endpoint,
      pointCount: points.length,
      detail,
    });
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '네이버 Directions 응답이 비정상입니다',
      detail,
      upstreamStatus: upstreamResponse.status,
    });
  }

  const data = await upstreamResponse.json();
  const routeData = (data as { route?: Record<string, Array<{ path?: unknown; summary?: { distance?: number } }>> }).route;
  if (!routeData || typeof routeData !== 'object') {
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '경로 데이터가 없습니다',
    });
  }

  const optionKeys = Object.keys(routeData);
  const primaryRoute = optionKeys
    .map((key) => routeData[key]?.[0])
    .find((value) => Boolean(value));

  if (!primaryRoute) {
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '사용 가능한 경로가 없습니다',
    });
  }

  const coordinates = parseCoordinates(primaryRoute.path);
  if (coordinates.length < 2) {
    const fallback = buildFallbackRoute(points);
    return NextResponse.json({
      ...fallback,
      fallback: true,
      error: '경로 좌표가 충분하지 않습니다',
    });
  }

  const distanceMeters = primaryRoute.summary?.distance;
  const distanceKm = typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
    ? distanceMeters / 1000
    : 0;

  return NextResponse.json({ coordinates, distanceKm });
}
