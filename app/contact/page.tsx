import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

const CONTACT_EMAIL = 'ehdrjs0887@gmail.com';

export default async function ContactPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: '문의하기',
        intro: '서비스 이용, 정책, 광고 관련 문의는 아래 이메일로 보내주세요.',
        response: '영업일 기준 2~3일 내 답변을 드립니다.',
        home: '홈으로',
      }
    : {
        title: 'Contact',
        intro: 'For service, policy, or advertising inquiries, please contact us via email.',
        response: 'We usually respond within 2-3 business days.',
        home: 'Back to Home',
      };

  return (
    <div className="rg-page p-4">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
        <h1 className="text-2xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.intro}</p>
        <p className="mt-4 text-sm font-medium text-slate-800">
          Email: <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p className="mt-2 text-sm text-slate-600">{copy.response}</p>
        <div className="mt-6">
          <Link href="/">
            <Button variant="outline" className="rounded-full">{copy.home}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
