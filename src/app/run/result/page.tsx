'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/components/providers/TRPCProvider';

function RunResultPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthed = sessionStatus === 'authenticated';
  const isCollected = params.get('isCollected') === 'true';
  const matchRate = params.get('matchRate');
  const reason = params.get('reason');
  const courseId = params.get('courseId');
  const runSessionId = params.get('runSessionId');
  const { data: runSession, isError, error } = trpc.runSession.byId.useQuery(
    { id: runSessionId ?? '' },
    { enabled: Boolean(runSessionId) }
  );
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = trpc.billing.subscriptionStatus.useQuery(
    undefined,
    {
      enabled: isAuthed,
      retry: false,
    }
  );

  const hasProEntitlement = Boolean(
    subscriptionData?.entitlements.some((entitlement) => entitlement.type === 'PRO')
      || subscriptionData?.subscription
  );

  const formatPredictedDuration = (minutes: number) => {
    const rounded = Math.max(1, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const remainMinutes = rounded % 60;

    if (hours <= 0) return `${remainMinutes}분`;
    return `${hours}시간 ${remainMinutes}분`;
  };

  const numericMatchRate = Number(matchRate ?? runSession?.matchRate ?? 0);

  const trainingFocus = numericMatchRate < 80
    ? '코스 추적 정확도 개선 러닝'
    : (runSession?.pace ?? 0) <= 5.5
      ? '페이스 유지 인터벌'
      : '지구력 강화 롱런';

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/80 shadow-[0_26px_50px_-32px_rgba(15,23,42,0.6)]">
        <CardContent className="p-6 text-center space-y-4">
          <div className="text-4xl">{isCollected ? '🎉' : '😅'}</div>
          <h1 className="text-xl font-bold">
            {isCollected ? '수집 성공' : '수집 실패'}
          </h1>
          <div className="text-slate-600">매칭률: {matchRate ?? '0'}%</div>
          {runSession && (
            <div className="text-sm text-slate-600">
              거리 {runSession.distance.toFixed(2)}km · 시간 {Math.floor(runSession.duration / 60)}분 · 페이스 {runSession.pace.toFixed(2)}
            </div>
          )}
          {runSession && (
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-left space-y-2">
              <div className="text-sm font-semibold text-slate-900">프로 고급 리포트</div>
              {isSubscriptionLoading && isAuthed ? (
                <div className="text-sm text-slate-500">구독 상태를 확인하는 중...</div>
              ) : hasProEntitlement ? (
                <>
                  <div className="text-sm text-slate-600">
                    예상 5K 기록: {formatPredictedDuration(runSession.pace * 5)}
                  </div>
                  <div className="text-sm text-slate-600">
                    예상 10K 기록: {formatPredictedDuration(runSession.pace * 10)}
                  </div>
                  <div className="text-sm text-slate-600">
                    추천 훈련: {trainingFocus}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">프로 구독 시 예상 기록과 맞춤 훈련 제안을 제공합니다.</div>
                  <Link href="/profile">
                    <Button size="sm" variant="outline" className="rounded-xl">프로 구독 보기</Button>
                  </Link>
                </div>
              )}
            </div>
          )}
          {reason && <div className="text-sm text-slate-500">{reason}</div>}
          {isError && (
            <div className="text-sm text-red-500">
              {error?.data?.code === 'UNAUTHORIZED'
                ? '로그인이 필요합니다'
                : '결과 데이터를 불러오지 못했습니다'}
            </div>
          )}
          {error?.data?.code === 'UNAUTHORIZED' && (
            <Link href="/login">
              <Button size="lg" className="w-full rounded-2xl">로그인</Button>
            </Link>
          )}
          <div className="flex flex-col gap-2">
            {isCollected && (
              <Button
                size="lg"
                className="w-full rounded-2xl"
                onClick={() => router.replace('/collection')}
              >
                내 도감 보기
              </Button>
            )}
            {courseId ? (
              <Button
                size="lg"
                variant="outline"
                className="w-full rounded-2xl"
                onClick={() => router.replace(`/run?courseId=${courseId}`)}
              >
                다시 달리기
              </Button>
            ) : (
              <Link href="/">
                <Button size="lg" variant="outline" className="w-full rounded-2xl">홈으로</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RunResultPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)]" />}>
      <RunResultPageContent />
    </Suspense>
  );
}
