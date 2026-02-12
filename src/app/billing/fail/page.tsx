'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { trpc } from '@/components/providers/TRPCProvider';

function BillingFailPageContent() {
  const params = useSearchParams();
  const transactionId = params.get('transactionId');
  const message = params.get('message');
  const code = params.get('code');
  const markFailedRef = useRef(false);

  const markCheckoutFailed = trpc.billing.markCheckoutFailed.useMutation({
    onError: () => {
      // Fail page itself should remain usable even if tracking update fails.
    },
  });

  useEffect(() => {
    if (markFailedRef.current) return;
    if (!transactionId) return;

    markFailedRef.current = true;
    markCheckoutFailed.mutate({
      transactionId,
      reason: message ?? code ?? undefined,
    });
  }, [code, markCheckoutFailed, message, transactionId]);

  useEffect(() => {
    if (message) {
      toast.error(message);
    }
  }, [message]);

  return (
    <div className="rg-page flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-[30px]">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="text-4xl">😥</div>
          <h1 className="text-xl font-semibold text-slate-900">결제가 완료되지 않았습니다</h1>
          <p className="text-sm text-slate-600">{message ?? '결제 진행 중 문제가 발생했습니다. 다시 시도해주세요.'}</p>
          {code && <p className="text-xs text-slate-500">오류 코드: {code}</p>}

          <div className="flex flex-col gap-2">
            <Link href="/profile">
              <Button size="lg" className="rg-touch w-full rounded-2xl">다시 시도하기</Button>
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

export default function BillingFailPage() {
  return (
    <Suspense fallback={<div className="rg-page" />}>
      <BillingFailPageContent />
    </Suspense>
  );
}
