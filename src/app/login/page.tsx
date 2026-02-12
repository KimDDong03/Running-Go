'use client';

import { useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user) {
      router.replace('/profile');
    }
  }, [router, session?.user]);

  if (session?.user) {
    return null;
  }

  return (
    <div className="rg-page flex items-center justify-center p-6">
      <div className="rg-glass-card w-full max-w-md rounded-[30px] p-8 text-center space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Running Go</p>
        <h1 className="text-2xl font-semibold text-slate-900">러닝고에 로그인</h1>
        <p className="text-sm text-slate-600">구글 계정으로 로그인하고 나만의 코스를 만들고 수집하세요.</p>
        <Button onClick={() => signIn('google')} className="rg-touch h-12 w-full rounded-2xl">Google로 로그인</Button>
      </div>
    </div>
  );
}
