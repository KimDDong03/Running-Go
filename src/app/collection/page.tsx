'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { Difficulty } from '@prisma/client';

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
  const { data, isLoading, isError, error, refetch } = trpc.collection.listByUser.useQuery();
  const [sort, setSort] = useState<'recent' | 'count'>('recent');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  const availableTags = (() => {
    const tags = new Set<string>();
    data?.collections?.forEach((collection) => {
      collection.course.tags.forEach((tag) => tags.add(tag));
    });
    return ['ALL', ...Array.from(tags)];
  })();

  const sortedCollections = (() => {
    if (!data?.collections) return [];
    const filtered = selectedTag === 'ALL'
      ? data.collections
      : data.collections.filter((collection) => collection.course.tags.includes(selectedTag));
    const next = [...filtered];
    if (sort === 'count') return next.sort((a, b) => b.count - a.count);
    return next.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  })();

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
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] pb-20">
      <header className="bg-white/75 backdrop-blur border-b border-white/60 px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => router.replace('/')}
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">내 도감</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-20 text-slate-500">불러오는 중...</div>
        ) : isError ? (
          error?.data?.code === 'UNAUTHORIZED' ? (
            <div className="text-center py-20">
              <p className="text-red-500">로그인이 필요합니다</p>
              <Link href="/login">
                <Button className="mt-4 rounded-full">로그인</Button>
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
        ) : !data?.collections.length ? (
          <div className="text-center py-20">
            <p className="text-slate-500">아직 수집한 코스가 없습니다</p>
            <Link href="/courses">
              <Button className="mt-4 rounded-full shadow-md shadow-sky-200/70">코스 보러가기</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={sort === 'recent' ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setSort('recent')}
              >
                최신순
              </Button>
              <Button
                size="sm"
                variant={sort === 'count' ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setSort('count')}
              >
                수집 많은 순
              </Button>
              <select
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.target.value)}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag === 'ALL' ? '전체 태그' : `#${tag}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {sortedCollections.map((collection) => (
                <Link key={collection.id} href={`/courses/${collection.course.id}`}>
                  <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden">
                    <div className="relative h-28 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60">
                      {collection.course.thumbnailUrl ? (
                        <Image
                          src={collection.course.thumbnailUrl}
                          alt={collection.course.title}
                          fill
                          sizes="50vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-3xl">🏃‍♂️</div>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div className="font-semibold text-sm line-clamp-1">
                        {collection.course.title}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{collection.count}회 수집</span>
                        <span>{collection.course.totalDistance.toFixed(1)}km</span>
                      </div>
                      <Badge className={`${difficultyColors[collection.course.difficulty]} rounded-full text-xs px-2`}
                      >
                        {difficultyLabels[collection.course.difficulty]}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
