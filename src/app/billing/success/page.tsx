'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/components/providers/TRPCProvider';

function BillingSuccessPageContent() {
  const params = useSearchParams();
  const transactionId = params.get('transactionId');
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amountParam = params.get('amount');
  const amount = amountParam ? Number(amountParam) : NaN;
  const processedRef = useRef(false);
  const isInvalidParams = !transactionId || !paymentKey || !orderId || !Number.isFinite(amount);

  const confirmPayment = trpc.billing.confirmPayment.useMutation({
    onSuccess: (result) => {
      if (!result.alreadyProcessed) {
        toast.success('구독 결제가 완료되었습니다');
      }
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error('로그인이 필요합니다');
        return;
      }
      toast.error(error.message || '결제 승인에 실패했습니다');
    },
  });

  useEffect(() => {
    if (processedRef.current) return;
    if (isInvalidParams) {
      return;
    }

    processedRef.current = true;

    confirmPayment.mutate({
      transactionId,
      paymentKey,
      orderId,
      amount: Math.trunc(amount),
    });
  }, [amount, confirmPayment, isInvalidParams, orderId, paymentKey, transactionId]);

  const status: 'processing' | 'success' | 'failed' = isInvalidParams
    ? 'failed'
    : confirmPayment.isSuccess
      ? 'success'
      : confirmPayment.isError
        ? 'failed'
        : 'processing';

  return (
    <div className="rg-page flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-[30px]">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="text-4xl">{status === 'success' ? '🎉' : status === 'failed' ? '😥' : '⏳'}</div>

          {status === 'processing' && <h1 className="text-xl font-semibold text-slate-900">결제를 확인하는 중입니다</h1>}
          {status === 'success' && <h1 className="text-xl font-semibold text-slate-900">구독 결제가 완료되었습니다</h1>}
          {status === 'failed' && <h1 className="text-xl font-semibold text-slate-900">결제 확인에 실패했습니다</h1>}

          <div className="flex flex-col gap-2">
            <Link href="/profile">
              <Button size="lg" className="rg-touch w-full rounded-2xl">프로필로 이동</Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="rg-touch w-full rounded-2xl">홈으로</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="rg-page" />}>
      <BillingSuccessPageContent />
    </Suspense>
  );
}
