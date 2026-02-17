'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALE_COOKIE_KEY, type AppLocale } from '@/lib/i18n/constants';
import { useLocale } from '@/app/components/providers/LocaleProvider';

const LOCALE_ORDER: AppLocale[] = ['ko', 'en'];

export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useLocale();

  if (pathname.startsWith('/create')) {
    return null;
  }

  const currentIndex = LOCALE_ORDER.indexOf(locale);
  const nextLocale = LOCALE_ORDER[(currentIndex + 1) % LOCALE_ORDER.length];
  const nextLocaleLabel = t(nextLocale === 'ko' ? 'lang.ko' : 'lang.en');

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="fixed right-3 top-[max(env(safe-area-inset-top),0.75rem)] z-[90] h-9 rounded-full border-white/80 bg-white/92 px-3 text-xs shadow-[0_12px_24px_-18px_rgba(15,23,42,0.7)]"
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE_KEY}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      aria-label={`Switch language to ${nextLocaleLabel}`}
    >
      <Globe className="mr-1.5 h-3.5 w-3.5" />
      {nextLocaleLabel}
    </Button>
  );
}
