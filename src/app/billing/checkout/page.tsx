'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/components/providers/TRPCProvider';

type TossPaymentsInstance = {
  requestPayment: (
    method: '카드',
    options: {
      amount: number;
      orderId: string;
      orderName: string;
      successUrl: string;
      failUrl: string;
      customerName?: string;
      customerEmail?: string;
    }
  ) => Promise<void>;
};

type TossPaymentsFactory = (clientKey: string) => TossPaymentsInstance;

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

function BillingCheckoutPageContent() {
  const params = useSearchParams();
  const transactionId = params.get('transactionId');
  const [isSdkReady, setIsSdkReady] = useState(
    () => typeof window !== 'undefined' && Boolean(window.TossPayments)
  );

  const { data, isLoading, isError, error } = trpc.billing.checkoutSession.useQuery(
    { transactionId: transactionId ?? '' },
    { enabled: Boolean(transactionId) }
  );

  useEffect(() => {
    if (!data?.clientKey || isSdkReady) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.async = true;
    script.onload = () => setIsSdkReady(true);
    script.onerror = () => {
      toast.error('결제 모듈을 불러오지 못했습니다');
      setIsSdkReady(false);
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [data?.clientKey, isSdkReady]);

  const canStartPayment = useMemo(() => {
    return Boolean(data && isSdkReady && !isLoading && !isError);
  }, [data, isError, isLoading, isSdkReady]);

  const handleStartPayment = async () => {
    if (!data) return;

    if (!window.TossPayments) {
      toast.error('결제 모듈이 준비되지 않았습니다');
      return;
    }

    try {
      const tossPayments = window.TossPayments(data.clientKey);
      await tossPayments.requestPayment('카드', {
        amount: data.amount,
        orderId: data.orderId,
        orderName: data.orderName,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        successUrl: data.successUrl,
        failUrl: data.failUrl,
      });
    } catch {
      toast.error('결제를 시작하지 못했습니다');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/80 shadow-[0_26px_50px_-32px_rgba(15,23,42,0.6)]">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">구독 결제</h1>

          {!transactionId && (
            <p className="text-sm text-red-500">유효한 결제 요청이 아닙니다.</p>
          )}

          {isLoading && <p className="text-sm text-slate-500">결제 정보를 준비하는 중...</p>}

          {isError && (
            <p className="text-sm text-red-500">
              {error?.data?.code === 'UNAUTHORIZED'
                ? '로그인이 필요합니다'
                : error?.message || '결제 정보를 불러오지 못했습니다'}
            </p>
          )}

          {data && (
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 space-y-1">
              <div className="text-sm text-slate-500">결제 항목</div>
              <div className="font-semibold text-slate-900">{data.orderName}</div>
              <div className="text-sm text-slate-600">{data.amount.toLocaleString('ko-KR')}원</div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full rounded-2xl"
              onClick={handleStartPayment}
              disabled={!canStartPayment}
            >
              결제 진행하기
            </Button>
            <Link href="/profile">
              <Button size="lg" variant="outline" className="w-full rounded-2xl">프로필로 돌아가기</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingCheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)]" />}>
      <BillingCheckoutPageContent />
    </Suspense>
  );
}
