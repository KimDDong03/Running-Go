'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { getTier } from '@/lib/tier';
import { ChevronLeft } from 'lucide-react';

export default function ProfilePage() {
  const { status: sessionStatus } = useSession();
  const isAuthed = sessionStatus === 'authenticated';
  const { data, isLoading, isError, refetch } = trpc.profile.summary.useQuery();
  const {
    data: planData,
    isLoading: isPlanLoading,
    isError: isPlanError,
    error: planError,
    refetch: refetchPlans,
  } = trpc.billing.listPlans.useQuery(undefined, {
    retry: false,
  });
  const {
    data: subscriptionData,
    refetch: refetchSubscription,
    isLoading: isSubscriptionLoading,
  } = trpc.billing.subscriptionStatus.useQuery(undefined, {
    enabled: isAuthed,
    retry: false,
  });
  const createCheckout = trpc.billing.createCheckout.useMutation({
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error('로그인이 필요합니다');
        return;
      }
      if (error.data?.code === 'CONFLICT') {
        toast.error('이미 구독 중인 요금제입니다');
        return;
      }
      if (error.data?.code === 'PRECONDITION_FAILED') {
        toast.error('결제 시스템 설정이 아직 완료되지 않았습니다');
        return;
      }
      toast.error(error.message || '결제를 시작하지 못했습니다');
    },
  });
  const cancelSubscription = trpc.billing.cancelSubscription.useMutation({
    onSuccess: async (result) => {
      toast.success(result.canceledImmediately ? '구독을 즉시 해지했습니다' : '다음 결제일부터 구독이 해지됩니다');
      await refetchSubscription();
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error('로그인이 필요합니다');
        return;
      }
      toast.error(error.message || '구독 해지에 실패했습니다');
    },
  });
  const tier = data?.tier ?? getTier(0);
  const nextTierRemaining = tier.nextThreshold
    ? Math.max(0, tier.nextThreshold - (data?.stats.collectedCourses ?? 0))
    : 0;

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs <= 0) return `${mins}분`;
    return `${hrs}시간 ${mins}분`;
  };

  const formatPrice = (priceKrw: number) => {
    return `${priceKrw.toLocaleString('ko-KR')}원`;
  };

  const handleCheckout = async (planCode: string) => {
    try {
      const origin = window.location.origin;
      const result = await createCheckout.mutateAsync({
        planCode,
        successUrl: `${origin}/billing/success`,
        cancelUrl: `${origin}/billing/fail`,
      });

      window.location.assign(result.checkoutUrl);
    } catch {
      // handled by onError
    }
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
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">프로필</h1>
        </div>
      </header>

      <main className="rg-page-main rg-stagger p-4 space-y-4">
        {isError && (
          <ErrorState
            title="프로필을 불러오지 못했습니다"
            message="잠시 후 다시 시도해주세요"
            actionLabel="다시 시도"
            onAction={() => refetch()}
          />
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm text-slate-500">현재 계정</div>
              <div className="text-xl font-semibold text-slate-900">
                {isLoading ? '불러오는 중...' : data?.user.name}
              </div>
              {data?.user.isGuest && (
                <div className="text-sm text-slate-500">
                  게스트 모드로 이용 중입니다. 로그인하면 기기 변경 시에도 기록을 보존할 수 있어요.
                </div>
              )}
              <div className="flex items-center gap-3 rounded-2xl bg-white/80 border border-white/70 p-3">
                <div className="text-2xl" aria-label="티어 아이콘">{tier.icon}</div>
                <div>
                  <div className="text-sm text-slate-500">내 티어</div>
                  <div className="text-base font-semibold text-slate-900">{tier.name}</div>
                  {tier.nextThreshold && (
                    <div className="text-xs text-slate-500">
                      다음 티어까지 {nextTierRemaining}개
                    </div>
                  )}
                </div>
              </div>
              {data?.user.isGuest && (
                <div>
                  <Link href="/login">
                    <Button className="rg-touch rg-press rounded-full">로그인</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">프로 구독</h2>
                {isAuthed && subscriptionData?.subscription && (
                  <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-2 py-1">구독 중</span>
                )}
              </div>

              {!isAuthed && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">프로 구독은 로그인 후 이용할 수 있습니다.</p>
                  <Link href="/login">
                    <Button className="rg-touch rg-press rounded-full">로그인 후 구독하기</Button>
                  </Link>
                </div>
              )}

              {isAuthed && isSubscriptionLoading && (
                <p className="text-sm text-slate-500">구독 정보를 불러오는 중...</p>
              )}

              {isAuthed && !isSubscriptionLoading && subscriptionData?.subscription && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                    <div className="text-sm text-slate-500">현재 플랜</div>
                    <div className="mt-1 text-base font-semibold text-slate-900">
                      {subscriptionData.subscription.plan.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatPrice(subscriptionData.subscription.plan.priceKrw)} · {subscriptionData.subscription.plan.interval === 'MONTHLY' ? '월간' : '연간'}
                    </div>
                    {subscriptionData.subscription.currentPeriodEnd && (
                      <div className="mt-1 text-xs text-slate-500">
                        다음 갱신일: {new Date(subscriptionData.subscription.currentPeriodEnd).toLocaleDateString('ko-KR')}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="rg-touch rg-press rounded-full"
                    disabled={cancelSubscription.isPending}
                    onClick={() => cancelSubscription.mutate({ immediate: false })}
                  >
                    {cancelSubscription.isPending ? '처리 중...' : '구독 해지'}
                  </Button>
                </div>
              )}

              {isAuthed && !isSubscriptionLoading && !subscriptionData?.subscription && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">프로 기능을 구독하고 고급 리포트를 확인해보세요.</p>
                  {isPlanLoading ? (
                    <p className="text-sm text-slate-500">요금제를 불러오는 중...</p>
                  ) : isPlanError ? (
                    <div className="space-y-2">
                      <p className="text-sm text-red-500">요금제 정보를 불러오지 못했습니다.</p>
                      <p className="text-xs text-slate-500">{planError?.message}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rg-touch rg-press rounded-full"
                        onClick={() => {
                          void refetchPlans();
                        }}
                      >
                        다시 시도
                      </Button>
                    </div>
                  ) : !planData?.plans.length ? (
                    <p className="text-sm text-slate-500">현재 구독 가능한 요금제가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {planData?.plans.map((plan) => (
                        <div key={plan.id} className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{plan.name}</div>
                            <div className="text-xs text-slate-500">
                              {formatPrice(plan.priceKrw)} · {plan.interval === 'MONTHLY' ? '월간' : plan.interval === 'YEARLY' ? '연간' : '일회성'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="rg-touch rg-press rounded-full"
                            disabled={createCheckout.isPending}
                            onClick={() => {
                              void handleCheckout(plan.code);
                            }}
                          >
                            구독
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500">제작 코스</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.createdCourses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">수집 코스</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.collectedCourses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">러닝 횟수</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.runCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">누적 시간</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : formatDuration(data?.stats.totalDuration ?? 0)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white/80 border border-white/70 p-4 text-center">
                <div className="text-xs text-slate-500">누적 거리</div>
                <div className="text-3xl font-semibold text-slate-900">
                  {isLoading ? '-' : `${(data?.stats.totalDistance ?? 0).toFixed(1)}km`}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">내가 만든 코스</h2>
                <span className="text-xs text-slate-500">최근 3개</span>
              </div>
              {data?.createdCoursePreview?.length ? (
                <div className="space-y-3">
                  {data.createdCoursePreview.map((course) => (
                    <Link key={course.id} href={`/courses/${course.id}`}>
                      <div className="rg-interactive-card flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{course.title}</div>
                          <div className="text-xs text-slate-500">{course.totalDistance.toFixed(1)}km · ❤️ {course.likeCount}</div>
                        </div>
                        <span className="text-xs text-slate-400">보기</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">아직 만든 코스가 없습니다</div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
