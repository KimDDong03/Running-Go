import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { resolveRequestLocale } from '@/lib/i18n/locale';

export default async function FaqPage() {
  const locale = await resolveRequestLocale();
  const copy = locale === 'ko'
    ? {
        title: '자주 묻는 질문',
        items: [
          {
            q: '코스 생성에서 마커를 어떻게 삭제하나요?',
            a: '지도 위 마커를 탭하면 해당 지점이 삭제되고 경로가 다시 계산됩니다.',
          },
          {
            q: '라인 드로잉 모드는 어떻게 사용하나요?',
            a: '라인 드로잉으로 동선을 그린 뒤 "경로로 적용"을 누르면 보행 경로로 변환됩니다.',
          },
          {
            q: '광고가 보이지 않아요.',
            a: '광고 동의를 하지 않았거나 AdSense 심사/전파 상태에 따라 노출이 지연될 수 있습니다.',
          },
        ],
        home: '홈으로',
      }
    : {
        title: 'FAQ',
        items: [
          {
            q: 'How do I remove a marker while creating a course?',
            a: 'Tap a marker on the map to remove that waypoint and rebuild the route.',
          },
          {
            q: 'How do I use Draw Mode?',
            a: 'Draw a path on the map, then tap "Apply Route" to convert it into a walkable route.',
          },
          {
            q: 'Why are ads not showing?',
            a: 'Ads may be hidden if consent is not granted, or while AdSense review/propagation is still in progress.',
          },
        ],
        home: 'Back to Home',
      };

  return (
    <div className="rg-page p-4">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
        <h1 className="text-2xl font-semibold text-slate-900">{copy.title}</h1>
        <div className="mt-5 space-y-4">
          {copy.items.map((item) => (
            <div key={item.q} className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">Q. {item.q}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">A. {item.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="/">
            <Button variant="outline" className="rounded-full">{copy.home}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
