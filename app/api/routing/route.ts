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
      return NextResponse.json({ error: '경로를 찾을 수 없습니다', profile }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '경로 서버 호출에 실패했습니다', profile }, { status: 502 });
  }
}
