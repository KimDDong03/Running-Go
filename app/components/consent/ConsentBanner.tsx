'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/app/components/providers/LocaleProvider';

const CONSENT_COOKIE_KEY = 'rg-consent';

const setConsent = (value: 'granted' | 'denied') => {
  document.cookie = `${CONSENT_COOKIE_KEY}=${value}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event('rg-consent-changed'));
};

const getConsent = () => {
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE_KEY}=`));
  if (!cookie) return null;
  const value = cookie.split('=')[1];
  return value === 'granted' || value === 'denied' ? value : null;
};

export function ConsentBanner() {
  const { locale } = useLocale();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(getConsent() === null);
  }, []);

  if (!isVisible) {
    return null;
  }

  const copy = locale === 'ko'
    ? {
        title: '쿠키 및 광고 동의',
        description: '맞춤 언어 설정과 광고 표시를 위해 쿠키를 사용합니다. 자세한 내용은 정책 페이지에서 확인할 수 있어요.',
        accept: '동의',
        reject: '거부',
        privacy: '개인정보처리방침',
        cookies: '쿠키 정책',
      }
    : {
        title: 'Cookie and Ads Consent',
        description: 'We use cookies for language preferences and advertising display. Please review details in our policy pages.',
        accept: 'Accept',
        reject: 'Reject',
        privacy: 'Privacy Policy',
        cookies: 'Cookie Policy',
      };

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-[80] mx-auto w-[min(880px,calc(100vw-2rem))] rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_24px_48px_-32px_rgba(15,23,42,0.72)] backdrop-blur-xl">
      <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{copy.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Link href="/privacy" className="underline underline-offset-2">{copy.privacy}</Link>
        <Link href="/cookies" className="underline underline-offset-2">{copy.cookies}</Link>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setConsent('denied');
            setIsVisible(false);
          }}
        >
          {copy.reject}
        </Button>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => {
            setConsent('granted');
            setIsVisible(false);
          }}
        >
          {copy.accept}
        </Button>
      </div>
    </aside>
  );
}
