'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map, Book, Plus, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '홈', icon: Map, match: (path: string) => path === '/' },
  { href: '/collection', label: '도감', icon: Book, match: (path: string) => path.startsWith('/collection') },
  { href: '/create', label: '제작', icon: Plus, match: (path: string) => path.startsWith('/create') },
  { href: '/rankings', label: '랭킹', icon: Trophy, match: (path: string) => path.startsWith('/rankings') },
  { href: '/profile', label: '프로필', icon: User, match: (path: string) => path.startsWith('/profile') },
];

export function BottomNav() {
  const pathname = usePathname();

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
      className="fixed left-4 right-4 z-50 mx-auto flex h-[74px] w-[min(720px,calc(100vw-2rem))] items-center justify-between rounded-[28px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,252,255,0.88))] px-3 pb-[max(env(safe-area-inset-bottom),0.4rem)] shadow-[0_28px_58px_-34px_rgba(15,23,42,0.72)] ring-1 ring-sky-100/70 backdrop-blur-xl"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
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
            className={cn(
              'rg-touch-icon rg-press group relative flex h-12 min-w-[58px] items-center justify-center rounded-2xl px-2 text-slate-600 transition-all duration-300',
              isActive && !isCenter && 'bg-[linear-gradient(135deg,#e0f2fe_0%,#dbeafe_100%)] text-sky-800 shadow-[0_12px_24px_-18px_rgba(2,132,199,0.7)]',
              isCenter && 'h-14 min-w-[64px] -mt-7 rounded-2xl bg-[linear-gradient(135deg,#0ea5e9_0%,#0284c7_100%)] text-white shadow-[0_18px_32px_-20px_rgba(14,165,233,0.95)]',
              isCenter && isActive && 'scale-[1.03]'
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
            <Icon className={cn('relative h-5 w-5 transition-transform duration-300 group-hover:scale-110', !isCenter && isActive && 'scale-110', isCenter && 'h-6 w-6')} />
            {!isCenter && (
              <span className={cn('relative mt-5 text-[11px] font-semibold tracking-tight', isActive ? 'text-sky-800' : 'text-slate-600')}>
                {item.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
