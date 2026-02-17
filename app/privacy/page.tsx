import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

export default async function PrivacyPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: '개인정보처리방침',
        intro: 'Running-Go는 서비스 제공을 위해 최소한의 개인정보를 수집하며, 관련 법령을 준수합니다.',
        items: [
          '수집 항목: 로그인 식별자, 프로필 이미지, 러닝/코스 생성 데이터',
          '이용 목적: 계정 인증, 코스 저장/조회, 랭킹 및 통계 제공',
          '보관 기간: 서비스 탈퇴 요청 전까지 또는 법정 보관 기간',
          '제3자 제공: 법령상 의무 또는 사용자 동의가 있는 경우에 한함',
        ],
        home: '홈으로',
      }
    : {
        title: 'Privacy Policy',
        intro: 'Running-Go collects the minimum personal data needed to operate the service and complies with applicable laws.',
        items: [
          'Collected data: sign-in identifier, profile image, running/course records',
          'Purpose: account authentication, course storage, rankings and analytics',
          'Retention: until account deletion request or legal retention period',
          'Third-party sharing: only when legally required or explicitly consented',
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
