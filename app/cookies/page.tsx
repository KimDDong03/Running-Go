import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

export default async function CookiesPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: '쿠키 정책',
        intro: 'Running-Go는 서비스 동작과 언어 설정, 광고 동의 상태를 기억하기 위해 쿠키를 사용합니다.',
        items: [
          '필수 쿠키: 로그인 세션 및 보안 상태 유지',
          '기능 쿠키: 선택한 언어 및 UI 환경 저장',
          '광고 쿠키: 사용자 동의 시 광고 스크립트 로드 및 성과 측정',
          '사용자 제어: 브라우저 설정 또는 앱 내 동의 배너에서 변경 가능',
        ],
        home: '홈으로',
      }
    : {
        title: 'Cookie Policy',
        intro: 'Running-Go uses cookies for core functionality, language preferences, and ad consent management.',
        items: [
          'Essential cookies: session and security state',
          'Functional cookies: language and UI preferences',
          'Advertising cookies: loaded only after user consent',
          'User control: update choices via browser settings or in-app consent banner',
        ],
        home: 'Back to Home',
      };

  return (
    <div className="rg-page p-4">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
        <h1 className="text-2xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.intro}</p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          {copy.items.map((item) => (
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
