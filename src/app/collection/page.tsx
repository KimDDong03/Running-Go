'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, MapPin } from 'lucide-react';
import { Difficulty } from '@prisma/client';
import { getCoursePreviewImageUrl } from '@/lib/course-preview-image';
import { loadMapSdk, type MapLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';

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

export default function CollectionPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { data, isLoading, isError, error, refetch } = trpc.collection.listByUser.useQuery();
  const { data: createdData, isLoading: isCreatedLoading } = trpc.course.listByUser.useQuery(
    { userId: session?.user?.id ?? '', limit: 50 },
    { enabled: sessionStatus === 'authenticated' && Boolean(session?.user?.id) }
  );

  const [sort, setSort] = useState<'recent' | 'count'>('recent');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [viewType, setViewType] = useState<'collected' | 'created'>('collected');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isRoutePreviewOpen, setIsRoutePreviewOpen] = useState(false);
  const previewMapContainerRef = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const previewMapRef = useRef<MapLike | null>(null);
  const previewPolylinesRef = useRef<MapPolylineLike[]>([]);

  type RouteCourse = {
    id: string;
    title: string;
    totalDistance: number;
    difficulty: Difficulty;
    tags: string[];
    waypoints: { lat: number; lng: number; order: number }[];
    centerLat: number;
    centerLng: number;
    thumbnailUrl?: string | null;
    count?: number;
    createdAt?: string | Date;
    likeCount?: number;
    status?: string;
  };

  const collectedCourses = useMemo<RouteCourse[]>(() => {
    if (!data?.collections) return [];
    return data.collections.map((collection) => ({
      id: collection.course.id,
      title: collection.course.title,
      totalDistance: collection.course.totalDistance,
      difficulty: collection.course.difficulty,
      tags: collection.course.tags,
      waypoints: Array.isArray(collection.course.waypoints)
        ? (collection.course.waypoints as { lat: number; lng: number; order: number }[])
        : [],
      centerLat: collection.course.centerLat,
      centerLng: collection.course.centerLng,
      thumbnailUrl: collection.course.thumbnailUrl,
      count: collection.count,
      createdAt: collection.lastAt,
    }));
  }, [data?.collections]);

  const createdCourses = useMemo<RouteCourse[]>(() => {
    if (!createdData?.courses) return [];
    return createdData.courses.map((course) => ({
      id: course.id,
      title: course.title,
      totalDistance: course.totalDistance,
      difficulty: course.difficulty,
      tags: Array.isArray(course.tags) ? course.tags : [],
      waypoints: Array.isArray(course.waypoints)
        ? (course.waypoints as { lat: number; lng: number; order: number }[])
        : [],
      centerLat: course.centerLat,
      centerLng: course.centerLng,
      thumbnailUrl: course.thumbnailUrl,
      createdAt: course.createdAt,
      likeCount: (course as { likeCount?: number }).likeCount,
      status: (course as { status?: string }).status,
    }));
  }, [createdData?.courses]);

  const baseCourses = viewType === 'created' ? createdCourses : collectedCourses;

  const availableTags = (() => {
    const tags = new Set<string>();
    baseCourses.forEach((course) => {
      course.tags.forEach((tag) => tags.add(tag));
    });
    return ['ALL', ...Array.from(tags)];
  })();

  const sortedCourses = (() => {
    if (!baseCourses.length) return [];
    const filtered = selectedTag === 'ALL'
      ? baseCourses
      : baseCourses.filter((course) => course.tags.includes(selectedTag));

    const next = [...filtered];
    if (sort === 'count') {
      if (viewType === 'created') {
        return next.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
      }

      return next.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    }

    return next.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  })();

  const selectedCourses = sortedCourses.filter((course) => selectedCourseIds.includes(course.id));
  const hasAnyCourses = collectedCourses.length > 0 || createdCourses.length > 0;

  useEffect(() => {
    setSelectedCourseIds([]);
    setIsRoutePreviewOpen(false);
  }, [viewType]);

  useEffect(() => {
    if (!isRoutePreviewOpen || !previewMapContainerRef.current) {
      return;
    }

    let isMounted = true;
    const colors = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6'];

    const clearPreviewPolylines = () => {
      previewPolylinesRef.current.forEach((polyline) => {
        polyline.setMap(null);
      });
      previewPolylinesRef.current = [];
    };

    const renderRoutes = (sdk: MapSdkApi, mapInstance: MapLike) => {
      clearPreviewPolylines();

      const bounds = new sdk.LatLngBounds();
      let hasBounds = false;

      selectedCourses.forEach((course, index) => {
        const sortedWaypoints = [...course.waypoints].sort((a, b) => a.order - b.order);
        const path = sortedWaypoints.map((point) => new sdk.LatLng(point.lat, point.lng));
        if (path.length < 2) {
          return;
        }

        path.forEach((latLng) => {
          bounds.extend(latLng);
          hasBounds = true;
        });

        const color = colors[index % colors.length];
        const outline = new sdk.Polyline({
          map: mapInstance,
          path,
          strokeColor: '#ffffff',
          strokeWeight: 8,
          strokeOpacity: 0.85,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });
        const main = new sdk.Polyline({
          map: mapInstance,
          path,
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: 0.95,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });

        previewPolylinesRef.current.push(outline, main);
      });

      if (hasBounds) {
        mapInstance.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }
    };

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !previewMapContainerRef.current) return;

        mapSdkRef.current = sdk;

        if (!previewMapRef.current) {
          previewMapRef.current = new sdk.Map(previewMapContainerRef.current, {
            center: new sdk.LatLng(37.5665, 126.978),
            zoom: 12,
            mapTypeControl: false,
            zoomControl: false,
          });
        }

        if (previewMapRef.current) {
          renderRoutes(sdk, previewMapRef.current);
        }
      })
      .catch(() => {
        toast.error('지도를 불러오지 못했습니다');
      });

    return () => {
      isMounted = false;
      clearPreviewPolylines();
      if (!isRoutePreviewOpen) {
        previewMapRef.current?.destroy();
        previewMapRef.current = null;
      }
    };
  }, [isRoutePreviewOpen, selectedCourses]);

  useEffect(() => {
    const handlePopState = () => {
      router.replace('/');
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [router]);

  return (
    <div className="rg-page">
      <header className="rg-page-header px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rg-touch-icon rg-press rounded-full"
            onClick={() => router.replace('/')}
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">내 도감</h1>
        </div>
      </header>

      <main className="rg-page-main p-4 space-y-4">
        {isLoading || (sessionStatus === 'authenticated' && isCreatedLoading) ? (
          <div className="text-center py-20 text-slate-500">불러오는 중...</div>
        ) : isError ? (
          error?.data?.code === 'UNAUTHORIZED' ? (
            <div className="text-center py-20">
              <p className="text-red-500">로그인이 필요합니다</p>
              <Link href="/login">
                <Button className="rg-touch rg-press mt-4 rounded-full">로그인</Button>
              </Link>
            </div>
          ) : (
            <ErrorState
              title="도감을 불러오지 못했습니다"
              message="잠시 후 다시 시도해주세요"
              actionLabel="다시 시도"
              onAction={() => refetch()}
            />
          )
        ) : !hasAnyCourses ? (
          <div className="text-center py-20">
            <p className="text-slate-500">아직 수집한 코스가 없습니다</p>
            <Link href="/courses">
              <Button className="rg-touch rg-press mt-4 rounded-full shadow-md shadow-sky-200/70">코스 보러가기</Button>
            </Link>
          </div>
        ) : (
            <div className="space-y-4">
            <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={viewType === 'collected' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setViewType('collected')}
              >
                수집한 코스
              </Button>
              <Button
                size="sm"
                variant={viewType === 'created' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setViewType('created')}
              >
                제작한 코스
              </Button>
            </div>
            <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={sort === 'recent' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setSort('recent')}
              >
                최신순
              </Button>
              <Button
                size="sm"
                variant={sort === 'count' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setSort('count')}
              >
                {viewType === 'created' ? '인기순' : '수집 많은 순'}
              </Button>
              <select
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.target.value)}
                className="rg-touch h-11 rounded-full border border-white/70 bg-white/90 px-3 text-xs text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
              >
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag === 'ALL' ? '전체 태그' : `#${tag}`}
                  </option>
                ))}
              </select>
            </div>

            <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />

            {selectedCourseIds.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-sky-700">{selectedCourseIds.length}개 코스 선택됨</p>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setSelectedCourseIds([])}
                  >
                    선택 해제
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => setIsRoutePreviewOpen(true)}
                  >
                    동선 함께 보기
                  </Button>
                </div>
              </div>
            )}

            {isRoutePreviewOpen && selectedCourses.length > 0 && (
              <div className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[0_20px_36px_-28px_rgba(15,23,42,0.6)]">
                <div ref={previewMapContainerRef} className="h-56 w-full rounded-2xl" />
                <div className="mt-3 space-y-1">
                  {selectedCourses.map((course, index) => (
                    <div key={course.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6'][index % 6] }}
                      />
                      <span className="truncate">{course.title}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setIsRoutePreviewOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>
            )}
            <div className="rg-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sortedCourses.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-white/70 bg-white/80 py-10 text-center text-sm text-slate-500">
                  {viewType === 'created' ? '아직 제작한 코스가 없습니다' : '태그 조건에 맞는 수집 코스가 없습니다'}
                </div>
              ) : sortedCourses.map((course) => {
                const isSelected = selectedCourseIds.includes(course.id);

                return (
                <div
                  key={course.id}
                  role="button"
                  tabIndex={0}
                  className="w-full text-left"
                  onClick={() => router.push(`/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/courses/${course.id}`);
                    }
                  }}
                >
                  <Card className="rg-interactive-card rounded-[26px] border border-white/70 bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden">
                    <div className="relative h-28 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
                      <button
                        type="button"
                        className={`absolute right-2 top-2 z-20 h-6 min-w-6 rounded-full border px-1 text-[10px] font-semibold ${isSelected ? 'border-sky-300 bg-sky-500 text-white' : 'border-white/80 bg-white/90 text-slate-700'}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedCourseIds((prev) => (
                            prev.includes(course.id)
                              ? prev.filter((id) => id !== course.id)
                              : [...prev, course.id]
                          ));
                        }}
                      >
                        {isSelected ? '선택' : '보기'}
                      </button>
                      <Image
                        src={(() => {
                          const raw = Array.isArray(course.waypoints)
                            ? (course.waypoints as { lat: number; lng: number }[])
                            : [];
                          return getCoursePreviewImageUrl(
                            raw,
                            {
                              lat: course.centerLat,
                              lng: course.centerLng,
                            },
                            { width: 320, height: 180 }
                          );
                        })()}
                        alt={course.title}
                        fill
                        sizes="50vw"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div className="min-w-0 font-semibold text-sm line-clamp-1">
                        {course.title}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                        {viewType === 'created' ? (
                          <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />내 제작</span>
                        ) : (
                          <span className="truncate">{course.count ?? 0}회 수집</span>
                        )}
                        <span className="shrink-0">{course.totalDistance.toFixed(1)}km</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${difficultyColors[course.difficulty]} rounded-full text-xs px-2`}
                      >
                          {difficultyLabels[course.difficulty]}
                        </Badge>
                        {viewType === 'created' && course.status === 'HIDDEN' ? (
                          <Badge variant="outline" className="rounded-full text-[10px]">미공개</Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );})}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
