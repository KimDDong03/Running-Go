'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft } from 'lucide-react';
import { trpc } from '@/components/providers/TRPCProvider';

interface DraftData {
  waypoints: { lat: number; lng: number; order: number }[];
  totalDistance: number;
}

export default function CreateCourseDetailsPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('EASY');
  const [isPublic, setIsPublic] = useState(true);
  const [tags, setTags] = useState('');
  const createCourse = trpc.course.create.useMutation();

  const draft = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem('courseDraft');
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as DraftData;
    } catch {
      return null;
    }
  }, []);

  const estimatedTime = useMemo(() => {
    if (!draft) return 0;
    return Math.max(1, Math.round(draft.totalDistance * 6));
  }, [draft]);

  const isDistanceOutOfRange = draft
    ? draft.totalDistance < 0.5 || draft.totalDistance > 20
    : false;

  const center = useMemo(() => {
    if (!draft || draft.waypoints.length === 0) return { lat: 0, lng: 0 };
    const sum = draft.waypoints.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
      { lat: 0, lng: 0 }
    );
    return {
      lat: sum.lat / draft.waypoints.length,
      lng: sum.lng / draft.waypoints.length,
    };
  }, [draft]);

  const handleSubmit = async () => {
    if (!draft) return;
    const tagList = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 5);

    try {
      const result = await createCourse.mutateAsync({
        title,
        description: description || undefined,
        waypoints: draft.waypoints,
        totalDistance: Number(draft.totalDistance.toFixed(2)),
        estimatedTime,
        difficulty,
        centerLat: center.lat,
        centerLng: center.lng,
        tags: tagList,
        isPublic,
      });

      window.sessionStorage.removeItem('courseDraft');
      router.push(`/courses/${result.id}`);
    } catch {
      toast.error('코스를 저장하지 못했습니다. 다시 시도해주세요.');
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center p-6">
        <p className="text-slate-500">로그인 상태를 확인하는 중...</p>
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
          <CardContent className="p-6 text-center space-y-4">
            <h1 className="text-xl font-semibold text-slate-900">로그인 후 코스를 저장할 수 있어요</h1>
            <p className="text-sm text-slate-600">작성자 권한 관리를 위해 로그인 사용자만 코스를 저장할 수 있습니다.</p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/create">
                <Button variant="outline" className="rounded-full">이전 단계</Button>
              </Link>
              <Link href="/login">
                <Button className="rounded-full">로그인</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500">저장된 코스 정보가 없습니다</p>
          <Link href="/create">
            <Button className="mt-4 rounded-full">코스 만들기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] pb-24">
      <header className="bg-white/75 backdrop-blur border-b border-white/60 px-4 py-4 flex items-center gap-2">
        <Link href="/create">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">코스 정보 입력</h1>
          <span className="text-xs text-slate-500">2/2 단계</span>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card className="rounded-3xl border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">코스 제목</label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 한강 하트런"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">설명</label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="코스 소개를 적어주세요"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="difficulty" className="text-sm font-medium">난이도</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                className="w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm"
              >
                <option value="EASY">쉬움</option>
                <option value="MEDIUM">보통</option>
                <option value="HARD">어려움</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="tags" className="text-sm font-medium">태그 (최대 5개)</label>
              <Input
                id="tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="하트, 야경, 초보"
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="public" className="text-sm font-medium">공개 여부</label>
              <input
                id="public"
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-md">
          <CardContent className="p-6 space-y-2 text-sm text-slate-600">
            <div>웨이포인트: {draft.waypoints.length}개</div>
            <div>예상 거리: {draft.totalDistance.toFixed(2)}km</div>
            <div>예상 시간: {estimatedTime}분</div>
          </CardContent>
        </Card>

        {isDistanceOutOfRange && (
          <div className="text-sm text-red-500">
            코스 거리는 0.5km ~ 20km 사이여야 합니다
          </div>
        )}

        {createCourse.error?.data?.code === 'UNAUTHORIZED' && (
          <div className="text-sm text-red-500">로그인이 필요합니다</div>
        )}

        <Button
          size="lg"
          className="w-full h-14 text-lg rounded-2xl"
          disabled={!title || createCourse.isPending || isDistanceOutOfRange}
          onClick={handleSubmit}
        >
          코스 저장하기
        </Button>
      </main>
    </div>
  );
}
