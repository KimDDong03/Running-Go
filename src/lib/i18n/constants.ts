export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_COOKIE_KEY = 'rg-locale';

export const isSupportedLocale = (value: string): value is AppLocale => {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
};

export const normalizeLocale = (value: string | null | undefined): AppLocale => {
  if (value && isSupportedLocale(value)) {
    return value;
  }
  return 'ko';
};
