'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { trackEvent } from '@/lib/analytics';

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const isEnglish = locale === 'en';
  const rawCallbackUrl = searchParams.get('callbackUrl');
  const callbackUrl = rawCallbackUrl && rawCallbackUrl.startsWith('/')
    ? rawCallbackUrl
    : '/';

  useEffect(() => {
    trackEvent('login_viewed', {
      callback_url: callbackUrl,
    });
  }, [callbackUrl]);

  useEffect(() => {
    if (session?.user) {
      trackEvent('login_completed', {
        callback_url: callbackUrl,
      });
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, session?.user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const error = new URLSearchParams(window.location.search).get('error');
    if (!error) {
      return;
    }

    if (error === 'OAuthAccountNotLinked') {
      toast.error(isEnglish
        ? 'Another sign-in method is already linked to this email.'
        : '같은 이메일의 다른 로그인 방식이 이미 연결되어 있습니다.');
      return;
    }

    toast.error(isEnglish ? 'Sign-in failed. Please try again.' : '로그인에 실패했습니다. 다시 시도해주세요.');
  }, [isEnglish]);

  if (session?.user) {
    return null;
  }

  return (
    <div className="rg-page flex items-center justify-center p-6">
      <div className="rg-glass-card w-full max-w-md rounded-[30px] p-8 text-center space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Running Go</p>
        <h1 className="text-2xl font-semibold text-slate-900">{isEnglish ? 'Sign in to Running Go' : '러닝고에 로그인'}</h1>
        <p className="text-sm text-slate-600">{isEnglish ? 'Sign in with Google to create and collect your own running courses.' : '구글 계정으로 로그인하고 나만의 코스를 만들고 수집하세요.'}</p>
        <Button
          onClick={async () => {
            if (isSigningIn) return;
            setIsSigningIn(true);
            trackEvent('login_started', {
              callback_url: callbackUrl,
            });
            await signIn('google', { callbackUrl });
          }}
          disabled={isSigningIn}
          className="rg-touch h-12 w-full rounded-2xl"
        >
          {isSigningIn ? (isEnglish ? 'Redirecting to sign-in...' : '로그인 이동 중...') : (isEnglish ? 'Sign in with Google' : 'Google로 로그인')}
        </Button>
      </div>
    </div>
  );
}
