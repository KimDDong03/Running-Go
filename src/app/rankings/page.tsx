'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { ChevronLeft } from 'lucide-react';
import { getCollectorTier, getCreatorTier } from '@/lib/tier';
import { getCoursePreviewImageUrl } from '@/lib/course-preview-image';

const tabIds = ['popular', 'collector', 'creator', 'course'] as const;
const periodIds = ['WEEKLY', 'MONTHLY', 'ALL_TIME'] as const;

export default function RankingsPage() {
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const [activeTab, setActiveTab] = useState<(typeof tabIds)[number]>('popular');
  const [period, setPeriod] = useState<(typeof periodIds)[number]>('ALL_TIME');
  const { data, isError, refetch } = trpc.ranking.list.useQuery({ period });
  const maxPathPoints = 50;
  const tabs = [
    { id: 'popular', label: isEnglish ? 'Popular Courses' : '인기코스' },
    { id: 'collector', label: isEnglish ? 'Collectors' : '수집왕' },
    { id: 'creator', label: isEnglish ? 'Creators' : '제작왕' },
    { id: 'course', label: isEnglish ? 'By Course' : '코스별' },
  ] as const;
  const periods = [
    { id: 'WEEKLY', label: isEnglish ? 'Weekly' : '주간' },
    { id: 'MONTHLY', label: isEnglish ? 'Monthly' : '월간' },
    { id: 'ALL_TIME', label: isEnglish ? 'All Time' : '전체' },
  ] as const;

  const rankLabel = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}.`;
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

  const getPreviewImageUrl = (points: { lat: number; lng: number }[], center: { lat: number; lng: number }) => {
    return getCoursePreviewImageUrl(samplePath(points), center, { width: 240, height: 160 });
  };

  return (
    <div className="rg-page">
      <header className="rg-page-header px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rg-touch-icon rg-press rounded-full">
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{isEnglish ? 'Rankings' : '랭킹'}</h1>
        </div>
      </header>

      <main className="rg-page-main p-4 space-y-4">
        <div className="rg-chip-bar rg-scroll-row p-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === tab.id ? 'default' : 'outline'}
              className="rg-press h-8 rounded-full px-3 text-xs"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="rg-chip-bar rg-scroll-row p-1">
          {periods.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={period === item.id ? 'default' : 'outline'}
              className="rg-press h-8 rounded-full px-3 text-xs"
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />

        {isError && (
          <ErrorState
            title={isEnglish ? 'Failed to load ranking data' : '랭킹 데이터를 불러오지 못했습니다'}
            message={isEnglish ? 'Please check your network connection.' : '네트워크 상태를 확인해주세요'}
            actionLabel={isEnglish ? 'Retry' : '다시 시도'}
            onAction={() => refetch()}
          />
        )}

        {!isError && activeTab === 'popular' && (
          <div className="rg-stagger space-y-4 pb-1">
            {data?.popularCourses.length ? (
              data.popularCourses.map((course, index) => (
                <Link key={course.id} href={`/?focusCourseId=${course.id}`} className="block">
                  <Card className="rg-interactive-card rounded-[24px] border border-white/75 bg-white/85 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.58)] overflow-hidden transition-transform hover:-translate-y-0.5">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60 shadow-[0_10px_22px_-18px_rgba(15,23,42,0.55)] sm:h-24 sm:w-32">
                          <Image
                            src={(() => {
                              const raw = Array.isArray(course.waypoints)
                                ? (course.waypoints as { lat: number; lng: number }[])
                                : [];
                              return getPreviewImageUrl(raw, { lat: course.centerLat, lng: course.centerLng });
                            })()}
                            alt={isEnglish ? `${course.title} map` : `${course.title} 지도`}
                            fill
                            sizes="112px"
                            className="object-cover"
                            quality={70}
                            unoptimized
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 p-1 pr-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{rankLabel(index)} {course.title}</div>
                            <div className="mt-1 text-sm text-slate-600">❤️ {course.likeCount}</div>
                          </div>
                          <div className="shrink-0 rounded-full bg-slate-100/85 px-2.5 py-1 text-xs font-medium text-slate-700">{course.totalDistance.toFixed(1)}km</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ) : (
              <div className="text-center text-slate-500 py-12">{isEnglish ? 'No ranking data.' : '랭킹 데이터가 없습니다'}</div>
            )}
          </div>
        )}

        {!isError && activeTab === 'collector' && (
          <div className="rg-stagger space-y-3">
            {data?.collectorRankings.length ? (
              data.collectorRankings.map((ranking, index) => (
                  <Card key={ranking.id} className="rounded-2xl border border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)]">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 font-medium">
                        <span className="truncate align-middle">{rankLabel(index)} {ranking.name ?? (isEnglish ? 'Anonymous' : '익명')}</span>
                        <span className="ml-2">{getCollectorTier(ranking.collectedCount).icon}</span>
                        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{isEnglish ? 'Collector' : '탐험가'}</span>
                      </div>
                      <div className="shrink-0 text-sm text-slate-500">{ranking.score}{isEnglish ? '' : '개'}</div>
                    </CardContent>
                  </Card>
              ))
            ) : (
              <div className="text-center text-slate-500 py-12">{isEnglish ? 'No ranking data.' : '랭킹 데이터가 없습니다'}</div>
            )}
          </div>
        )}

        {!isError && activeTab === 'creator' && (
          <div className="rg-stagger space-y-3">
            {data?.creatorRankings.length ? (
              data.creatorRankings.map((ranking, index) => (
                  <Card key={ranking.id} className="rounded-2xl border border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)]">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 font-medium">
                        <span className="truncate align-middle">{rankLabel(index)} {ranking.name ?? (isEnglish ? 'Anonymous' : '익명')}</span>
                        <span className="ml-2">{getCreatorTier(ranking.score).icon}</span>
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{isEnglish ? 'Creator' : '설계자'}</span>
                      </div>
                      <div className="shrink-0 text-sm text-slate-500">{ranking.score}❤️</div>
                    </CardContent>
                  </Card>
              ))
            ) : (
              <div className="text-center text-slate-500 py-12">{isEnglish ? 'No ranking data.' : '랭킹 데이터가 없습니다'}</div>
            )}
          </div>
        )}

        {!isError && activeTab === 'course' && (
          <div className="rg-stagger space-y-3">
            {data?.courseRankings.length ? (
              data.courseRankings.map((ranking, index) => (
                <Link key={ranking.id} href={`/?focusCourseId=${ranking.courseId}`} className="block">
                  <Card className="rg-interactive-card rounded-2xl border border-white/70 bg-white/80 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.55)]">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{rankLabel(index)} {ranking.courseTitle}</div>
                      </div>
                      <div className="shrink-0 text-sm text-slate-500">{ranking.runCount}{isEnglish ? ' runs' : '회'}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            ) : (
              <div className="text-center text-slate-500 py-12">{isEnglish ? 'No ranking data.' : '랭킹 데이터가 없습니다'}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
