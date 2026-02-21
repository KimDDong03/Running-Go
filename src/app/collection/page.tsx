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
  EASY: 'bg-[#67c93a] text-[#102449]',
  MEDIUM: 'bg-[#ffb020] text-[#102449]',
  HARD: 'bg-[#ff5a36] text-white',
};

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
    || value === 'LATEST'
  ) {
    return value;
  }
  return 'NEAREST';
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
  const [catalogScope, setCatalogScope] = useState<'all' | 'vault'>('all');
  const [allSort, setAllSort] = useState<CourseListSort>('NEAREST');
  const [vaultSort, setVaultSort] = useState<'recent' | 'count'>('recent');
  const [viewType, setViewType] = useState<'collected' | 'created' | 'liked'>('collected');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
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
  const allCourseInput = useMemo(() => {
    if (allSort === 'NEAREST' && userLocation) {
      return {
        limit: 50,
        sortBy: allSort,
        location: userLocation,
      };
    }
    return {
      limit: 50,
      sortBy: allSort,
    };
  }, [allSort, userLocation]);
  const {
    data: allCourseData,
    isLoading: isAllCourseLoading,
    isError: isAllCourseError,
    refetch: refetchAllCourses,
  } = trpc.course.list.useQuery(
    allCourseInput,
    { enabled: sessionStatus === 'authenticated' && (allSort !== 'NEAREST' || Boolean(userLocation)) }
  );
  const difficultyLabel = (difficulty: Difficulty) => {
    if (!isEnglish) {
      return difficultyLabels[difficulty];
    }
    if (difficulty === 'EASY') return 'Easy';
    if (difficulty === 'MEDIUM') return 'Medium';
    return 'Hard';
  };

  useEffect(() => {
    if (allSort !== 'NEAREST') return;
    if (userLocation) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationError(null);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setLocationError(isEnglish ? 'Unable to get current location.' : '현재 위치를 가져올 수 없습니다');
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }, [allSort, isEnglish, userLocation]);

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

  const toggleLike = trpc.like.toggle.useMutation();

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

  const pendingLikedCourses = useMemo(
    () => likedCourses.filter((course) => (course.count ?? 0) === 0),
    [likedCourses]
  );

  const allCourses = useMemo<RouteCourse[]>(() => {
    if (!allCourseData?.courses) return [];
    return allCourseData.courses.map((course) => ({
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
      likeCount: course.likeCount,
      status: undefined,
    }));
  }, [allCourseData]);

  const baseCourses = viewType === 'created'
    ? createdCourses
    : viewType === 'liked'
      ? pendingLikedCourses
      : collectedCourses;

  const sortedCourses = useMemo(() => {
    if (!baseCourses.length) return [];
    const next = [...baseCourses];
    if (vaultSort === 'count') {
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
  }, [baseCourses, vaultSort, viewType]);

  const displayedCourses = catalogScope === 'all' ? allCourses : sortedCourses;
  const selectedCourses = displayedCourses.filter((course) => selectedCourseIds.includes(course.id));
  const canRenderCollectionAd = displayedCourses.length >= 3
    && !isRoutePreviewOpen
    && !historyTarget
    && !deleteTarget;

  const handleUnlikeFromCollection = async (courseId: string) => {
    const previous = utils.like.listByUser.getData();
    if (previous?.likes) {
      utils.like.listByUser.setData(undefined, {
        likes: previous.likes.filter((item) => item.course.id !== courseId),
      });
    }

    try {
      const result = await toggleLike.mutateAsync({ courseId });
      if (result.isLiked) {
        await utils.like.listByUser.invalidate();
      }
      await Promise.all([
        utils.course.list.invalidate(),
        utils.course.byId.invalidate({ id: courseId }),
      ]);
      toast.success(isEnglish ? 'Removed from saved courses.' : '코스 보관함에서 제거했습니다');
    } catch (mutationError) {
      if (previous) {
        utils.like.listByUser.setData(undefined, previous);
      }
      const message = mutationError instanceof Error
        ? mutationError.message
        : (isEnglish ? 'Failed to update like.' : '좋아요를 반영하지 못했습니다');
      toast.error(message);
    }
  };

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
          strokeColor: '#0f5fd7',
          strokeWeight: 8,
          strokeOpacity: 0.5,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });
        const main = new sdk.Polyline({
          map: mapInstance,
          path,
          strokeColor: '#1d8fff',
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

  const isPageLoading = isLoading || isCreatedLoading || isLikedLoading || (catalogScope === 'all' && isAllCourseLoading);
  const isPageError = isError || (catalogScope === 'all' && isAllCourseError);
  const nearestLocationError = allSort === 'NEAREST' && !navigator.geolocation
    ? (isEnglish ? 'Location permission is required for nearest sort.' : '가까운순 정렬에는 위치 권한이 필요합니다')
    : locationError;

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
        ) : isPageLoading ? (
          <div className="text-center py-20 text-slate-500">{isEnglish ? 'Loading...' : '불러오는 중...'}</div>
        ) : isPageError ? (
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
              onAction={() => {
                if (catalogScope === 'all') {
                  void refetchAllCourses();
                  return;
                }
                void refetch();
              }}
            />
          )
        ) : (
            <div className="space-y-4">
            <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={catalogScope === 'all' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => {
                  setCatalogScope('all');
                  setSelectedCourseIds([]);
                  setIsRoutePreviewOpen(false);
                }}
              >
                {isEnglish ? 'All Courses' : '전체 코스'}
              </Button>
              <Button
                size="sm"
                variant={catalogScope === 'vault' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setCatalogScope('vault')}
              >
                {isEnglish ? 'Course Vault' : '코스 보관함'}
              </Button>
            </div>

            {catalogScope === 'vault' ? (
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
                  {isEnglish ? 'Wishlist' : '관심 코스'}
                </Button>
              </div>
            ) : null}

            {catalogScope === 'all' ? (
              <select
                value={allSort}
                onChange={(event) => setAllSort(parseCourseListSort(event.target.value))}
                className="rg-touch h-11 w-full rounded-full border border-white/70 bg-white/90 px-3 text-xs text-slate-700 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.55)]"
              >
                <option value="LATEST">{isEnglish ? 'Latest' : '최신순'}</option>
                <option value="LIKES_DESC">{isEnglish ? 'Most Liked' : '좋아요 많은순'}</option>
                <option value="NEAREST">{isEnglish ? 'Nearest (My Location)' : '가까운순(내 위치)'}</option>
                <option value="COURSE_DISTANCE_ASC">{isEnglish ? 'Shortest Distance' : '코스 짧은순'}</option>
                <option value="COURSE_DISTANCE_DESC">{isEnglish ? 'Longest Distance' : '코스 긴순'}</option>
              </select>
            ) : (
              <div className="rg-chip-bar rg-scroll-row">
              <Button
                size="sm"
                variant={vaultSort === 'recent' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setVaultSort('recent')}
              >
                {isEnglish ? 'Latest' : '최신순'}
              </Button>
              <Button
                size="sm"
                variant={vaultSort === 'count' ? 'default' : 'outline'}
                className="rg-touch rg-press rounded-full"
                onClick={() => setVaultSort('count')}
              >
                {viewType === 'created' || viewType === 'liked'
                  ? (isEnglish ? 'Most Liked' : '인기순')
                  : (isEnglish ? 'Most Collected' : '수집 많은 순')}
              </Button>
            </div>
            )}

            {catalogScope === 'all' && allSort === 'NEAREST' && nearestLocationError ? (
              <p className="text-xs text-slate-500">{nearestLocationError}</p>
            ) : null}

            {canRenderCollectionAd ? (
              <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
            ) : null}

            {catalogScope === 'vault' && selectedCourseIds.length > 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-[#1d8fff]/25 bg-[#1d8fff]/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[#0f5fd7]">{isEnglish ? `${selectedCourseIds.length} selected` : `${selectedCourseIds.length}개 코스 선택됨`}</p>
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

            {catalogScope === 'vault' && isRoutePreviewOpen && selectedCourses.length > 0 && (
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
              {displayedCourses.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-white/70 bg-white/80 py-10 text-center text-sm text-slate-500">
                  {catalogScope === 'all'
                    ? (isEnglish ? 'No courses available.' : '표시할 코스가 없습니다')
                    : viewType === 'created'
                    ? (isEnglish ? 'No created courses yet.' : '아직 제작한 코스가 없습니다')
                    : viewType === 'liked'
                      ? (sessionStatus !== 'authenticated'
                          ? (isEnglish ? 'Sign in to use your wishlist.' : '관심 코스는 로그인 후 이용할 수 있습니다')
                          : (isEnglish ? 'No wishlist courses yet.' : '아직 관심 코스가 없습니다'))
                      : (isEnglish ? 'No collected courses yet.' : '아직 수집한 코스가 없습니다')}
                </div>
              ) : displayedCourses.map((course) => {
                const isSelected = selectedCourseIds.includes(course.id);

                return (
                <Link
                  key={course.id}
                  href={catalogScope === 'all' || viewType === 'created' || viewType === 'liked' ? `/?focusCourseId=${course.id}` : `/courses/${course.id}`}
                  className="block w-full text-left"
                  onClick={(event) => {
                    if (catalogScope === 'all') return;
                    if (viewType !== 'collected') return;
                    event.preventDefault();
                    setHistoryTarget({ id: course.id, title: course.title });
                  }}
                >
                  <Card className="rg-interactive-card rounded-[26px] border border-white/70 bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden">
                    <div className="relative h-28 bg-gradient-to-br from-[#e5f3ff] via-white to-[#f2fbe8]">
                      {catalogScope === 'vault' && viewType === 'created' && (
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
                      {catalogScope === 'vault' ? (
                        <button
                          type="button"
                          className={`absolute right-2 top-2 z-20 h-6 min-w-6 rounded-full border px-1 text-[10px] font-semibold ${isSelected ? 'border-[#1d8fff]/50 bg-[#0f5fd7] text-white' : 'border-white/80 bg-white/90 text-slate-700'}`}
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
                      ) : null}
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
                        {catalogScope === 'all' ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {isEnglish ? 'All Courses' : '전체 코스'}
                            </span>
                            <span className="shrink-0">❤️ {course.likeCount ?? 0}</span>
                          </div>
                        ) : viewType === 'created' ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{isEnglish ? 'My Course' : '내 제작'}</span>
                            <span className="shrink-0">❤️ {course.likeCount ?? 0}</span>
                          </div>
                        ) : viewType === 'liked' ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1"><Heart className="h-3 w-3 shrink-0 text-red-500" />{isEnglish ? 'Saved' : '보관함'}</span>
                            <span className="shrink-0">{(course.count ?? 0) > 0 ? (isEnglish ? 'Collected' : '수집 완료') : (isEnglish ? 'Pending' : '수집 미완료')}</span>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleUnlikeFromCollection(course.id);
                              }}
                              disabled={toggleLike.isPending}
                            >
                              <Heart className="h-3 w-3 fill-[#ff5a36] text-[#ff5a36]" />
                              {isEnglish ? 'Unlike' : '좋아요 취소'}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-[#1d8fff]/35 bg-[#1d8fff]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0f5fd7] transition-colors hover:bg-[#1d8fff]/15"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                router.push(`/?focusCourseId=${course.id}`);
                              }}
                            >
                              {isEnglish ? 'Route' : '루트'}
                            </button>
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
                        {catalogScope === 'vault' && viewType === 'created' && course.status === 'HIDDEN' ? (
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
