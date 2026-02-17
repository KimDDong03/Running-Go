'use client';

import { use, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { ChevronLeft, Heart, MapPin, Clock, Trophy, User, Play, Trash2 } from 'lucide-react';
import { Difficulty } from '@prisma/client';
import { loadMapSdk, type MapLike, type MapPolylineLike, type MapSdkApi } from '@/lib/map/sdk';

interface Waypoint {
  lat: number;
  lng: number;
  order: number;
}

interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  waypoints: unknown;
  totalDistance: number;
  estimatedTime: number;
  difficulty: Difficulty;
  centerLat: number;
  centerLng: number;
  thumbnailUrl: string | null;
  tags: string[];
  isPublic: boolean;
  likeCount: number;
  collectCount: number;
  creatorId: string;
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
  createdAt: Date;
}

const difficultyLabels: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
};

const difficultyLabel = (difficulty: Difficulty, isEnglish: boolean) => {
  if (!isEnglish) return difficultyLabels[difficulty];
  if (difficulty === 'EASY') return 'Easy';
  if (difficulty === 'MEDIUM') return 'Medium';
  return 'Hard';
};

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HARD: 'bg-red-100 text-red-700',
};

interface CourseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = use(params);
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const router = useRouter();
  const { data: session } = useSession();
  const { data: course, isLoading, isError } = trpc.course.byId.useQuery({ id });
  const utils = trpc.useUtils();
  const { data: likeStatus, refetch: refetchLike } = trpc.like.status.useQuery({ courseId: id });
  const likeMutation = trpc.like.toggle.useMutation({
    onSuccess: () => {
      refetchLike();
      void utils.course.byId.invalidate({ id });
      void utils.course.list.invalidate();
      void utils.home.summary.invalidate();
      void utils.ranking.list.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error(isEnglish ? 'Sign-in is required.' : '로그인이 필요합니다');
      }
    },
  });
  const deleteMutation = trpc.course.delete.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.deletedCompletely
          ? (isEnglish ? 'Course deleted.' : '코스를 삭제했습니다')
          : (isEnglish ? 'Course was hidden because collection records exist.' : '수집 기록이 있어 코스를 삭제 상태로 전환했습니다')
      );
      void utils.course.byId.invalidate({ id });
      void utils.course.list.invalidate();
      void utils.course.listByUser.invalidate();
      void utils.home.summary.invalidate();
      void utils.ranking.list.invalidate();
      void utils.profile.summary.invalidate();
      router.replace('/courses');
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error(isEnglish ? 'Sign-in is required.' : '로그인이 필요합니다');
        return;
      }
      if (error.data?.code === 'FORBIDDEN') {
        toast.error(isEnglish ? 'Only your own courses can be deleted.' : '내가 만든 코스만 삭제할 수 있습니다');
        return;
      }
      toast.error(error.message || (isEnglish ? 'Failed to delete course.' : '코스를 삭제하지 못했습니다'));
    },
  });

  const courseDetail = course as unknown as CourseDetail | null;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapSdkRef = useRef<MapSdkApi | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const outlinePolylineRef = useRef<MapPolylineLike | null>(null);
  const mainPolylineRef = useRef<MapPolylineLike | null>(null);
  const waypointList = useMemo(() => {
    if (!courseDetail) return [] as Waypoint[];
    const raw = Array.isArray(courseDetail.waypoints)
      ? (courseDetail.waypoints as Waypoint[])
      : [];
    return [...raw].sort((a, b) => a.order - b.order);
  }, [courseDetail]);

  useEffect(() => {
    if (!courseDetail || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let isMounted = true;

    void loadMapSdk()
      .then((sdk) => {
        if (!isMounted || !mapContainerRef.current) return;
        mapSdkRef.current = sdk;
        mapRef.current = new sdk.Map(mapContainerRef.current, {
          center: new sdk.LatLng(courseDetail.centerLat, courseDetail.centerLng),
          zoom: 13,
          mapTypeControl: false,
          zoomControl: false,
        });
      })
      .catch(() => {
        toast.error(isEnglish ? 'Failed to load map.' : '지도를 불러오지 못했습니다');
      });

    return () => {
      isMounted = false;
      outlinePolylineRef.current?.setMap(null);
      mainPolylineRef.current?.setMap(null);
      outlinePolylineRef.current = null;
      mainPolylineRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [courseDetail, isEnglish]);

  useEffect(() => {
    if (!courseDetail || !mapRef.current || !mapSdkRef.current) {
      return;
    }

    const map = mapRef.current;
    const sdk = mapSdkRef.current;
    const coordinates = waypointList.map((point) => new sdk.LatLng(point.lat, point.lng));

    if (coordinates.length >= 2) {
      if (outlinePolylineRef.current) {
        outlinePolylineRef.current.setPath(coordinates);
      } else {
        outlinePolylineRef.current = new sdk.Polyline({
          map,
          path: coordinates,
          strokeColor: '#ffffff',
          strokeWeight: 8,
          strokeOpacity: 0.9,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });
      }

      if (mainPolylineRef.current) {
        mainPolylineRef.current.setPath(coordinates);
      } else {
        mainPolylineRef.current = new sdk.Polyline({
          map,
          path: coordinates,
          strokeColor: '#0ea5e9',
          strokeWeight: 5,
          strokeOpacity: 0.96,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          clickable: false,
        });
      }

      const bounds = new sdk.LatLngBounds();
      coordinates.forEach((coord) => bounds.extend(coord));
      map.fitBounds(bounds, { top: 36, right: 36, bottom: 36, left: 36 });
    } else {
      outlinePolylineRef.current?.setMap(null);
      mainPolylineRef.current?.setMap(null);
      outlinePolylineRef.current = null;
      mainPolylineRef.current = null;
      map.setCenter(new sdk.LatLng(courseDetail.centerLat, courseDetail.centerLng));
      map.setZoom(13);
    }
  }, [courseDetail, waypointList]);

  if (isLoading) {
    return (
      <div className="rg-page">
        <Skeleton className="h-64" />
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rg-page flex items-center justify-center">
        <ErrorState
          title={isEnglish ? 'Failed to load course' : '코스를 불러오지 못했습니다'}
          message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
          actionLabel={isEnglish ? 'To Collection' : '도감으로'}
          onAction={() => router.replace('/collection')}
        />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="rg-page flex items-center justify-center">
        <ErrorState
          title={isEnglish ? 'Course not found' : '코스를 찾을 수 없습니다'}
          message={isEnglish ? 'Try a different course.' : '다른 코스를 찾아보세요'}
          actionLabel={isEnglish ? 'To Collection' : '도감으로'}
          onAction={() => router.replace('/collection')}
        />
      </div>
    );
  }

  if (!courseDetail) {
    return null;
  }

  const isOwner = Boolean(session?.user?.id && courseDetail.creatorId === session.user.id);

  return (
    <div className="rg-page pb-24">
      {/* Header Image */}
      <div className="relative h-64 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
        <Link href="/collection">
          <Button
            variant="secondary"
            size="icon"
            className="rg-touch-icon absolute top-4 left-4 z-20 rounded-full bg-white/80 backdrop-blur border border-white/70"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Title & Actions */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{courseDetail.title}</h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
              <User className="w-4 h-4" />
              <span>{courseDetail.creator.name || (isEnglish ? 'Anonymous' : '익명')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-red-200 text-red-600 hover:bg-red-50"
                disabled={deleteMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (!window.confirm(isEnglish
                    ? 'Delete this course? This action cannot be undone.'
                    : '이 코스를 삭제할까요? 삭제 후 복구할 수 없습니다.')) {
                    return;
                  }
                  deleteMutation.mutate({ id });
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleteMutation.isPending ? (isEnglish ? 'Deleting...' : '삭제 중...') : (isEnglish ? 'Delete' : '삭제')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rg-touch-icon rounded-full"
              onClick={(event) => {
                event.preventDefault();
                likeMutation.mutate({ courseId: id });
              }}
            >
              <Heart className={`w-6 h-6 ${likeStatus?.isLiked ? 'text-red-500' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <Card className="rounded-2xl border border-white/70 bg-white/80 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.55)]">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <MapPin className="w-5 h-5 mx-auto mb-1 text-slate-700" />
                <div className="text-lg font-semibold text-slate-900">{courseDetail.totalDistance.toFixed(1)}km</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{isEnglish ? 'Distance' : '거리'}</div>
              </div>
              <div>
                <Clock className="w-5 h-5 mx-auto mb-1 text-slate-700" />
                <div className="text-lg font-semibold text-slate-900">{courseDetail.estimatedTime}{isEnglish ? ' min' : '분'}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{isEnglish ? 'Est. Time' : '예상 시간'}</div>
              </div>
              <div>
                <Trophy className="w-5 h-5 mx-auto mb-1 text-slate-700" />
                <div className="text-lg font-semibold text-slate-900">{courseDetail.collectCount}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{isEnglish ? 'Collected' : '수집'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Difficulty & Tags */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${difficultyColors[courseDetail.difficulty]} rounded-full text-sm px-3 py-1`}>
            {difficultyLabel(courseDetail.difficulty, isEnglish)}
          </Badge>
          {courseDetail.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-full text-sm px-3 py-1">
              #{tag}
            </Badge>
          ))}
        </div>

        {/* Description */}
        {courseDetail.description && (
          <Card className="rounded-2xl border border-white/70 bg-white/80 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.55)]">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">{isEnglish ? 'Course Description' : '코스 설명'}</h3>
              <p className="text-slate-600 whitespace-pre-wrap">{courseDetail.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Waypoints Preview removed */}
      </div>

      {/* Bottom Action */}
      <div className="rg-safe-bottom fixed bottom-0 left-0 right-0 border-t border-white/70 bg-white/85 p-4 backdrop-blur-xl shadow-[0_-14px_30px_-26px_rgba(15,23,42,0.7)]">
        <Link href={`/run?courseId=${courseDetail.id}`}>
          <Button size="lg" className="rg-touch w-full h-14 text-lg rounded-2xl">
            <Play className="w-5 h-5 mr-2" />
            {isEnglish ? 'Start Run With This Course' : '이 코스로 러닝 시작'}
          </Button>
        </Link>
      </div>
    </div>
  );
}
