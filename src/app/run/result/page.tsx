'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const [isSharing, setIsSharing] = useState(false);
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
  const trainingFocus = numericMatchRate < 80
    ? (isEnglish ? 'Route tracking accuracy run' : '코스 추적 정확도 개선 러닝')
    : (runSession?.pace ?? 0) <= 5.5
      ? (isEnglish ? 'Pace maintenance intervals' : '페이스 유지 인터벌')
      : (isEnglish ? 'Endurance long run' : '지구력 강화 롱런');
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin;
    return courseId ? `${base}/?focusCourseId=${courseId}` : `${base}/`;
  }, [courseId]);
  const shareText = useMemo(() => {
    const titleLine = isCollected
      ? (isEnglish ? 'I collected a Running Go course!' : '러닝고 코스 수집 성공!')
      : (isEnglish ? 'I just finished a run on Running Go!' : '러닝고에서 러닝 완료!');
    const metrics = runSession
      ? (isEnglish
        ? `Match ${numericMatchRate.toFixed(0)}% · ${runSession.distance.toFixed(2)}km · Pace ${runSession.pace.toFixed(2)}`
        : `매칭률 ${numericMatchRate.toFixed(0)}% · ${runSession.distance.toFixed(2)}km · 페이스 ${runSession.pace.toFixed(2)}`)
      : (isEnglish ? `Match ${numericMatchRate.toFixed(0)}%` : `매칭률 ${numericMatchRate.toFixed(0)}%`);
    return `${titleLine}\n${metrics}\n#RunningGo #러닝고\n${shareUrl}`;
  }, [isCollected, isEnglish, numericMatchRate, runSession, shareUrl]);

  const handleSystemShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        toast.success(isEnglish ? 'Share text copied.' : '공유 문구를 복사했습니다');
        return;
      }
      toast.error(isEnglish ? 'Sharing is unavailable on this device.' : '이 기기에서는 공유 기능을 사용할 수 없습니다');
      return;
    }
    try {
      setIsSharing(true);
      await navigator.share({
        title: isEnglish ? 'Running Go Result' : '러닝고 결과',
        text: shareText,
        url: shareUrl,
      });
      trackEvent('run_result_shared', {
        channel: 'system',
        is_collected: isCollected,
        course_id: courseId ?? 'none',
      });
    } catch {
      // user cancellation or unsupported target
    } finally {
      setIsSharing(false);
    }
  };

  const handleKakaoShare = async () => {
    if (!shareUrl) return;
    const kakaoUrl = `https://story.kakao.com/share?url=${encodeURIComponent(shareUrl)}`;
    window.open(kakaoUrl, '_blank', 'noopener,noreferrer');
    trackEvent('run_result_shared', {
      channel: 'kakao',
      is_collected: isCollected,
      course_id: courseId ?? 'none',
    });
  };

  const handleInstagramShare = async () => {
    try {
      if (!navigator.clipboard) {
        toast.error(isEnglish ? 'Clipboard is unavailable.' : '클립보드 기능을 사용할 수 없습니다');
        return;
      }
      await navigator.clipboard.writeText(shareText);
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      toast.success(
        isEnglish
          ? 'Caption copied. Paste it on Instagram.'
          : '문구를 복사했습니다. 인스타그램에 붙여넣어 공유하세요'
      );
      trackEvent('run_result_shared', {
        channel: 'instagram_copy',
        is_collected: isCollected,
        course_id: courseId ?? 'none',
      });
    } catch {
      toast.error(isEnglish ? 'Failed to prepare Instagram share.' : '인스타 공유 준비에 실패했습니다');
    }
  };

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
          <div className="flex flex-col gap-2">
            {isCollected && (
              <>
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-2xl"
                    onClick={() => {
                      void handleSystemShare();
                    }}
                    disabled={isSharing}
                  >
                    {isEnglish ? 'Share' : '공유하기'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => {
                      void handleKakaoShare();
                    }}
                  >
                    {isEnglish ? 'Kakao' : '카카오 공유'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => {
                      void handleInstagramShare();
                    }}
                  >
                    {isEnglish ? 'Instagram' : '인스타 공유'}
                  </Button>
                </div>
              </>
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
                <Button size="lg" variant="secondary" className="rg-touch w-full rounded-2xl">
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
