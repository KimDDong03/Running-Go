import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

export default async function AboutPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: 'Running-Go 소개',
        intro: 'Running-Go는 지도 기반 러닝 코스를 만들고 수집하며, 실제 러닝 기록을 통해 즐길 수 있는 서비스입니다.',
        bullets: [
          '지도에서 코스를 탐색하고 바로 러닝을 시작할 수 있습니다.',
          '코스를 직접 만들고 다른 사용자와 공유할 수 있습니다.',
          '수집/랭킹/프로필 기능으로 러닝 활동을 기록하고 성장할 수 있습니다.',
        ],
        home: '홈으로',
      }
    : {
        title: 'About Running-Go',
        intro: 'Running-Go is a map-based running service where users can create, collect, and run courses with real activity records.',
        bullets: [
          'Discover courses on the map and start running immediately.',
          'Create your own courses and share them with other users.',
          'Track growth through collection, rankings, and profile features.',
        ],
        home: 'Back to Home',
      };

  return (
    <div className="rg-page p-4">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
        <h1 className="text-2xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.intro}</p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          {copy.bullets.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
        <div className="mt-6">
          <Link href="/">
            <Button variant="outline" className="rounded-full">{copy.home}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
