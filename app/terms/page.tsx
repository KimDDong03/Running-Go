import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

export default async function TermsPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: '이용약관',
        intro: 'Running-Go 이용 시 아래 조건에 동의한 것으로 간주됩니다.',
        items: [
          '서비스 제공을 위해 필요한 범위에서 계정/러닝 데이터를 처리합니다.',
          '불법 콘텐츠, 타인 권리 침해, 서비스 운영 방해 행위는 금지됩니다.',
          '운영 정책 위반 시 콘텐츠 제한 또는 계정 제한이 적용될 수 있습니다.',
          '서비스/정책 변경 시 본 페이지를 통해 고지할 수 있습니다.',
        ],
        home: '홈으로',
      }
    : {
        title: 'Terms of Service',
        intro: 'By using Running-Go, you agree to the terms below.',
        items: [
          'We process account and running data only as needed to provide the service.',
          'Illegal content, rights infringement, and service abuse are prohibited.',
          'Violations may result in content restrictions or account limitations.',
          'Service and policy updates may be announced on this page.',
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
