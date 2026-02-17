import type { AppLocale } from '@/lib/i18n/constants';

export type MessageKey =
  | 'nav.home'
  | 'nav.collection'
  | 'nav.create'
  | 'nav.rankings'
  | 'nav.profile'
  | 'lang.ko'
  | 'lang.en';

const messages: Record<AppLocale, Record<MessageKey, string>> = {
  ko: {
    'nav.home': '홈',
    'nav.collection': '도감',
    'nav.create': '제작',
    'nav.rankings': '랭킹',
    'nav.profile': '프로필',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
  en: {
    'nav.home': 'Home',
    'nav.collection': 'Collection',
    'nav.create': 'Create',
    'nav.rankings': 'Rankings',
    'nav.profile': 'Profile',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
};

export const getMessages = (locale: AppLocale) => messages[locale];
