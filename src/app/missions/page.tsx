'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { useLocale } from '@/app/components/providers/LocaleProvider';

export default function MissionsPage() {
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [missionFilter, setMissionFilter] = useState<'ALL' | 'DAILY' | 'CREATOR' | 'COLLECTOR' | 'SOCIAL' | 'MILESTONE'>('ALL');
  const { data: missionData, isLoading, isError, refetch } = trpc.mission.summary.useQuery(
    undefined,
    { enabled: sessionStatus === 'authenticated' }
  );
  const filteredMissions = useMemo(() => {
    if (!missionData) return [];
    if (missionFilter === 'ALL') return missionData.missions;
    return missionData.missions.filter((mission) => mission.category === missionFilter);
  }, [missionData, missionFilter]);

  return (
    <div className="rg-page">
      <main className="rg-page-main p-4 pt-[calc(max(env(safe-area-inset-top),0.75rem)+2.75rem)] space-y-4">
        {sessionStatus !== 'authenticated' ? (
          <ErrorState
            title={isEnglish ? 'Sign-in required' : '로그인이 필요합니다'}
            message={isEnglish ? 'Please sign in to view your missions.' : '미션을 보려면 로그인해 주세요'}
            actionLabel={isEnglish ? 'Sign in' : '로그인'}
            onAction={() => {
              window.location.href = '/login';
            }}
          />
        ) : isLoading ? (
          <div className="py-20 text-center text-slate-500">{isEnglish ? 'Loading...' : '불러오는 중...'}</div>
        ) : isError || !missionData ? (
          <ErrorState
            title={isEnglish ? 'Failed to load missions' : '미션을 불러오지 못했습니다'}
            message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
            actionLabel={isEnglish ? 'Retry' : '다시 시도'}
            onAction={() => refetch()}
          />
        ) : (
          <div className="space-y-4">
            <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_36px_-26px_rgba(15,23,42,0.55)]">
              <div>
                <p className="text-xs font-medium text-slate-500">{isEnglish ? 'Current Level' : '현재 레벨'}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xl font-semibold text-slate-900">Lv. {missionData.level.level}</p>
                  <Badge className="rounded-full bg-[#0f5fd7] text-white">
                    {missionData.level.levelProgressPercent}%
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {isEnglish
                    ? `${missionData.level.currentLevelXp} / ${missionData.level.xpForNextLevel} XP to next level`
                    : `다음 레벨까지 ${missionData.level.currentLevelXp} / ${missionData.level.xpForNextLevel} XP`}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#1d8fff] transition-all"
                    style={{ width: `${missionData.level.levelProgressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {isEnglish
                    ? `Progress XP ${missionData.progressXp} · Completed XP ${missionData.earnedXp} · Max XP ${missionData.totalXp}`
                    : `진행 XP ${missionData.progressXp} · 완료 XP ${missionData.earnedXp} · 최대 XP ${missionData.totalXp}`}
                </p>
              </div>
            </section>

            <div className="rg-chip-bar rg-scroll-row">
              {[
                { id: 'ALL', ko: '전체', en: 'All' },
                { id: 'DAILY', ko: '데일리', en: 'Daily' },
                { id: 'CREATOR', ko: '제작', en: 'Creator' },
                { id: 'COLLECTOR', ko: '수집', en: 'Collector' },
                { id: 'SOCIAL', ko: '소셜', en: 'Social' },
                { id: 'MILESTONE', ko: '성장', en: 'Milestone' },
              ].map((filterItem) => (
                <Button
                  key={filterItem.id}
                  size="sm"
                  variant={missionFilter === filterItem.id ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => setMissionFilter(filterItem.id as typeof missionFilter)}
                >
                  {isEnglish ? filterItem.en : filterItem.ko}
                </Button>
              ))}
            </div>

            <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_36px_-26px_rgba(15,23,42,0.55)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{isEnglish ? 'Mission List' : '미션 목록'}</p>
                <span className="text-xs text-slate-500">
                  {filteredMissions.filter((mission) => mission.completed).length}/{filteredMissions.length}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                {filteredMissions.map((mission) => {
                const progressPct = Math.min(100, Math.round((mission.progress / Math.max(1, mission.target)) * 100));

                return (
                  <div key={mission.id} className="rounded-2xl border border-slate-200/80 bg-white/90 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {isEnglish ? mission.titleEn : mission.titleKo}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          {isEnglish ? mission.descriptionEn : mission.descriptionKo}
                        </p>
                      </div>
                      <Badge className={`rounded-full ${mission.completed ? 'bg-[#67c93a] text-[#102449]' : 'bg-slate-100 text-slate-700'}`}>
                        {mission.completed ? (isEnglish ? 'Done' : '완료') : (isEnglish ? 'In Progress' : '진행중')}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full transition-all ${mission.completed ? 'bg-[#67c93a]' : 'bg-[#1d8fff]'}`} style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>{mission.progress}/{mission.target}</span>
                      <span>
                        +{mission.reward.xp} XP
                        {mission.reward.badge ? ` · ${mission.reward.badge}` : ''}
                        {mission.reward.cosmetic ? ` · ${mission.reward.cosmetic}` : ''}
                      </span>
                    </div>
                    {!mission.completed ? (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="h-8 rounded-full px-3 text-[11px]"
                          onClick={() => router.push(mission.actionPath)}
                        >
                          {isEnglish ? mission.actionLabelEn : mission.actionLabelKo}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
                })}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
