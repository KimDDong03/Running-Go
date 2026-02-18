'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { trpc } from '@/components/providers/TRPCProvider';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { trackEvent } from '@/lib/analytics';

function RunResultPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { locale } = useLocale();
  const isEnglish = locale === 'en';
  const isCollected = params.get('isCollected') === 'true';
  const matchRate = params.get('matchRate');
  const reason = params.get('reason');
  const courseId = params.get('courseId');
  const runSessionId = params.get('runSessionId');
  const { data: runSession, isError, error } = trpc.runSession.byId.useQuery(
    { id: runSessionId ?? '' },
    { enabled: Boolean(runSessionId) }
  );

  const formatPredictedDuration = (minutes: number) => {
    const rounded = Math.max(1, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const remainMinutes = rounded % 60;

    if (hours <= 0) return isEnglish ? `${remainMinutes}m` : `${remainMinutes}분`;
    return isEnglish ? `${hours}h ${remainMinutes}m` : `${hours}시간 ${remainMinutes}분`;
  };

  const numericMatchRate = Number(matchRate ?? runSession?.matchRate ?? 0);
  const canRenderRunResultAd = Boolean(runSession) && !isError;

  const trainingFocus = numericMatchRate < 80
    ? (isEnglish ? 'Route tracking accuracy run' : '코스 추적 정확도 개선 러닝')
    : (runSession?.pace ?? 0) <= 5.5
      ? (isEnglish ? 'Pace maintenance intervals' : '페이스 유지 인터벌')
      : (isEnglish ? 'Endurance long run' : '지구력 강화 롱런');

  useEffect(() => {
    if (!runSessionId && !courseId) return;

    trackEvent('run_result_viewed', {
      run_session_id: runSessionId ?? 'none',
      course_id: courseId ?? 'none',
      is_collected: isCollected,
      match_rate: Number(matchRate ?? runSession?.matchRate ?? 0),
      has_error: isError,
    });
  }, [courseId, isCollected, isError, matchRate, runSession?.matchRate, runSessionId]);

  return (
    <div className="rg-page flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-[30px]">
        <CardContent className="p-6 text-center space-y-4">
          <div className="text-4xl">{isCollected ? '🎉' : '😅'}</div>
          <h1 className="text-xl font-bold">
            {isCollected ? (isEnglish ? 'Collected' : '수집 성공') : (isEnglish ? 'Not Collected' : '수집 실패')}
          </h1>
          <div className="text-slate-600">{isEnglish ? 'Match rate' : '매칭률'}: {matchRate ?? '0'}%</div>
          {runSession && (
            <div className="text-sm text-slate-600">
              {isEnglish
                ? `Distance ${runSession.distance.toFixed(2)}km · Time ${Math.floor(runSession.duration / 60)}m · Pace ${runSession.pace.toFixed(2)}`
                : `거리 ${runSession.distance.toFixed(2)}km · 시간 ${Math.floor(runSession.duration / 60)}분 · 페이스 ${runSession.pace.toFixed(2)}`}
            </div>
          )}
          {runSession && (
            <div className="rg-soft-panel p-4 text-left space-y-2">
              <div className="text-sm font-semibold text-slate-900">{isEnglish ? 'Advanced Running Report' : '고급 러닝 리포트'}</div>
              <div className="text-sm text-slate-600">
                {isEnglish ? 'Predicted 5K' : '예상 5K 기록'}: {formatPredictedDuration(runSession.pace * 5)}
              </div>
              <div className="text-sm text-slate-600">
                {isEnglish ? 'Predicted 10K' : '예상 10K 기록'}: {formatPredictedDuration(runSession.pace * 10)}
              </div>
              <div className="text-sm text-slate-600">
                {isEnglish ? 'Suggested training' : '추천 훈련'}: {trainingFocus}
              </div>
            </div>
          )}
          {reason && <div className="text-sm text-slate-500">{reason}</div>}
          {isError && (
            <div className="text-sm text-red-500">
              {error?.data?.code === 'UNAUTHORIZED'
                ? (isEnglish ? 'Sign-in is required.' : '로그인이 필요합니다')
                : (isEnglish ? 'Failed to load run result.' : '결과 데이터를 불러오지 못했습니다')}
            </div>
          )}
          {error?.data?.code === 'UNAUTHORIZED' && (
            <Link href="/login">
              <Button size="lg" className="w-full rounded-2xl">{isEnglish ? 'Sign in' : '로그인'}</Button>
            </Link>
          )}
          {canRenderRunResultAd ? (
            <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
          ) : null}
          <div className="flex flex-col gap-2">
            {isCollected && (
                <Button
                  size="lg"
                  className="rg-touch w-full rounded-2xl"
                  onClick={() => {
                    trackEvent('collection_opened_from_result', {
                      run_session_id: runSessionId ?? 'none',
                      course_id: courseId ?? 'none',
                    });
                    router.replace('/collection');
                  }}
                >
                {isEnglish ? 'Open Collection' : '내 도감 보기'}
              </Button>
            )}
            {courseId && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rg-touch w-full rounded-2xl"
                  onClick={() => router.replace(`/run?courseId=${courseId}`)}
                >
                {isEnglish ? 'Run Again' : '다시 달리기'}
              </Button>
            )}
            {!isCollected && (
              <Link href="/?sort=NEAREST&showMarkers=1">
                <Button size="lg" variant="outline" className="rg-touch w-full rounded-2xl border-emerald-200 text-emerald-700">
                  {isEnglish ? 'Find Easier Nearby Course' : '가까운 쉬운 코스 찾기'}
                </Button>
              </Link>
            )}
            <Link href="/">
              <Button size="lg" variant="outline" className="rg-touch w-full rounded-2xl">{isEnglish ? 'Home' : '홈으로'}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RunResultPage() {
  return (
    <Suspense fallback={<div className="rg-page" />}>
      <RunResultPageContent />
    </Suspense>
  );
}
