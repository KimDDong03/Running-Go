'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { trpc } from '@/components/providers/TRPCProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { AdSlot } from '@/app/components/ads/AdSlot';
import { useLocale } from '@/app/components/providers/LocaleProvider';
import { getCollectorTier, getCreatorTier } from '@/lib/tier';
import { User } from 'lucide-react';

export default function ProfilePage() {
  const { locale } = useLocale();
  const { data: session, status: sessionStatus } = useSession();
  const { data, isLoading, isError, refetch } = trpc.profile.summary.useQuery(undefined, {
    enabled: sessionStatus === 'authenticated',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const updateAvatar = trpc.profile.updateAvatar.useMutation({
    onSuccess: async () => {
      toast.success(locale === 'en' ? 'Profile photo updated.' : '프로필 사진을 업데이트했어요');
      await refetch();
    },
    onError: (error) => {
      toast.error(error.message || (locale === 'en' ? 'Failed to save profile photo.' : '프로필 사진 저장에 실패했습니다'));
    },
  });
  const deleteAccount = trpc.profile.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success(isEnglish ? 'Account deleted.' : '회원 탈퇴가 완료되었습니다');
      await signOut({ callbackUrl: '/' });
    },
    onError: (error) => {
      toast.error(error.message || (isEnglish ? 'Failed to delete account.' : '회원 탈퇴에 실패했습니다'));
    },
  });
  const updateNickname = trpc.profile.updateNickname.useMutation({
    onSuccess: async () => {
      toast.success(isEnglish ? 'Nickname updated.' : '닉네임을 변경했어요');
      await refetch();
    },
    onError: (error) => {
      toast.error(error.message || (isEnglish ? 'Failed to update nickname.' : '닉네임 변경에 실패했습니다'));
    },
  });
  const isEnglish = locale === 'en';
  const collectorTier = getCollectorTier(data?.stats.collectedCourses ?? 0, isEnglish ? 'en' : 'ko');
  const creatorTier = getCreatorTier(data?.stats.createdCourses ?? 0, isEnglish ? 'en' : 'ko');
  const collectorNextRemaining = collectorTier.nextThreshold
    ? Math.max(0, collectorTier.nextThreshold - (data?.stats.collectedCourses ?? 0))
    : 0;
  const creatorNextRemaining = creatorTier.nextThreshold
    ? Math.max(0, creatorTier.nextThreshold - (data?.stats.createdCourses ?? 0))
    : 0;
  const hasMeaningfulProfileContent = Boolean(data) && (
    (data?.createdCoursePreview?.length ?? 0) > 0
    || (data?.stats.runCount ?? 0) > 0
    || (data?.stats.totalDistance ?? 0) > 0
    || (data?.stats.createdCourses ?? 0) > 0
    || (data?.stats.collectedCourses ?? 0) > 0
  );
  const canRenderProfileAd = !isLoading && !isError && !isDeleteDialogOpen && hasMeaningfulProfileContent;

  useEffect(() => {
    setNicknameDraft(data?.user.name ?? '');
  }, [data?.user.name]);

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
      <main className="rg-page-main rg-stagger p-4 pt-[calc(max(env(safe-area-inset-top),0.75rem)+2.75rem)] space-y-4">
        {sessionStatus !== 'authenticated' ? (
          <ErrorState
            title={isEnglish ? 'Sign-in required' : '로그인이 필요합니다'}
            message={isEnglish ? 'Please sign in to view your profile.' : '프로필을 보려면 로그인해 주세요'}
            actionLabel={isEnglish ? 'Sign in' : '로그인'}
            onAction={() => {
              window.location.href = '/login';
            }}
          />
        ) : isError ? (
          <ErrorState
            title={isEnglish ? 'Failed to load profile' : '프로필을 불러오지 못했습니다'}
            message={isEnglish ? 'Please try again shortly.' : '잠시 후 다시 시도해주세요'}
            actionLabel={isEnglish ? 'Retry' : '다시 시도'}
            onAction={() => refetch()}
          />
        ) : (
          <Card className="rounded-[26px] border border-white/70 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.6)]">
            <CardContent className="p-6 space-y-3">
              <div className="text-sm text-slate-500">{isEnglish ? 'Current account' : '현재 계정'}</div>
              <div className="text-xl font-semibold text-slate-900">
                {isLoading ? (isEnglish ? 'Loading...' : '불러오는 중...') : data?.user.name}
              </div>
              {!data?.user.isGuest && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={nicknameDraft}
                    onChange={(event) => setNicknameDraft(event.target.value)}
                    placeholder={isEnglish ? 'Set nickname' : '닉네임 설정'}
                    className="h-10 w-full min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rg-touch rg-press w-full rounded-full sm:w-auto sm:shrink-0"
                    disabled={
                      updateNickname.isPending
                      || nicknameDraft.trim().length < 2
                      || nicknameDraft.trim().length > 20
                      || nicknameDraft.trim() === (data?.user.name ?? '')
                    }
                    onClick={() => {
                      void updateNickname.mutateAsync({ name: nicknameDraft.trim() });
                    }}
                  >
                    {updateNickname.isPending
                      ? (isEnglish ? 'Saving...' : '저장 중...')
                      : (isEnglish ? 'Save Nickname' : '닉네임 저장')}
                  </Button>
                </div>
              )}
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
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
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
                    className="rg-touch rg-press w-full rounded-full sm:w-auto"
                    disabled={isAvatarProcessing || updateAvatar.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isAvatarProcessing || updateAvatar.isPending ? (isEnglish ? 'Uploading...' : '업로드 중...') : (isEnglish ? 'Change Photo' : '사진 변경')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rg-touch rg-press w-full rounded-full sm:w-auto"
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
                <div className="flex items-center gap-3 rounded-2xl border border-[#1d8fff]/22 bg-gradient-to-r from-[#e8f4ff] to-[#f4f9ff] p-3">
                  <div className="text-2xl">{collectorTier.icon}</div>
                  <div>
                    <div className="text-sm text-[#0f5fd7]">{isEnglish ? 'Collector Tier' : '탐험가 등급(수집)'}</div>
                    <div className="text-base font-semibold text-slate-900">{collectorTier.name}</div>
                    {collectorTier.nextThreshold && (
                      <div className="text-xs text-slate-600">
                        {isEnglish ? `Next tier in ${collectorNextRemaining}` : `다음 등급까지 ${collectorNextRemaining}개`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[#67c93a]/30 bg-gradient-to-r from-[#f2fbe8] to-[#f8fcf1] p-3">
                  <div className="text-2xl">{creatorTier.icon}</div>
                  <div>
                    <div className="text-sm text-[#3f8f1c]">{isEnglish ? 'Creator Tier' : '설계자 등급(제작)'}</div>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="rg-touch rg-press rounded-full"
                    onClick={() => {
                      void signOut({ callbackUrl: '/' });
                    }}
                  >
                    {isEnglish ? 'Sign out' : '로그아웃'}
                  </Button>

                  <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="rg-touch rg-press rounded-full"
                      >
                        {isEnglish ? 'Delete Account' : '회원 탈퇴'}
                      </Button>
                    </DialogTrigger>
          <DialogContent className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.65)]">
                      <DialogHeader>
            <DialogTitle className="text-slate-900">
                          {isEnglish ? 'Delete account?' : '회원 탈퇴를 진행할까요?'}
                        </DialogTitle>
            <DialogDescription className="text-slate-600">
                          {isEnglish
                            ? 'This action permanently removes your account data and cannot be undone. Enter your email and type DELETE to continue.'
                            : '탈퇴 시 계정 데이터가 영구 삭제되며 복구할 수 없습니다. 진행하려면 이메일과 DELETE를 입력하세요.'}
                        </DialogDescription>
                      </DialogHeader>

                      <input
                        value={deleteConfirmEmail}
                        onChange={(event) => setDeleteConfirmEmail(event.target.value)}
                        placeholder={session?.user?.email ?? 'you@example.com'}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />

                      <input
                        value={deleteConfirmText}
                        onChange={(event) => setDeleteConfirmText(event.target.value)}
                        placeholder="DELETE"
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />

                      <DialogFooter>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setIsDeleteDialogOpen(false);
                            setDeleteConfirmText('');
                            setDeleteConfirmEmail('');
                          }}
                        >
                          {isEnglish ? 'Cancel' : '취소'}
                        </Button>
                        <Button
                          variant="destructive"
                          className="rounded-full"
                          disabled={
                            deleteConfirmText !== 'DELETE'
                            || deleteConfirmEmail.trim().toLowerCase() !== (session?.user?.email ?? '').toLowerCase()
                            || deleteAccount.isPending
                          }
                          onClick={() => {
                            void deleteAccount.mutateAsync({
                              confirmText: deleteConfirmText,
                              confirmEmail: deleteConfirmEmail,
                            }).then(() => {
                              setDeleteConfirmText('');
                              setDeleteConfirmEmail('');
                            });
                          }}
                        >
                          {deleteAccount.isPending
                            ? (isEnglish ? 'Deleting...' : '탈퇴 처리 중...')
                            : (isEnglish ? 'Delete' : '탈퇴하기')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
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

        {canRenderProfileAd ? (
          <AdSlot className="rounded-2xl border border-white/70 bg-white/80 px-2 py-1" format="horizontal" />
        ) : null}

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
