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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] p-6">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">로그인</h1>
        <Button onClick={() => signIn('google')} className="rounded-full">Google로 로그인</Button>
      </div>
    </div>
  );
}
