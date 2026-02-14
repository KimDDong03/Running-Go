'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (session?.user) {
      router.replace('/profile');
    }
  }, [router, session?.user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const error = new URLSearchParams(window.location.search).get('error');
    if (!error) {
      return;
    }

    if (error === 'OAuthAccountNotLinked') {
      toast.error('같은 이메일의 다른 로그인 방식이 이미 연결되어 있습니다.');
      return;
    }

    toast.error('로그인에 실패했습니다. 다시 시도해주세요.');
  }, []);

  if (session?.user) {
    return null;
  }

  return (
    <div className="rg-page flex items-center justify-center p-6">
      <div className="rg-glass-card w-full max-w-md rounded-[30px] p-8 text-center space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Running Go</p>
        <h1 className="text-2xl font-semibold text-slate-900">러닝고에 로그인</h1>
        <p className="text-sm text-slate-600">구글 계정으로 로그인하고 나만의 코스를 만들고 수집하세요.</p>
        <Button
          onClick={async () => {
            if (isSigningIn) return;
            setIsSigningIn(true);
            await signIn('google', { callbackUrl: '/profile' });
          }}
          disabled={isSigningIn}
          className="rg-touch h-12 w-full rounded-2xl"
        >
          {isSigningIn ? '로그인 이동 중...' : 'Google로 로그인'}
        </Button>
      </div>
    </div>
  );
}
