import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE_KEY, isSupportedLocale, type AppLocale } from '@/lib/i18n/constants';

const parseAcceptLanguage = (acceptLanguage: string | null): AppLocale | null => {
  if (!acceptLanguage) return null;
  const normalized = acceptLanguage.toLowerCase();
  if (normalized.includes('ko')) return 'ko';
  if (normalized.includes('en')) return 'en';
  return null;
};

export const resolveRequestLocale = async (): Promise<AppLocale> => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value;
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  return parseAcceptLanguage(headerStore.get('accept-language')) ?? 'ko';
};
