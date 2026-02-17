'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppLocale } from '@/lib/i18n/constants';
import type { MessageKey } from '@/lib/i18n/messages';

type LocaleContextValue = {
  locale: AppLocale;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = {
  locale: AppLocale;
  messages: Record<MessageKey, string>;
  children: ReactNode;
};

export function LocaleProvider({ locale, messages, children }: LocaleProviderProps) {
  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale,
      t: (key) => messages[key] ?? key,
    };
  }, [locale, messages]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}
