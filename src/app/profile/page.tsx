'use client';

import { type ChangeEvent, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { getCollectorTier, getCreatorTier } from '@/lib/tier';
import { ChevronLeft, User } from 'lucide-react';

export default function ProfilePage() {
  const { locale } = useLocale();
  const { data, isLoading, isError, refetch } = trpc.profile.summary.useQuery();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false);
  const updateAvatar = trpc.profile.updateAvatar.useMutation({
    onSuccess: async () => {
      toast.success(locale === 'en' ? 'Profile photo updated.' : '프로필 사진을 업데이트했어요');
      await refetch();
    },
    onError: (error) => {
      toast.error(error.message || (locale === 'en' ? 'Failed to save profile photo.' : '프로필 사진 저장에 실패했습니다'));
    },
  });
  const isEnglish = locale === 'en';
  const collectorTier = getCollectorTier(data?.stats.collectedCourses ?? 0);
  const creatorTier = getCreatorTier(data?.stats.createdCourses ?? 0);
  const collectorNextRemaining = collectorTier.nextThreshold
    ? Math.max(0, collectorTier.nextThreshold - (data?.stats.collectedCourses ?? 0))
    : 0;
  const creatorNextRemaining = creatorTier.nextThreshold
    ? Math.max(0, creatorTier.nextThreshold - (data?.stats.createdCourses ?? 0))
    : 0;

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs <= 0) return isEnglish ? `${mins}m` : `${mins}분`;
    return isEnglish ? `${hrs}h ${mins}m` : `${hrs}시간 ${mins}분`;
  };

  const toDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(isEnglish ? 'Failed to read file.' : '파일을 읽지 못했습니다'));
      reader.readAsDataURL(file);
    });
  };

  const resizeAvatarImage = async (dataUrl: string) => {
    const image = new window.Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(isEnglish ? 'Failed to process image.' : '이미지 처리를 실패했습니다'));
      image.src = dataUrl;
    });

    const maxSize = 320;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error(isEnglish ? 'Unable to prepare image canvas.' : '이미지 캔버스를 준비하지 못했습니다');
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL('image/jpeg', 0.84);
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error(isEnglish ? 'Only image files can be uploaded.' : '이미지 파일만 업로드할 수 있어요');
      return;
    }

    setIsAvatarProcessing(true);

    try {
      const originalDataUrl = await toDataUrl(file);
      const resizedDataUrl = await resizeAvatarImage(originalDataUrl);
      await updateAvatar.mutateAsync({ image: resizedDataUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : (isEnglish ? 'Failed to save profile photo.' : '프로필 사진 저장에 실패했습니다');
      toast.error(message);
    } finally {
      setIsAvatarProcessing(false);
    }
  };

  return (
    <div className="rg-page">
      <header className="rg-page-header px-4 py-5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rg-touch-icon rg-press rounded-full">
              <ChevronLeft className="w-6 h-6" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{isEnglish ? 'Profile' : '프로필'}</h1>
        </div>
      </header>

      <main className="rg-page-main rg-stagger p-4 space-y-4">
        {isError && (
          <ErrorState
            title={isEnglish ? 'Failed to load profile' : '프로필을 불러오지 못했습니다'}
            message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
            actionLabel={isEnglish ? 'Retry' : '다시 시도'}
            onAction={() => refetch()}
          />
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm text-slate-500">{isEnglish ? 'Current account' : '현재 계정'}</div>
              <div className="text-xl font-semibold text-slate-900">
                {isLoading ? (isEnglish ? 'Loading...' : '불러오는 중...') : data?.user.name}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 p-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/80 bg-slate-100">
                  {data?.user.image ? (
                    <Image src={data.user.image} alt="프로필" fill unoptimized className="object-cover" sizes="56px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rg-touch rg-press rounded-full"
                    disabled={isAvatarProcessing || updateAvatar.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isAvatarProcessing || updateAvatar.isPending ? (isEnglish ? 'Uploading...' : '업로드 중...') : (isEnglish ? 'Change Photo' : '사진 변경')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rg-touch rg-press rounded-full"
                    disabled={isAvatarProcessing || updateAvatar.isPending || !data?.user.image}
                    onClick={() => {
                      void updateAvatar.mutateAsync({ image: null });
                    }}
                  >
                    {isEnglish ? 'Reset' : '기본'}
                  </Button>
                </div>
              </div>
              {data?.user.isGuest && (
                <div className="text-sm text-slate-500">
                  {isEnglish
                    ? 'You are using guest mode. Sign in to preserve your records across devices.'
                    : '게스트 모드로 이용 중입니다. 로그인하면 기기 변경 시에도 기록을 보존할 수 있어요.'}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 to-cyan-50/80 p-3">
                  <div className="text-2xl">{collectorTier.icon}</div>
                  <div>
                    <div className="text-sm text-sky-700">{isEnglish ? 'Collector Tier' : '탐험가 등급(수집)'}</div>
                    <div className="text-base font-semibold text-slate-900">{collectorTier.name}</div>
                    {collectorTier.nextThreshold && (
                      <div className="text-xs text-slate-600">
                        {isEnglish ? `Next tier in ${collectorNextRemaining}` : `다음 등급까지 ${collectorNextRemaining}개`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 p-3">
                  <div className="text-2xl">{creatorTier.icon}</div>
                  <div>
                    <div className="text-sm text-emerald-700">{isEnglish ? 'Creator Tier' : '설계자 등급(제작)'}</div>
                    <div className="text-base font-semibold text-slate-900">{creatorTier.name}</div>
                    {creatorTier.nextThreshold && (
                      <div className="text-xs text-slate-600">
                        {isEnglish ? `Next tier in ${creatorNextRemaining}` : `다음 등급까지 ${creatorNextRemaining}개`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {data?.user.isGuest && (
                <div>
                  <Link href="/login">
                    <Button className="rg-touch rg-press rounded-full">{isEnglish ? 'Sign in' : '로그인'}</Button>
                  </Link>
                </div>
              )}
              {!data?.user.isGuest && (
                <div>
                  <Button
                    variant="outline"
                    className="rg-touch rg-press rounded-full"
                    onClick={() => {
                      void signOut({ callbackUrl: '/' });
                    }}
                  >
                    {isEnglish ? 'Sign out' : '로그아웃'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500">{isEnglish ? 'Created Courses' : '제작 코스'}</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.createdCourses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{isEnglish ? 'Collected Courses' : '수집 코스'}</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.collectedCourses}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{isEnglish ? 'Runs' : '러닝 횟수'}</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : data?.stats.runCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{isEnglish ? 'Total Time' : '누적 시간'}</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {isLoading ? '-' : formatDuration(data?.stats.totalDuration ?? 0)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white/80 border border-white/70 p-4 text-center">
                <div className="text-xs text-slate-500">{isEnglish ? 'Total Distance' : '누적 거리'}</div>
                <div className="text-3xl font-semibold text-slate-900">
                  {isLoading ? '-' : `${(data?.stats.totalDistance ?? 0).toFixed(1)}km`}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isError && (
          <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
        )}

        {!isError && (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">{isEnglish ? 'My Courses' : '내가 만든 코스'}</h2>
                <span className="text-xs text-slate-500">{isEnglish ? 'Recent 3' : '최근 3개'}</span>
              </div>
              {data?.createdCoursePreview?.length ? (
                <div className="space-y-3">
                  {data.createdCoursePreview.map((course) => (
                    <Link key={course.id} href={`/courses/${course.id}`}>
                      <div className="rg-interactive-card flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{course.title}</div>
                          <div className="text-xs text-slate-500">{course.totalDistance.toFixed(1)}km · ❤️ {course.likeCount}</div>
                        </div>
                        <span className="text-xs text-slate-400">{isEnglish ? 'View' : '보기'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">{isEnglish ? 'No created courses yet.' : '아직 만든 코스가 없습니다'}</div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
