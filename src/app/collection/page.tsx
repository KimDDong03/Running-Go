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
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Heart, MapPin, Trash2 } from 'lucide-react';
import { Difficulty } from '@prisma/client';
import { getCoursePreviewImageUrl } from '@/lib/course-preview-image';
import { loadMapSdk, type MapLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';

const difficultyLabels: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
};

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-green-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  HARD: 'bg-red-500 text-white',
};

export default function CollectionPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const { status: sessionStatus } = useSession();
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error, refetch } = trpc.collection.listByUser.useQuery(
    undefined,
    {
      enabled: sessionStatus !== 'unauthenticated',
      placeholderData: (previousData) => previousData,
    }
  );
  const { data: createdData, isLoading: isCreatedLoading } = trpc.course.listByUser.useQuery(
    { limit: 50 },
    {
      enabled: sessionStatus !== 'unauthenticated',
      placeholderData: (previousData) => previousData,
    }
  );
  const { data: likedData, isLoading: isLikedLoading } = trpc.like.listByUser.useQuery(
    undefined,
    {
      enabled: sessionStatus !== 'unauthenticated',
      placeholderData: (previousData) => previousData,
    }
  );

  const [sort, setSort] = useState<'recent' | 'count'>('recent');
  const [viewType, setViewType] = useState<'collected' | 'created' | 'liked'>('collected');
  const [likedFilter, setLikedFilter] = useState<'ALL' | 'COLLECTED' | 'PENDING'>('ALL');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isRoutePreviewOpen, setIsRoutePreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; title: string } | null>(null);
  const previewMapContainerRef = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const previewMapRef = useRef<MapLike | null>(null);
  const previewPolylinesRef = useRef<MapPolylineLike[]>([]);
  const { data: historyData, isLoading: isHistoryLoading } = trpc.collection.historyByCourse.useQuery(
    { courseId: historyTarget?.id ?? '', limit: 50 },
    { enabled: sessionStatus !== 'unauthenticated' && Boolean(historyTarget?.id) }
  );
  const difficultyLabel = (difficulty: Difficulty) => {
    if (!isEnglish) {
      return difficultyLabels[difficulty];
    }
    if (difficulty === 'EASY') return 'Easy';
    if (difficulty === 'MEDIUM') return 'Medium';
    return 'Hard';
  };

  const deleteCourse = trpc.course.delete.useMutation({
    onSuccess: async (result, variables) => {
      toast.success(
        result.deletedCompletely
          ? (isEnglish ? 'Course deleted.' : '코스를 삭제했습니다')
          : (isEnglish ? 'Course was hidden because collection records exist.' : '수집 기록이 있어 코스를 삭제 상태로 전환했습니다')
      );
      setSelectedCourseIds((prev) => prev.filter((id) => id !== variables.id));
      await Promise.all([
        utils.collection.listByUser.invalidate(),
        utils.course.listByUser.invalidate(),
        utils.course.list.invalidate(),
        utils.course.byId.invalidate({ id: variables.id }),
      ]);
      setDeleteTarget(null);
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || (isEnglish ? 'Failed to delete course.' : '코스를 삭제하지 못했습니다'));
    },
  });

  type RouteCourse = {
    id: string;
    title: string;
    totalDistance: number;
    difficulty: Difficulty;
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
      waypoints: Array.isArray(collection.course.waypoints)
        ? (collection.course.waypoints as { lat: number; lng: number; order: number }[])
        : [],
      centerLat: collection.course.centerLat,
      centerLng: collection.course.centerLng,
      thumbnailUrl: collection.course.thumbnailUrl,
      count: collection.count,
      createdAt: collection.lastAt,
    }));
  }, [data]);

  const createdCourses = useMemo<RouteCourse[]>(() => {
    if (!createdData?.courses) return [];
    return createdData.courses.map((course) => ({
      id: course.id,
      title: course.title,
      totalDistance: course.totalDistance,
      difficulty: course.difficulty,
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
  }, [createdData]);

  const likedCourses = useMemo<RouteCourse[]>(() => {
    if (!likedData?.likes) return [];
    return likedData.likes.map((liked) => ({
      id: liked.course.id,
      title: liked.course.title,
      totalDistance: liked.course.totalDistance,
      difficulty: liked.course.difficulty,
      waypoints: Array.isArray(liked.course.waypoints)
        ? (liked.course.waypoints as { lat: number; lng: number; order: number }[])
        : [],
      centerLat: liked.course.centerLat,
      centerLng: liked.course.centerLng,
      thumbnailUrl: liked.course.thumbnailUrl,
      createdAt: liked.likedAt,
      likeCount: liked.course.likeCount,
      count: liked.isCollected ? 1 : 0,
    }));
  }, [likedData]);

  const baseCourses = viewType === 'created'
    ? createdCourses
    : viewType === 'liked'
      ? likedCourses
      : collectedCourses;

  const sortedCourses = (() => {
    if (!baseCourses.length) return [];
    const filteredByLikedStatus = viewType === 'liked'
      ? baseCourses.filter((course) => {
          if (likedFilter === 'ALL') return true;
          if (likedFilter === 'COLLECTED') return (course.count ?? 0) > 0;
          return (course.count ?? 0) === 0;
        })
      : baseCourses;

    const filtered = filteredByLikedStatus;

    const next = [...filtered];
    if (sort === 'count') {
      if (viewType === 'created' || viewType === 'liked') {
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
  const canRenderCollectionAd = sortedCourses.length >= 3
    && !isRoutePreviewOpen
    && !historyTarget
    && !deleteTarget;

  useEffect(() => {
    if (!isRoutePreviewOpen || !previewMapContainerRef.current) {
      return;
    }

    let isMounted = true;
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

      selectedCourses.forEach((course) => {
        const sortedWaypoints = [...course.waypoints].sort((a, b) => a.order - b.order);
        const path = sortedWaypoints.map((point) => new sdk.LatLng(point.lat, point.lng));
        if (path.length < 2) {
          return;
        }

        path.forEach((latLng) => {
          bounds.extend(latLng);
          hasBounds = true;
        });

        const outline = new sdk.Polyline({
          map: mapInstance,
          path,
          strokeColor: '#15803d',
          strokeWeight: 8,
          strokeOpacity: 0.5,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });
        const main = new sdk.Polyline({
          map: mapInstance,
          path,
          strokeColor: '#15803d',
          strokeWeight: 5,
          strokeOpacity: 0.95,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });

        previewPolylinesRef.current.push(outline, main);
      });

      if (hasBounds) {
        mapInstance.fitBounds(bounds, { top: 72, right: 72, bottom: 72, left: 72 });
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
        toast.error(isEnglish ? 'Failed to load map.' : '지도를 불러오지 못했습니다');
      });

    return () => {
      isMounted = false;
      clearPreviewPolylines();
      if (!isRoutePreviewOpen) {
        previewMapRef.current?.destroy();
        previewMapRef.current = null;
      }
    };
  }, [isEnglish, isRoutePreviewOpen, selectedCourses]);

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
      <main className="rg-page-main p-4 pt-[calc(max(env(safe-area-inset-top),0.75rem)+2.75rem)] space-y-4">
        {sessionStatus === 'loading' ? (
          <div className="text-center py-20 text-slate-500">{isEnglish ? 'Loading...' : '불러오는 중...'}</div>
        ) : sessionStatus !== 'authenticated' ? (
          <ErrorState
            title={isEnglish ? 'Sign-in required' : '로그인이 필요합니다'}
            message={isEnglish ? 'Please sign in to use your collection.' : '도감 기능은 로그인 후 사용할 수 있습니다'}
            actionLabel={isEnglish ? 'Sign in' : '로그인'}
            onAction={() => {
              window.location.href = '/login';
            }}
          />
        ) : isLoading || isCreatedLoading || isLikedLoading ? (
          <div className="text-center py-20 text-slate-500">{isEnglish ? 'Loading...' : '불러오는 중...'}</div>
        ) : isError ? (
          error?.data?.code === 'UNAUTHORIZED' ? (
            <div className="text-center py-20">
              <p className="text-red-500">{isEnglish ? 'Sign-in is required.' : '로그인이 필요합니다'}</p>
              <Link href="/login">
                <Button className="rg-touch rg-press mt-4 rounded-full">{isEnglish ? 'Sign in' : '로그인'}</Button>
              </Link>
            </div>
          ) : (
            <ErrorState
              title={isEnglish ? 'Failed to load collection' : '도감을 불러오지 못했습니다'}
              message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
              actionLabel={isEnglish ? 'Retry' : '다시 시도'}
              onAction={() => refetch()}
            />
          )
        ) : (
            <div className="space-y-4">
            <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={viewType === 'collected' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                  onClick={() => setViewType('collected')}
                >
                  {isEnglish ? 'Collected Courses' : '수집한 코스'}
                </Button>
              <Button
                size="sm"
                variant={viewType === 'created' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setViewType('created')}
                >
                  {isEnglish ? 'Created Courses' : '제작한 코스'}
                </Button>
              <Button
                size="sm"
                variant={viewType === 'liked' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setViewType('liked')}
              >
                {isEnglish ? 'Saved Courses' : '코스 보관함'}
              </Button>
            </div>
            {viewType === 'liked' && (
              <div className="rg-chip-bar rg-scroll-row">
                <Button
                  size="sm"
                  variant={likedFilter === 'ALL' ? 'default' : 'outline'}
                  className="rg-touch rg-press rounded-full"
                  onClick={() => setLikedFilter('ALL')}
                >
                  {isEnglish ? 'All' : '전체'}
                </Button>
                <Button
                  size="sm"
                  variant={likedFilter === 'COLLECTED' ? 'default' : 'outline'}
                  className="rg-touch rg-press rounded-full"
                  onClick={() => setLikedFilter('COLLECTED')}
                >
                  {isEnglish ? 'Collected' : '수집 완료'}
                </Button>
                <Button
                  size="sm"
                  variant={likedFilter === 'PENDING' ? 'default' : 'outline'}
                  className="rg-touch rg-press rounded-full"
                  onClick={() => setLikedFilter('PENDING')}
                >
                  {isEnglish ? 'Pending' : '수집 미완료'}
                </Button>
              </div>
            )}
            <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={sort === 'recent' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setSort('recent')}
              >
                {isEnglish ? 'Latest' : '최신순'}
              </Button>
              <Button
                size="sm"
                variant={sort === 'count' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setSort('count')}
              >
                {viewType === 'created' || viewType === 'liked'
                  ? (isEnglish ? 'Most Liked' : '인기순')
                  : (isEnglish ? 'Most Collected' : '수집 많은 순')}
              </Button>
            </div>

            {canRenderCollectionAd ? (
              <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
            ) : null}

            {selectedCourseIds.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-sky-700">{isEnglish ? `${selectedCourseIds.length} selected` : `${selectedCourseIds.length}개 코스 선택됨`}</p>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setSelectedCourseIds([])}
                  >
                    {isEnglish ? 'Clear Selection' : '선택 해제'}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => setIsRoutePreviewOpen(true)}
                  >
                    {isEnglish ? 'Preview Together' : '동선 함께 보기'}
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
                    {isEnglish ? 'Close' : '닫기'}
                  </Button>
                </div>
              </div>
            )}
            <div className="rg-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sortedCourses.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-white/70 bg-white/80 py-10 text-center text-sm text-slate-500">
                  {viewType === 'created'
                    ? (isEnglish ? 'No created courses yet.' : '아직 제작한 코스가 없습니다')
                    : viewType === 'liked'
                      ? (sessionStatus !== 'authenticated'
                          ? (isEnglish ? 'Sign in to use saved courses.' : '코스 보관함은 로그인 후 이용할 수 있습니다')
                          : (isEnglish ? 'No liked courses match this filter.' : '필터 조건에 맞는 코스 보관함 항목이 없습니다'))
                      : (isEnglish ? 'No collected courses yet.' : '아직 수집한 코스가 없습니다')}
                </div>
              ) : sortedCourses.map((course) => {
                const isSelected = selectedCourseIds.includes(course.id);

                return (
                <Link
                  key={course.id}
                  href={viewType === 'created' ? `/?focusCourseId=${course.id}` : `/courses/${course.id}`}
                  className="block w-full text-left"
                  onClick={(event) => {
                    if (viewType !== 'collected') return;
                    event.preventDefault();
                    setHistoryTarget({ id: course.id, title: course.title });
                  }}
                >
                  <Card className="rg-interactive-card rounded-[26px] border border-white/70 bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden">
                    <div className="relative h-28 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
                      {viewType === 'created' && (
                        <button
                          type="button"
                          className="absolute left-2 top-2 z-20 inline-flex h-6 items-center gap-1 rounded-full border border-red-200 bg-white/95 px-2 text-[10px] font-semibold text-red-600"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (deleteCourse.isPending) {
                              return;
                            }
                            setDeleteTarget({ id: course.id, title: course.title });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          {isEnglish ? 'Delete' : '삭제'}
                        </button>
                      )}
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
                        {isSelected ? (isEnglish ? 'On' : '선택') : (isEnglish ? 'View' : '보기')}
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
                            className="object-contain"
                        unoptimized
                      />
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div className="min-w-0 font-semibold text-sm line-clamp-1">
                        {course.title}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                        {viewType === 'created' ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{isEnglish ? 'My Course' : '내 제작'}</span>
                            <span className="shrink-0">❤️ {course.likeCount ?? 0}</span>
                          </div>
                        ) : viewType === 'liked' ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1"><Heart className="h-3 w-3 shrink-0 text-red-500" />{isEnglish ? 'Saved' : '보관함'}</span>
                            <span className="shrink-0">{(course.count ?? 0) > 0 ? (isEnglish ? 'Collected' : '수집 완료') : (isEnglish ? 'Pending' : '수집 미완료')}</span>
                          </div>
                        ) : (
                          <span className="truncate">{course.count ?? 0}{isEnglish ? ' collected' : '회 수집'}</span>
                        )}
                        <span className="shrink-0">{course.totalDistance.toFixed(1)}km</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${difficultyColors[course.difficulty]} rounded-full text-xs px-2`}
                      >
                          {difficultyLabel(course.difficulty)}
                        </Badge>
                        {viewType === 'created' && course.status === 'HIDDEN' ? (
                          <Badge variant="outline" className="rounded-full text-[10px]">{isEnglish ? 'Private' : '미공개'}</Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );})}
            </div>
          </div>
        )}
      </main>

      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => {
        if (!open) {
          setHistoryTarget(null);
        }
      }}>
        <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {isEnglish ? 'My Run Records' : '내 러닝 기록'}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {historyTarget?.title ?? ''}
            </DialogDescription>
          </DialogHeader>

          {isHistoryLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">{isEnglish ? 'Loading...' : '불러오는 중...'}</div>
          ) : !historyData?.sessions.length ? (
            <div className="py-8 text-center text-sm text-slate-500">{isEnglish ? 'No collected run records yet.' : '아직 수집된 러닝 기록이 없습니다'}</div>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {historyData.sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-white/70 bg-white/85 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{new Date(session.endedAt).toLocaleString(isEnglish ? 'en-US' : 'ko-KR')}</span>
                    <span>Match {Math.round(session.matchRate ?? 0)}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm text-slate-700">
                    <span>{session.distance.toFixed(2)}km</span>
                    <span>•</span>
                    <span>{Math.floor(session.duration / 60)}{isEnglish ? ' min' : '분'}</span>
                    <span>•</span>
                    <span>{session.pace.toFixed(2)} {isEnglish ? 'min/km' : '분/km'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open && !deleteCourse.isPending) {
          setDeleteTarget(null);
        }
      }}>
        <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {isEnglish ? 'Delete this course?' : '코스를 삭제할까요?'}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {isEnglish
                ? `"${deleteTarget?.title ?? ''}" will be removed. This action cannot be undone.`
                : `"${deleteTarget?.title ?? ''}" 코스를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={deleteCourse.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              {isEnglish ? 'Cancel' : '취소'}
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={!deleteTarget || deleteCourse.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteCourse.mutate({ id: deleteTarget.id });
              }}
            >
              {deleteCourse.isPending
                ? (isEnglish ? 'Deleting...' : '삭제 중...')
                : (isEnglish ? 'Delete' : '삭제하기')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
