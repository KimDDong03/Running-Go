'use client';

import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALE_COOKIE_KEY, type AppLocale } from '@/lib/i18n/constants';
import { useLocale } from '@/app/components/providers/LocaleProvider';

const LOCALE_ORDER: AppLocale[] = ['ko', 'en'];

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useLocale();

  const currentIndex = LOCALE_ORDER.indexOf(locale);
  const nextLocale = LOCALE_ORDER[(currentIndex + 1) % LOCALE_ORDER.length];

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="fixed right-3 top-3 z-[70] h-9 rounded-full border-white/80 bg-white/92 px-3 text-xs shadow-[0_12px_24px_-18px_rgba(15,23,42,0.7)]"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE_KEY}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      aria-label={`Switch language to ${t(nextLocale === 'ko' ? 'lang.ko' : 'lang.en')}`}
    >
      <Globe className="mr-1.5 h-3.5 w-3.5" />
      {t(locale === 'ko' ? 'lang.ko' : 'lang.en')}
    </Button>
  );
}
