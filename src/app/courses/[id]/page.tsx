'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { ChevronLeft, Heart, MapPin, Clock, Trophy, User, Play, Trash2 } from 'lucide-react';
import { Difficulty } from '@prisma/client';
import { clientEnv } from '@/lib/env';
import { NAVER_LIKE_MAP_STYLE_ID } from '@/lib/map-style';

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
        toast.error('로그인이 필요합니다');
      }
    },
  });
  const deleteMutation = trpc.course.delete.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.deletedCompletely
          ? '코스를 삭제했습니다'
          : '수집 기록이 있어 코스를 삭제 상태로 전환했습니다'
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
        toast.error('로그인이 필요합니다');
        return;
      }
      if (error.data?.code === 'FORBIDDEN') {
        toast.error('내가 만든 코스만 삭제할 수 있습니다');
        return;
      }
      toast.error(error.message || '코스를 삭제하지 못했습니다');
    },
  });

  const courseDetail = course as unknown as CourseDetail | null;
  const waypointList = useMemo(() => {
    if (!courseDetail) return [] as Waypoint[];
    const raw = Array.isArray(courseDetail.waypoints)
      ? (courseDetail.waypoints as Waypoint[])
      : [];
    return [...raw].sort((a, b) => a.order - b.order);
  }, [courseDetail]);

  const mapboxToken = clientEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const maxPathPoints = 80;
  const getMapImageUrl = (lat: number, lng: number) => {
    const width = 900;
    const height = 520;
    const zoom = 13;
    return `https://api.mapbox.com/styles/v1/${NAVER_LIKE_MAP_STYLE_ID}/static/${lng},${lat},${zoom},0/${width}x${height}?access_token=${mapboxToken}`;
  };

  const encodePolyline = (points: { lat: number; lng: number }[]) => {
    let result = '';
    let prevLat = 0;
    let prevLng = 0;

    points.forEach((point) => {
      const lat = Math.round(point.lat * 1e5);
      const lng = Math.round(point.lng * 1e5);
      const dLat = lat - prevLat;
      const dLng = lng - prevLng;
      prevLat = lat;
      prevLng = lng;

      [dLat, dLng].forEach((value) => {
        let shifted = value << 1;
        if (value < 0) shifted = ~shifted;
        let chunk = shifted;
        while (chunk >= 0x20) {
          result += String.fromCharCode((0x20 | (chunk & 0x1f)) + 63);
          chunk >>= 5;
        }
        result += String.fromCharCode(chunk + 63);
      });
    });

    return result;
  };

  const samplePath = (points: { lat: number; lng: number }[]) => {
    if (points.length <= maxPathPoints) return points;
    const step = Math.ceil(points.length / maxPathPoints);
    const sampled: { lat: number; lng: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      sampled.push(points[i]);
    }
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }
    return sampled;
  };

  const getMapPathImageUrl = (points: { lat: number; lng: number }[]) => {
    const width = 900;
    const height = 520;
    const path = encodePolyline(samplePath(points));
    const overlay = `path-5+0ea5e9(${encodeURIComponent(path)})`;
    return `https://api.mapbox.com/styles/v1/${NAVER_LIKE_MAP_STYLE_ID}/static/${overlay}/auto/${width}x${height}?padding=80&access_token=${mapboxToken}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
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
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center">
        <ErrorState
          title="코스를 불러오지 못했습니다"
          message="잠시 후 다시 시도해주세요"
          actionLabel="코스 목록으로"
          onAction={() => router.replace('/courses')}
        />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center">
        <ErrorState
          title="코스를 찾을 수 없습니다"
          message="다른 코스를 찾아보세요"
          actionLabel="코스 목록으로"
          onAction={() => router.replace('/courses')}
        />
      </div>
    );
  }

  if (!courseDetail) {
    return null;
  }

  const isOwner = Boolean(session?.user?.id && courseDetail.creatorId === session.user.id);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] pb-24">
      {/* Header Image */}
      <div className="relative h-64 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
        <Link href="/courses">
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 left-4 rounded-full bg-white/80 backdrop-blur border border-white/70"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div className="absolute inset-0 flex items-center justify-center">
          {mapboxToken && waypointList.length ? (
            <Image
              src={getMapPathImageUrl(waypointList)}
              alt={`${courseDetail.title} 지도`}
              fill
              sizes="100vw"
              unoptimized
              className="object-cover"
            />
          ) : mapboxToken ? (
            <Image
              src={getMapImageUrl(courseDetail.centerLat, courseDetail.centerLng)}
              alt={`${courseDetail.title} 지도`}
              fill
              sizes="100vw"
              unoptimized
              className="object-cover"
            />
          ) : courseDetail.thumbnailUrl ? (
            <div className="w-full h-full bg-slate-200" />
          ) : (
            <span className="text-8xl">🏃‍♂️</span>
          )}
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
              <span>{courseDetail.creator.name || '익명'}</span>
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
                  if (!window.confirm('이 코스를 삭제할까요? 삭제 후 복구할 수 없습니다.')) {
                    return;
                  }
                  deleteMutation.mutate({ id });
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
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
                <div className="text-xs uppercase tracking-wide text-slate-500">거리</div>
              </div>
              <div>
                <Clock className="w-5 h-5 mx-auto mb-1 text-slate-700" />
                <div className="text-lg font-semibold text-slate-900">{courseDetail.estimatedTime}분</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">예상 시간</div>
              </div>
              <div>
                <Trophy className="w-5 h-5 mx-auto mb-1 text-slate-700" />
                <div className="text-lg font-semibold text-slate-900">{courseDetail.collectCount}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">수집</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Difficulty & Tags */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${difficultyColors[courseDetail.difficulty]} rounded-full text-sm px-3 py-1`}>
            {difficultyLabels[courseDetail.difficulty]}
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
              <h3 className="font-semibold mb-2">코스 설명</h3>
              <p className="text-slate-600 whitespace-pre-wrap">{courseDetail.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Waypoints Preview removed */}
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[env(safe-area-inset-bottom)] bg-white/80 backdrop-blur border-t border-white/60">
        <Link href={`/run?courseId=${courseDetail.id}`}>
          <Button size="lg" className="w-full h-14 text-lg rounded-2xl">
            <Play className="w-5 h-5 mr-2" />
            이 코스로 러닝 시작
          </Button>
        </Link>
      </div>
    </div>
  );
}
