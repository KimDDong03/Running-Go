import Link from 'next/link';
import { MapPinned, Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { resolveRequestLocale } from '@/lib/i18n/locale';

const COLOR_TOKENS = [
  { name: '--rg-primary', color: '#1d8fff' },
  { name: '--rg-primary-deep', color: '#0f5fd7' },
  { name: '--rg-accent', color: '#67c93a' },
  { name: '--rg-highlight', color: '#ffb020' },
  { name: '--rg-ink', color: '#102449' },
  { name: '--rg-route', color: '#ff5a36' },
] as const;

export default async function DesignPage() {
  const locale = await resolveRequestLocale();
  const isEnglish = locale === 'en';

  const copy = isEnglish
    ? {
        eyebrow: 'Running-Go Design Direction',
        title: 'Map Adventure UI Kit',
        desc: 'A playful map-first visual layer with strong readability, designed for both desktop and mobile.',
        ctaPrimary: 'Apply to Home',
        ctaSecondary: 'Back to Courses',
        sectionToken: 'Color Tokens',
        sectionType: 'Typography',
        sectionControls: 'Buttons + Cards',
        mobileLabel: 'Mobile Preview',
        typoLead: 'Mission complete starts with one route.',
        typoBody: 'Use clean information hierarchy while adding toy-like visual feedback and route motifs.',
        featuredTitle: 'Today\'s Running Mission',
        featuredDesc: 'Follow the smile route, pass 3 checkpoints, and collect one new landmark badge.',
        startRun: 'Start Run',
        saveForLater: 'Save for Later',
      }
    : {
        eyebrow: 'Running-Go 디자인 방향',
        title: '맵 어드벤처 UI 키트',
        desc: '밝고 경쾌한 지도 중심 톤을 유지하면서도 정보 가독성을 지키는 데스크톱/모바일 공용 시안입니다.',
        ctaPrimary: '홈에 적용하기',
        ctaSecondary: '코스로 돌아가기',
        sectionToken: '컬러 토큰',
        sectionType: '타이포 그래피',
        sectionControls: '버튼 + 카드 시안',
        mobileLabel: '모바일 프리뷰',
        typoLead: '한 번의 루트가 오늘의 완주를 만든다.',
        typoBody: '정보 구조는 명확하게 유지하고, 경로 모티프와 장난감 같은 피드백으로 재미를 강화합니다.',
        featuredTitle: '오늘의 러닝 미션',
        featuredDesc: '스마일 루트를 따라 체크포인트 3곳을 통과하고 신규 랜드마크 뱃지 1개를 획득하세요.',
        startRun: '러닝 시작',
        saveForLater: '나중에 저장',
      };

  return (
    <div className="rg-page rg-pop-bg p-4 md:p-8">
      <div className="rg-page-main space-y-6 md:space-y-8">
        <section className="rg-map-pop-card overflow-hidden rounded-[30px] p-6 md:p-8">
          <div className="rg-map-grid rounded-2xl border border-[#102449]/10 bg-white/68 p-5 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f72c6]">{copy.eyebrow}</p>
            <h1 className="rg-pop-display mt-3 text-3xl font-black md:text-5xl">{copy.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700 md:text-base">{copy.desc}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="mapPop" className="h-11 rounded-full px-6">{copy.ctaPrimary}</Button>
              <Link href="/courses">
                <Button variant="mapPopOutline" className="h-11 rounded-full px-6">{copy.ctaSecondary}</Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Card tone="mapPop" className="rounded-[28px] py-5">
            <CardHeader className="px-5 md:px-6">
              <CardTitle className="text-base font-bold text-[#102449]">{copy.sectionToken}</CardTitle>
              <CardDescription className="text-slate-600">brand token set for map adventure mood</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 md:px-6">
              {COLOR_TOKENS.map((token) => (
                <div key={token.name} className="rounded-2xl border border-[#102449]/12 bg-white/80 p-3">
                  <div className="h-10 rounded-xl" style={{ backgroundColor: token.color }} />
                  <p className="mt-2 text-xs font-semibold text-[#102449]">{token.name}</p>
                  <p className="text-xs text-slate-500">{token.color}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card tone="mapPop" className="rounded-[28px] py-5">
            <CardHeader className="px-5 md:px-6">
              <CardTitle className="text-base font-bold text-[#102449]">{copy.sectionType}</CardTitle>
              <CardDescription className="text-slate-600">display style + readable body style</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 md:px-6">
              <p className="rg-pop-display text-2xl font-black leading-tight text-[#102449] md:text-3xl">{copy.typoLead}</p>
              <p className="text-sm leading-6 text-slate-700">{copy.typoBody}</p>
              <div className="rg-route-line h-8 rounded-full" />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card tone="mapPop" className="rounded-[30px] py-5">
            <CardHeader className="px-5 md:px-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-bold text-[#102449]">{copy.sectionControls}</CardTitle>
                <Badge className="border border-[#102449]/20 bg-white text-[#102449]">UI Sample</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 md:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="mapPop" className="h-12 rounded-2xl"><Sparkles className="size-4" />{copy.startRun}</Button>
                <Button variant="mapPopOutline" className="h-12 rounded-2xl"><MapPinned className="size-4" />{copy.saveForLater}</Button>
              </div>
              <div className="rounded-2xl border border-[#102449]/14 bg-white/78 p-4">
                <p className="text-sm font-bold text-[#102449]">{copy.featuredTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{copy.featuredDesc}</p>
              </div>
            </CardContent>
            <CardFooter className="px-5 md:px-6">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Trophy className="size-3.5 text-[#ffb020]" />
                <span>Gamification feedback + clear hierarchy</span>
              </div>
            </CardFooter>
          </Card>

          <Card tone="mapPop" className="mx-auto w-full max-w-[330px] rounded-[34px] py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-bold text-[#102449]">{copy.mobileLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div className="rounded-[22px] border-2 border-[#102449]/16 bg-white/80 p-3">
                <div className="h-28 rounded-2xl bg-[linear-gradient(135deg,#d9f5ff_0%,#f0fbff_55%,#e9ffe9_100%)]" />
                <div className="mt-3 flex items-center gap-2">
                  <Badge className="bg-[#1d8fff] text-white">4.8km</Badge>
                  <Badge className="bg-[#67c93a] text-[#102449]">Fun Route</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="mapPop" size="sm" className="rounded-xl">Go</Button>
                  <Button variant="mapPopOutline" size="sm" className="rounded-xl">Save</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
