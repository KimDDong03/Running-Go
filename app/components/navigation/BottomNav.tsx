'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Map, Plus, Trophy, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '홈', icon: Activity, match: (path: string) => path === '/' },
  { href: '/courses', label: '탐색', icon: Map, match: (path: string) => path.startsWith('/courses') },
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
      className="fixed bottom-6 left-4 right-4 z-50 flex h-16 items-center justify-around rounded-full bg-white/80 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_20px_40px_-30px_rgba(15,23,42,0.55)] backdrop-blur border border-white/70"
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
              'flex h-12 w-12 flex-col items-center justify-center text-slate-400',
              isActive && 'text-primary',
              isCenter && 'h-14 w-14 -mt-4 rounded-full bg-primary text-white shadow-lg shadow-primary/40'
            )}
          >
            <Icon className={cn('h-6 w-6', isCenter && 'h-8 w-8')} />
            {!isCenter && <span className="mt-1 text-xs">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
