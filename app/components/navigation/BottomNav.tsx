'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map as MapIcon, Book, Plus, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';

const navItems = [
  { href: '/', labelKey: 'nav.home' as MessageKey, icon: MapIcon, match: (path: string) => path === '/' },
  { href: '/collection', labelKey: 'nav.collection' as MessageKey, icon: Book, match: (path: string) => path.startsWith('/collection') },
  { href: '/create', labelKey: 'nav.create' as MessageKey, icon: Plus, match: (path: string) => path.startsWith('/create') },
  { href: '/rankings', labelKey: 'nav.rankings' as MessageKey, icon: Trophy, match: (path: string) => path.startsWith('/rankings') },
  { href: '/profile', labelKey: 'nav.profile' as MessageKey, icon: User, match: (path: string) => path.startsWith('/profile') },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  if (pathname.startsWith('/run')) {
    return null;
  }

  if (pathname.startsWith('/courses/') && pathname !== '/courses') {
    return null;
  }

  if (pathname.startsWith('/create')) {
    return null;
  }

  if (pathname.startsWith('/billing')) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid h-[74px] w-full grid-cols-5 items-center border-t border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,252,255,0.9))] px-3 pb-[max(env(safe-area-inset-bottom),0.4rem)] shadow-[0_-18px_40px_-30px_rgba(15,23,42,0.72)] backdrop-blur-xl"
      aria-label="하단 내비게이션"
    >
      {navItems.map((item, index) => {
        const isActive = item.match(pathname);
        const Icon = item.icon;
        const isCenter = index === 2;

        return (
          <Link
              key={item.href}
              href={item.href}
              aria-label={t(item.labelKey)}
              className={cn(
                'rg-touch-icon rg-press group relative mx-auto flex h-12 min-w-[58px] items-center justify-center rounded-2xl px-2 text-slate-600 transition-all duration-300',
                isActive && !isCenter && 'bg-[linear-gradient(135deg,#e0f2fe_0%,#dbeafe_100%)] text-sky-800 shadow-[0_12px_24px_-18px_rgba(2,132,199,0.7)]',
                isCenter && 'border border-sky-100/90 bg-[linear-gradient(135deg,#f0f9ff_0%,#e0f2fe_100%)] text-sky-700 shadow-[0_14px_24px_-20px_rgba(14,116,144,0.75)] ring-1 ring-white/70',
                isCenter && isActive && 'bg-[linear-gradient(135deg,#e0f2fe_0%,#dbeafe_100%)] text-sky-800 shadow-[0_16px_26px_-18px_rgba(2,132,199,0.62)]'
            )}
          >
            {!isCenter && (
              <span
                className={cn(
                  'absolute inset-x-2 bottom-0 h-8 rounded-xl bg-gradient-to-r from-sky-100/0 via-sky-100/70 to-cyan-100/0 opacity-0 transition-all duration-300',
                  isActive && 'opacity-100'
                )}
              />
            )}
            <Icon className={cn('relative h-5 w-5 transition-transform duration-300 group-hover:scale-110', !isCenter && isActive && 'scale-110')} />
            {!isCenter && (
              <span className={cn('relative mt-5 text-[11px] font-semibold tracking-tight', isActive ? 'text-sky-800' : 'text-slate-600')}>
                {t(item.labelKey)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
